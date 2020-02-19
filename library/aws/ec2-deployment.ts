import * as _ from 'lodash';
import * as TF from '../../core/core';
import * as AT from '../../providers/aws/types';
import * as AR from '../../providers/aws/resources';

import * as aws from './aws';
import * as roles from './roles';
import * as alarms from './alarms';
import * as policies from './policies';
import * as shared from './shared';
import * as util from '../util';
import * as s3 from './s3';
import * as bootscript from '../bootscript';
import * as docker from '../docker';
import * as camus2 from '../camus2/camus2';
import * as C from '../../library/camus2/adl-gen/config';

import * as deploytool from '../deploytool_legacy/deploytool';
import * as DC from '../../library/deploytool_legacy/adl-gen/config';

/**
 *  Creates a logical deployment on a single EC2 instance, including:
 *
 *      - the EC2 instance itself
 *      - a letsencrypt SSL certificate for configured endpoints
 *      - DNS entries for the endpoints
 *
 * hx-deploy-tool is configured onto the instance, running in local proxy mode,
 * with a local nginx instance to support green/blue style deploys.
 */
export function createEc2Deployment(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  params: Ec2DeploymentParams
): Ec2Deployment {
  const dns_ttl = (params.dns_ttl || 180) + '';

  // Build the bootscript for the instance
  const bs = bootscript.newBootscript();
  const app_user = params.app_user || 'app';
  const docker_config = params.docker_config || docker.DEFAULT_CONFIG;
  let deploy_contexts: camus2.DeployContext[];
  if (params.deploy_contexts) {
    deploy_contexts = params.deploy_contexts;
  } else {
    deploy_contexts = [];
  }

  bs.utf8Locale();
  bs.dockerWithConfig(docker_config);
  bs.createUserWithKeypairAccess(app_user);
  bs.extendUserShellProfile(app_user, 'PATH="/opt/bin:$PATH"');
  bs.addUserToGroup(app_user, 'docker');
  bs.cloudwatchMetrics(app_user);

  const proxy_endpoints = deployToolEndpoints(sr, params.endpoints);

  const health_check = undefined;

  if (params.use_hxdeploytool) {
    const legacy_proxy_endpoints: DC.EndPoint[] = [];
    for(const label of Object.keys(proxy_endpoints)) {
      const pe = proxy_endpoints[label];
      legacy_proxy_endpoints.push({
        ...pe,
        label,
      });
    }
    

    bs.include(
      // Legacy hx-deploytool support
      deploytool.install(
        app_user,
        params.releases_s3,
        deploy_contexts,
        deploytool.localProxy(legacy_proxy_endpoints),
        health_check,
        params.frontendproxy_nginx_conf_tpl,
        params.ssl_cert_email,
        params.letsencrypt_challenge_type
      )
    );
  } else {
    bs.include(
      camus2.install(
        app_user,
        params.releases_s3,
        deploy_contexts,
        camus2.localProxy(proxy_endpoints),
        health_check,
        params.frontendproxy_nginx_conf_tpl,
        params.ssl_cert_email,
        params.letsencrypt_challenge_type
      )
    );
  }

  if (params.extra_bootscript) {
    bs.include(params.extra_bootscript);
  }

  let iampolicies = [
    policies.publish_metrics_policy,
    aws.s3DeployBucketReadOnlyPolicy(sr),
    policies.route53ModifyZonePolicy('modifydns', sr.primary_dns_zone),
  ];
  if (params.extra_policies) {
    iampolicies = iampolicies.concat(params.extra_policies);
  }

  const instance_profile = roles.createInstanceProfileWithPolicies(
    tfgen,
    name,
    iampolicies
  );

  const appserver = aws.createInstanceWithEip(tfgen, name, sr, {
    instance_type: params.instance_type,
    ami: params.ami || getDefaultAmi,
    security_group: sr.appserver_security_group,
    key_name: params.key_name,
    customize_instance: (i: AR.InstanceParams) => {
      i.user_data = bs.compile();
      i.iam_instance_profile = instance_profile.id;
      if (params.customize) {
        params.customize(i);
      }
    },
  });

  params.endpoints.forEach(ep => {
    ep.urls.forEach((url, i) => {
      if (url.kind === 'https') {
        shared.dnsARecord(
          tfgen,
          name + '_' + ep.name + '_' + i,
          sr,
          url.dnsname,
          [appserver.eip.public_ip],
          dns_ttl
        );
      }
    });
  });

  // Create a canonical DNS record for the ec2 box (independent of switchable endpoints)
  if (params.public_dns_name !== undefined) {
    shared.dnsARecord(
      tfgen,
      name,
      sr,
      params.public_dns_name,
      [appserver.eip.public_ip],
      dns_ttl
    );
  }

  return appserver;
}

