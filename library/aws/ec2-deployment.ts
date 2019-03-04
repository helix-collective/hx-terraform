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
import * as deploytool from '../deploytool/deploytool';

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
  // Build the bootscript for the instance
  const bs = bootscript.newBootscript();
  const app_user = params.app_user || 'app';
  const docker_config = params.docker_config || docker.DEFAULT_CONFIG;
  let context_files: deploytool.ContextFile[];
  if (params.context_files) {
    context_files = params.context_files.map(ref =>
      deploytool.contextFile(params.config_s3, ref)
    );
  } else {
    context_files = [];
  }

  const https_fqdns: string[] = [];
  params.endpoints.forEach(ep => {
    if (ep.kind === 'https') {
      https_fqdns.push(shared.fqdn(sr, ep.dnsname));
    } else if (ep.kind === 'https-external') {
      https_fqdns.push(ep.fqdnsname);
    }
  });

  bs.utf8Locale();
  bs.dockerWithConfig(docker_config);
  bs.createUserWithKeypairAccess(app_user);
  bs.addUserToGroup(app_user, 'docker');
  bs.cloudwatchMetrics(app_user);
  if (params.extra_bootscript) {
    bs.include(params.extra_bootscript);
  }

  const proxy_endpoints = params.endpoints.map(ep => {
    if (ep.kind === 'https') {
      return deploytool.httpsProxyEndpoint(
        ep.name,
        [shared.fqdn(sr, ep.dnsname)]
      );
    }
    if (ep.kind === 'https-external') {
      return deploytool.httpsProxyEndpoint(ep.name, [ep.fqdnsname]);
    }

    return deploytool.httpProxyEndpoint(ep.name, [ep.fqdnsname]);
  });
  bs.include(
    deploytool.install(
      app_user,
      params.releases_s3,
      params.config_s3,
      context_files,
      deploytool.localProxy(proxy_endpoints),
      params.ssl_cert_email
    )
  );

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
    'appserver',
    iampolicies
  );

  const appserver = aws.createInstanceWithEip(tfgen, 'appserver', sr, {
    instance_type: params.instance_type,
    ami: params.ami || getDefaultAmi,
    security_group: sr.appserver_security_group,
    key_name: params.key_name,
    customize_instance: (i: AR.InstanceParams) => {
      i.user_data = bs.compile();
      i.iam_instance_profile = instance_profile.id;
    },
  });

  params.endpoints.forEach(ep => {
    if (ep.kind === 'https') {
      shared.dnsARecord(
        tfgen,
        'appserver_' + ep.name,
        sr,
        ep.dnsname,
        [appserver.eip.public_ip],
        '3600'
      );
    }
  });

  // Create a canonical DNS record for the ec2 box (independent of switchable endpoints)
  if (params.public_dns_name !== undefined) {
    shared.dnsARecord(
      tfgen,
      'appserver',
      sr,
      params.public_dns_name,
      [appserver.eip.public_ip],
      '3600'
    );
  }

  return appserver;
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
   * The S3 location where hx-deploy-tool context files are stored.
   */
  config_s3: s3.S3Ref;

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
  context_files?: s3.S3Ref[];

  /**
   * Additional operations for the EC2 instances first boot can be passed vis the operation.
   */
  extra_bootscript?: bootscript.BootScript;

  /**
   * Override the default docker config.
   */
  docker_config?: docker.DockerConfig;
}

// An http endpoint
export interface EndPointHttp {
  kind: 'http';
  name: string;
  fqdnsname: string;
}

// An https endpoints for which we create a dns entry
export interface EndPointHttps {
  kind: 'https';
  name: string;
  dnsname: string;
}

// An https endpoints for an externally configured dns entry
export interface EndPointHttpsExternal {
  kind: 'https-external';
  name: string;
  fqdnsname: string;
}

export type EndPoint = EndPointHttps | EndPointHttp | EndPointHttpsExternal;

interface Ec2Deployment {
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
  throw new Error('No AMI specified for region ' + region.value);
}
