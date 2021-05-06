import { DEFAULT_NGINX_DOCKER_VERSION } from './defaults';
import * as _ from 'lodash';
import * as TF from '../../core/core';
import * as AT from '../../providers/aws/types';
import * as AR from '../../providers/aws/resources';

import * as aws from './aws';
import * as roles from './roles';
import * as policies from './policies';
import * as shared from './shared';
import * as util from '../util';
import * as s3 from './s3';
import * as bootscript from '../bootscript';
import * as docker from '../docker';
import * as camus2 from '../camus2/camus2';
import * as C from '../../library/camus2/adl-gen/config';

/**
 *  Creates a logical deployment on a single publicly addressable EC2 instance, including:
 *
 *      - the EC2 instance itself
 *      - a letsencrypt SSL certificate for configured endpoints
 *      - DNS entries for the endpoints
 *
 * camus2 is configured onto the instance, running in local proxy mode,
 * with a local nginx instance to support green/blue style deploys.
 */
export function createEc2Deployment(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  params: Ec2ExternalDeploymentParams,
): Ec2Deployment {
  const letsencrypt_challenge_type = params.letsencrypt_challenge_type
    ? params.letsencrypt_challenge_type
    : "http-01";
  const bs = createBuildScript(sr, params, letsencrypt_challenge_type);
  const instance_profile = createIamInstanceProfile(tfgen, name, sr, params);
  const appserver = aws.createInstanceWithEip(tfgen, name, sr, params.subnet_id, {
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
  addDNS(tfgen, name, sr, params, appserver.eip.public_ip, params.public_dns_name);
  return appserver;
}

export function createInternalEc2Deployment(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  params: Ec2InternalDeploymentParams,
): AR.Instance {
  const bs = createBuildScript(sr, params, "dns-01");
  const instance_profile = createIamInstanceProfile(tfgen, name, sr, params);
  const appserver = aws.createInstance(tfgen, name, sr, params.subnet_id, {
    instance_type: params.instance_type,
    ami: params.ami || getDefaultAmi,
    security_group: sr.internal_security_group,
    key_name: params.key_name,
    customize_instance: (i: AR.InstanceParams) => {
      i.user_data = bs.compile();
      i.iam_instance_profile = instance_profile.id;
      if (params.customize) {
        params.customize(i);
      }
    },
  });
  addDNS(tfgen, name, sr, params, appserver.private_ip, params.dns_name);
  return appserver;
}


function addDNS(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  params: Ec2InstanceDeploymentParams,
  ip_address: AT.IpAddress,
  dns_name?: string,
) {
  const dns_ttl = (params.dns_ttl || 180) + '';
  params.endpoints.forEach(ep => {
    ep.urls.forEach((url, i) => {
      if (url.kind === 'https') {
        shared.dnsARecord(
          tfgen,
          name + '_' + ep.name + '_' + i,
          sr,
          url.dnsname,
          [ip_address],
          dns_ttl
        );
      }
    });
  });
  // Create a canonical DNS record for the ec2 box (independent of switchable endpoints)
  if (dns_name !== undefined) {
    shared.dnsARecord(
      tfgen,
      name,
      sr,
      dns_name,
      [ip_address],
      dns_ttl
    );
  }
}

// Build the bootscript for the instance
function createBuildScript(
  dr: shared.DomainResources,
  params: Ec2InstanceDeploymentParams,
  letsencrypt_challenge_type: 'http-01' | 'dns-01',
): bootscript.BootScript {
  const app_user = params.app_user || 'app';
  const docker_config = params.docker_config || docker.DEFAULT_CONFIG;
  const bs = bootscript.newBootscript();
  const include_install = params.bootscript_include_install === undefined ? true : params.bootscript_include_install;
  if (include_install) {
    bs.include(ec2InstallScript(app_user, docker_config, false));
  }
  let deploy_contexts: camus2.DeployContext[];
  if (params.deploy_contexts) {
    deploy_contexts = params.deploy_contexts;
  } else {
    deploy_contexts = [];
  }
  const proxy_endpoints = deployToolEndpoints(dr, params.endpoints);
  const health_check = undefined;
  bs.include(
    camus2.configureCamus2({
      username: app_user,
      releases: params.releases_s3,
      deployContexts: deploy_contexts,
      proxy: camus2.localProxy(proxy_endpoints, letsencrypt_challenge_type),
      nginxDockerVersion: params.nginxDockerVersion === undefined
          ? DEFAULT_NGINX_DOCKER_VERSION : params.nginxDockerVersion,
      healthCheck: health_check,
      frontendproxy_nginx_conf_tpl: params.frontendproxy_nginx_conf_tpl,
      ssl_cert_email: params.ssl_cert_email,
    })
  );
  if (params.extra_bootscript) {
    bs.include(params.extra_bootscript);
  }
  return bs;
}

function createIamInstanceProfile(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  params: Ec2InstanceDeploymentParams,
): AR.IamInstanceProfile {
  let iampolicies = [
    policies.publish_metrics_policy,
    aws.s3DeployBucketReadOnlyPolicy(sr),
    policies.route53ModifyZonePolicy('modifydns', sr.primary_dns_zone),
    policies.ecr_readonly_policy,
  ];
  if (params.extra_policies) {
    iampolicies = iampolicies.concat(params.extra_policies);
  }
  const instance_profile = roles.createInstanceProfileWithPolicies(
    tfgen,
    name,
    iampolicies
  );
  return instance_profile;
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
  sr: shared.DomainResources,
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
  dr: shared.DomainResources,
  endpoints: EndPoint[]
): camus2.EndPointMap {
  const endPointMap: camus2.EndPointMap = {};

  endpoints.forEach(ep => {
    const http_fqdns: string[] = [];
    const https_fqdns: string[] = [];
    ep.urls.forEach(url => {
      if (url.kind === 'https') {
        https_fqdns.push(shared.fqdn(dr, url.dnsname));
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
      if (https_fqdns.length > 0 && http_fqdns.length > 0) {
        throw new Error("Endpoints Config Error: both https/https-external and http url specified -  only used one '" + ep.name + "'")
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

export interface Ec2ExternalDeploymentParams extends Ec2InstanceDeploymentParams {
  // The DNS name of the machine. Only required if we need to provide the client an unchanging DNS name
  // they can cname to (that is, one of the endpoints is https-external)
  public_dns_name?: string;
  // Set the letsencrypt DNS challenge mode
  //
  // If the endpoints require an SSL certificate to be created via letsencrypt,
  // this controls the challenge mechanism. http-01 challenges have the
  // benefit that they can be used to generate certificates for domains without
  // dns control. dns-01 challenges have the benefit that they can be generated
  // off-line, ie the system doesn't need to be connected via dns before certs
  // can be generated.
  letsencrypt_challenge_type?: 'http-01' | 'dns-01';
}

export interface Ec2InternalDeploymentParams extends Ec2InstanceDeploymentParams {
  // The DNS name of the machine. Only required if we need to provide the client an unchanging DNS name
  // they can cname to (that is, one of the endpoints is https-external)
  dns_name: string;
}

export interface Ec2InstanceDeploymentParams {
  // The AWS keyname used for the EC2 instance.
  key_name: AT.KeyName;
  // The AWS instance type (ie mem and cores) for the EC2 instance.
  instance_type: AT.InstanceType;
  // The subnet to be used
  subnet_id: AR.SubnetId,
  // The email address for SSL certificate admin and notification.
  ssl_cert_email: string;
  // The S3 location where hx-deploy-tool releases are stored.
  releases_s3: s3.S3Ref;
  // The name of the unprivileged user used to run application code.
  // Defaults to "app".
  app_user?: string;
  // The endpoints configured for http/https access. Defaults to
  //    main:   ${dns_name}.${primary_dns_zone}
  //    test:   ${dns_name}-test.${primary_dns_zone}
  endpoints: EndPoint[];
  // Specifies the AMI for the EC2 instance. Defaults to an ubuntu 16.04 AMI
  // for the appropriate region.
  ami?(region: AT.Region): AT.Ami;
  // The EC2 instance created is given an IAM profile with sufficient access policies to
  // log metrics, run the deploy tool and create SSL certificates. Additional policies
  // can be specified here.
  extra_policies?: policies.NamedPolicy[];
  // The context files are fetched from S3 and made available to hx-deploy-tool for interpolation
  // into the deployed application configuration.
  deploy_contexts?: { name: string; source: C.JsonSource }[];
  // If true (or not specified), the bootscript includes ec2InstallScript().
  // Otherwise it's assumed this software is baked into the AMI
  bootscript_include_install?: boolean;
  // Additional operations for the EC2 instances first boot can be passed vis the operation.
  extra_bootscript?: bootscript.BootScript;
  // Override the default docker config.
  docker_config?: docker.DockerConfig;
  // Specify the DNS ttl value.
  //
  // This defaults to 3 minutes, on the assumption that when initially being setup
  // a short TTL is useful to ensure the fast propagation of changes. Once a system
  // has stabilised this should be increased to a much larger value.
  //
  // (eg see http://social.dnsmadeeasy.com/blog/long-short-ttls)
  dns_ttl?: number;
  //  Customize the ec2 instance, overriding defaults as required
  customize?: util.Customize<AR.InstanceParams>;
  // Substitute the default nginx template used.
  frontendproxy_nginx_conf_tpl?: string;
  // Nginx version to use for camus2
  nginxDockerVersion?: string,
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

export function endPointUrlStr(ep: EndPointUrl) : string {
  switch(ep.kind) {
    case 'http':
      return ep.fqdnsname;
    case 'https':
      return ep.dnsname;
    case 'https-external':
      return ep.fqdnsname;
    default:
      throw new Error(`unknown EndPointUrl.kind ${(ep as any).kind}`);
  }
}
export function endPointsSummary(eps: EndPoint[]) : {[key:string] : string[]} {
  const res : {[key:string] : string[]} = {};
  for(const ep of eps) {
    res[ep.name] = [];
    for(const url of ep.urls) {
      res[ep.name].push(endPointUrlStr(url));
    }
  }
  return res;
}

export interface Ec2Deployment {
  eip: AR.Eip;
  ec2: AR.Instance;
}

/**
 * Standard ubuntu base AMIs.
 *
 * (ubuntu xenial, hvm:ebs-ssd, EBS General purpose SSD, x86)
 *  https://cloud-images.ubuntu.com/locator/ec2/
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
  if (region.value === AT.eu_west_1.value) {
    return AT.ami('ami-0f2ed58082cb08a4d');
  }
  if (region.value === AT.eu_north_1.value) {
    return AT.ami('ami-04b331702444679c3');
  }
  if (region.value === AT.eu_central_1.value) {
    return AT.ami('ami-05ed2c1359acd8af6');
  }
  throw new Error('No AMI specified for region ' + region.value);
}

export function ec2InstallScript(
  app_user: string,
  docker_config: docker.DockerConfig,
  autoscaling_metrics: boolean,
  ): bootscript.BootScript {
  const install = bootscript.newBootscript();
  install.utf8Locale();
  install.dockerWithConfig(docker_config);
  install.createUserWithKeypairAccess(app_user);
  install.extendUserShellProfile(app_user, 'PATH="/opt/bin:$PATH"');
  install.addUserToGroup(app_user, 'docker');
  const script_args = bootscript.DEFAULT_CLOUDWATCH_METRICS_PARAMS.script_args +
  (autoscaling_metrics ? ' --auto-scaling' : '');
  install.cloudwatchMetrics(app_user, {
    script_args
  });
  install.addAptPackage("ec2-instance-connect");
  install.include(camus2.installCamus2(app_user));
  return install;
}