/**
 * Get the fully qualified domain names for all https urls.
 * (eg to use to generate a certificate)
 *
 */
export function httpsFqdnsFromEndpoints(
  sr: shared.SharedResources,
  endpoints: EndPoint[]
): string[] {
  const https_fqdns: string[] = [];
  endpoints.forEach(ep => {
    ep.urls.forEach(url => {
      if (url.kind === 'https') {
        https_fqdns.push(shared.fqdn(sr, url.dnsname));
      } else if (url.kind === 'https-external') {
        https_fqdns.push(url.fqdnsname);
      }
    });
  });
  return https_fqdns;
}

export function endpointUrl(
  sr: shared.SharedResources,
  url: EndPointUrl
): string {
  switch (url.kind) {
    case 'https':
      return 'https://' + shared.fqdn(sr, url.dnsname);
    case 'https-external':
      return 'https://' + url.fqdnsname;
    case 'http':
      return 'http://' + url.fqdnsname;
  }
}

export function deployToolEndpoints(
  sr: shared.SharedResources,
  endpoints: EndPoint[]
): camus2.EndPointMap {
  const endPointMap: camus2.EndPointMap = {};

  endpoints.forEach(ep => {
    const http_fqdns: string[] = [];
    const https_fqdns: string[] = [];
    ep.urls.forEach(url => {
      if (url.kind === 'https') {
        https_fqdns.push(shared.fqdn(sr, url.dnsname));
        if (url.proxied_from !== undefined) {
          url.proxied_from.forEach(fqdns => https_fqdns.push(fqdns));
        }
      } else if (url.kind === 'https-external') {
        https_fqdns.push(url.fqdnsname);
        if (url.proxied_from !== undefined) {
          url.proxied_from.forEach(fqdns => https_fqdns.push(fqdns));
        }
      } else if (url.kind === 'http') {
        http_fqdns.push(url.fqdnsname);
      }
    });
    if (https_fqdns.length > 0) {
      endPointMap[ep.name] = camus2.httpsProxyEndpoint(ep.name, https_fqdns);
    } else {
      endPointMap[ep.name] = camus2.httpProxyEndpoint(ep.name, http_fqdns);
    }
  });

  return endPointMap;
}

export interface Ec2DeploymentParams {
  /**
   * The AWS keyname used for the EC2 instance.
   */
  key_name: AT.KeyName;

  /**
   * The AWS instance type (ie mem and cores) for the EC2 instance.
   */
  instance_type: AT.InstanceType;

  /**
   * The DNS name of the machine. Only required if we need to provide the client an unchanging DNS name
   * they can cname to (that is, one of the endpoints is https-external)
   */
  public_dns_name?: string;

  /**
   * The email address for SSL certificate admin and notification.
   */
  ssl_cert_email: string;

  /**
   * The S3 location where hx-deploy-tool releases are stored.
   */
  releases_s3: s3.S3Ref;

  /**
   * The name of the unprivileged user used to run application code.
   * Defaults to "app".
   */
  app_user?: string;

  /**
   * The endpoints configured for http/https access. Defaults to
   *    main:   ${dns_name}.${primary_dns_zone}
   *    test:   ${dns_name}-test.${primary_dns_zone}
   */
  endpoints: EndPoint[];

  /**
   * Specifies the AMI for the EC2 instance. Defaults to an ubuntu 16.04 AMI
   * for the appropriate region.
   */
  ami?(region: AT.Region): AT.Ami;

  /**
   * The EC2 instance created is given an IAM profile with sufficient access policies to
   * log metrics, run the deploy tool and create SSL certificates. Additional policies
   * can be specified here.
   */
  extra_policies?: policies.NamedPolicy[];

  /**
   * The context files are fetched from S3 and made available to hx-deploy-tool for interpolation
   * into the deployed application configuration.
   */
  deploy_contexts?: {name: string, source: C.JsonSource}[];

  /**
   * Additional operations for the EC2 instances first boot can be passed vis the operation.
   */
  extra_bootscript?: bootscript.BootScript;

  /**
   * Override the default docker config.
   */
  docker_config?: docker.DockerConfig;

  /**
   * Set the letsencrypt DNS challenge mode
   *
   * If the endpoints require an SSL certificate to be created via letsencrypt,
   * this controls the challenge mechanism. http-01 challenges have the
   * benefit that they can be used to generate certificates for domains without
   * dns control. dns-01 challenges have the benefit that they can be generated
   * off-line, ie the system doesn't need to be connected via dns before certs
   * can be generated.
   */

  letsencrypt_challenge_type?: 'http-01' | 'dns-01';

  /**
   * Specify the DNS ttl value.
   *
   * This defaults to 3 minutes, on the assumption that when initially being setup
   * a short TTL is useful to ensure the fast propagation of changes. Once a system
   * has stabilised this should be increased to a much larger value.
   *
   * (eg see http://social.dnsmadeeasy.com/blog/long-short-ttls)
   */
  dns_ttl?: number;

  /**
   *  Customize the ec2 instance, overriding defaults as required
   */
  customize?: util.Customize<AR.InstanceParams>;

  /**
   * Substitute the default nginx template used.
   */
  frontendproxy_nginx_conf_tpl?: string;

  /**
   * Use legacy hx-deploy-tool. If not specified, camus2
   * will be used
   */
   use_hxdeploytool?: boolean;
}

// An Endpoint consists of a name and one or more connected
// URLs.
export interface EndPoint {
  name: string;
  urls: EndPointUrl[];
}

export type EndPointUrl =
  | EndPointHttpsUrl
  | EndPointHttpUrl
  | EndPointHttpsExternalUrl;

// An http endpoint
export interface EndPointHttpUrl {
  kind: 'http';
  fqdnsname: string;
}

// An https endpoints in the repo shared DNS zone:
//  - A DNS entry in the shared zone WILL be created
//  - The fq dns name WILL be included on the SSL certificate
//  - The fq dns name WILL be used for host routing in the hx-deploy-tool controlled nginx
//  - Any of the fq dns names in proxied_from WILL also be used for host routing
//
export interface EndPointHttpsUrl {
  kind: 'https';
  dnsname: string;
  proxied_from?: string[];
}

// An https endpoints for an externally configured dns entry
//  - A DNS entry in the shared zone WILL NOT be created
//  - The fq dns name WILL be included on the SSL certificate
//  - The fq dns name WILL be used for host routing in the hx-deploy-tool controlled nginx
//  - Any of the fq dns names in proxied_from WILL also be used for host routing
//
export interface EndPointHttpsExternalUrl {
  kind: 'https-external';
  fqdnsname: string;
  proxied_from?: string[];
}

export interface Ec2Deployment {
  eip: AR.Eip;
  ec2: AR.Instance;
}

/**
 * Standard ubuntu base AMIs.
 *
 * (ubuntu xenial, hvm:ebs-ssd, EBS General purpose SSD, x86)
 */
export function getDefaultAmi(region: AT.Region): AT.Ami {
  if (region.value === AT.ap_southeast_2.value) {
    return AT.ami('ami-47c21a25');
  }
  if (region.value === AT.us_east_1.value) {
    return AT.ami('ami-03a935aafa6b52b97');
  }
  if (region.value === AT.us_east_2.value) {
    return AT.ami('ami-5e8bb23b');
  }
  if (region.value === AT.ca_central_1.value) {
    return AT.ami('ami-01957f6afe4e49edd');
  }
  if (region.value === AT.eu_west_2.value) {
    return AT.ami('ami-0fab23d0250b9a47e');
  }
  throw new Error('No AMI specified for region ' + region.value);
}
