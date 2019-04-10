import * as TF from '../core/core';
import * as AT from '../providers/aws/types';
import * as AR from '../providers/aws/resources';

import * as aws from './aws/aws';
import * as roles from './aws/roles';
import * as shared from './aws/shared';
import * as s3 from './aws/s3';
import * as bootscript from './bootscript';
import * as policies from './aws/policies';
import * as docker from './docker';
import * as deploytool from './deploytool/deploytool';
import * as C from "../library/deploytool/adl-gen/config";

import { EndPoint, getDefaultAmi } from './aws/ec2-deployment';
import { createAutoscalingGroup, createLaunchConfiguration, createAutoscalingAttachment, createLb, createLbTargetGroup } from '../providers/aws/resources';
import { contextTagsWithName } from './util';

/**
 *  Creates a logical deployment on an aws EC2 autoscaling group, including:
 *
 *      - the autoscale group itelf
 *      - AWS generated SSL certificates
 *      - DNS entries for the endpoints
 *      - Load balancer in front of autoscaling group
 *
 * hx-deploy-tool is configured onto the group, running in remote proxy mode.
 */
export function createAutoscaleDeployment(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  params: AutoscaleDeploymentParams
): AutoscaleDeployment {

  const controller = createController(tfgen, name, sr, params);
  const appserverAutoScaleGroup = createAppserverAutoScaleGroup(tfgen, name, sr, params);
  const appserverLoadBalancer = createAppserverLoadBalancer(tfgen, name, sr, params, appserverAutoScaleGroup);

  return {
    autoscaling_group: appserverAutoScaleGroup,
    target_group: appserverLoadBalancer.target_group,
    load_balancer: appserverLoadBalancer.load_balancer
  };
}

function createController(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  params: AutoscaleDeploymentParams
) {
  const app_user = appUserOrDefault(params.app_user);
  const config_s3 = params.config_s3;
  const docker_config = params.docker_config || docker.DEFAULT_CONFIG;
  const releases_s3 = params.releases_s3;
  const state_s3 = params.state_s3;
  const controller_label = controllerLabel(params.controller_label);
  const subnetId = externalSubnetId(sr.network);

  const context_files: deploytool.ContextFile[] = contextFiles(config_s3, params.controller_context_files);

  const endpoints: EndPoint[] = endpointsOrDefault(params.dns_name, params.endpoints);
  const proxy_endpoints = proxyEndpoints(sr, endpoints);

  // Build the bootscript for the controller
  const bs = bootscript.newBootscript();
  bs.utf8Locale();
  bs.dockerWithConfig(docker_config);
  bs.createUserWithKeypairAccess(app_user);
  bs.addUserToGroup(app_user, 'docker');

  bs.include(
    deploytool.install(
      app_user,
      releases_s3,
      config_s3,
      context_files,
      deploytool.remoteProxyMaster(proxy_endpoints, state_s3),
    )
  );

  if (params.controller_extra_bootscript) {
    bs.include(params.controller_extra_bootscript);
  }

  const controller_iampolicies = [
    aws.s3DeployBucketModifyPolicy(sr)
  ];

  const controller_instance_profile = roles.createInstanceProfileWithPolicies(
    tfgen,
    controller_label,
    controller_iampolicies
  );

  const controller = aws.createInstanceWithEip(tfgen, controller_label, sr, {
    instance_type: AT.t2_micro,
    ami: params.controller_amis || getDefaultAmi,
    security_group: sr.bastion_security_group,
    key_name: params.key_name,
    customize_instance: (i: AR.InstanceParams) => {
      i.user_data = bs.compile();
      i.iam_instance_profile = controller_instance_profile.id;
      i.subnet_id = subnetId;
    },
  });

  const controller_route53 = shared.dnsARecord(tfgen, controller_label, sr, params.dns_name + "-" + controller_label, [controller.eip.public_ip], "3600");

  return {};
}

function createAppserverAutoScaleGroup(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  params: AutoscaleDeploymentParams): AR.AutoscalingGroup {

  const app_user = appUserOrDefault(params.app_user);
  const config_s3 = params.config_s3;
  const docker_config = params.docker_config || docker.DEFAULT_CONFIG;
  const state_s3 = params.state_s3;
  const context_files: deploytool.ContextFile[] = contextFiles(config_s3, params.appserver_context_files)
  const endpoints: EndPoint[] = endpointsOrDefault(params.dns_name, params.endpoints);
  const proxy_endpoints = proxyEndpoints(sr, endpoints);

  // Build the bootscript for the instance
  const bs = bootscript.newBootscript();

  bs.utf8Locale();
  bs.dockerWithConfig(docker_config);
  bs.createUserWithKeypairAccess(app_user);
  bs.addUserToGroup(app_user, 'docker');
  bs.cloudwatchMetrics(app_user);

  bs.include(
    deploytool.install(
      app_user,
      params.releases_s3,
      params.config_s3,
      context_files,
      deploytool.remoteProxySlave(proxy_endpoints, state_s3),
    )
  );

  if (params.appserver_extra_bootscript) {
    bs.include(params.appserver_extra_bootscript);
  }

  let appserver_iampolicies = [
    policies.publish_metrics_policy,
    aws.s3DeployBucketModifyPolicy(sr),
    policies.route53ModifyZonePolicy('modifydns', sr.primary_dns_zone),
    policies.ecr_readonly_policy
  ];
  if (params.appserver_extra_policies) {
    appserver_iampolicies = appserver_iampolicies.concat(params.appserver_extra_policies);
  }

  const appserver_instance_profile = roles.createInstanceProfileWithPolicies(
    tfgen,
    'appserver',
    appserver_iampolicies
  );

  const launch_config = createLaunchConfiguration(tfgen, "appserver", {
      key_name: params.key_name,
      image_id: (params.appserver_amis) ? params.appserver_amis(sr.network.region) : getDefaultAmi(sr.network.region),
      instance_type: params.appserver_instance_type,
      iam_instance_profile: appserver_instance_profile.id,
      security_groups: [sr.appserver_security_group.id],
      user_data: bs.compile(),
      root_block_device: {
        volume_size: 20
      },
  });

  tfgen.createBeforeDestroy(launch_config, true);

  const autoscaling_group = createAutoscalingGroup(tfgen, "appserver", {
    min_size: params.min_size || 1,
    max_size: params.max_size || 1,
    vpc_zone_identifier: sr.network.azs.map(az => az.internal_subnet.id),
    launch_configuration: launch_config.name,
    tags: Object.entries(contextTagsWithName(tfgen, name)).map(([key, value]) => { // note that tag and tags parameters appear to have the same function
      return {
        key,
        value,
        propagate_at_launch: true
      }
    })
  });

  return autoscaling_group;
}

export type LoadBalancerResources = {
  load_balancer: AR.Lb;
  target_group: AR.LbTargetGroup;
}

function createAppserverLoadBalancer(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  params: AutoscaleDeploymentParams,
  autoscaling_group: AR.AutoscalingGroup): LoadBalancerResources {

  const endpoints: EndPoint[] = endpointsOrDefault(params.dns_name, params.endpoints);
  const https_fqdns: string[] = httpsFqdnsFromEndpoints(sr, endpoints);
  // Figure out the environment based on the deploy bucket name.
  const env = sr.deploy_bucket_name.indexOf('uat') > 0 ? 'uat' : 'prod';

  const alb = createLb(tfgen, "alb", {
    load_balancer_type: 'application',
    tags: tfgen.tagsContext(),
    security_groups: [sr.load_balancer_security_group.id],
    subnets: sr.network.azs.map(az => az.external_subnet.id),
    access_logs: {
      bucket: `au-com-slyp-elb-${env}-${name}-access-logs`,
      enabled: true
    }
  });

  const alb_target_group = createLbTargetGroup(tfgen, "tg80", {
    port: 80,
    protocol: 'HTTP',
    vpc_id: sr.network.vpc.id,
    health_check: {
      path: '/health-check'
    },
    tags: tfgen.tagsContext()
  });

  const autoscaling_attachment = createAutoscalingAttachment(tfgen, "appserver", {
    autoscaling_group_name: autoscaling_group.id,
    alb_target_group_arn: alb_target_group.arn
  });

  const acm_certificate_arn = params.acm_certificate_arn != undefined ?
    params.acm_certificate_arn : createAcmCertificate(tfgen, sr, https_fqdns );

  const alb_http_listener = AR.createLbListener(tfgen, "http", {
    load_balancer_arn: alb.arn,
    port: 80,
    protocol: "HTTP",
    default_action: {
      target_group_arn: alb_target_group.arn,
      type: 'forward'
    }
  });

  const alb_https_listener = AR.createLbListener(tfgen, "https", {
    load_balancer_arn: alb.arn,
    port: 443,
    protocol: 'HTTPS',
    certificate_arn: acm_certificate_arn,
    default_action: {
      target_group_arn: alb_target_group.arn,
      type: 'forward'
    }
  });

  endpoints.forEach(ep => {
    if (ep.kind == 'https') {
      shared.dnsAliasRecord(
        tfgen,
        'appserver_lb_' + ep.name,
        sr,
        ep.dnsname,
        {
          name: alb.dns_name,
          zone_id: alb.zone_id,
          evaluate_target_health: true
        }
    );
    }
  });
  return {
    load_balancer: alb,
    target_group: alb_target_group
  };
}

function createAcmCertificate(  
  tfgen: TF.Generator,
  sr: shared.SharedResources,
  https_fqdns: string[]
  ): AT.ArnT<"AcmCertificate"> {

  const acm_certificate = AR.createAcmCertificate(tfgen, "cert", {
    domain_name: https_fqdns[0],
    subject_alternative_names: [https_fqdns[1]],
    validation_method: 'DNS',
    tags: tfgen.tagsContext()
  });
  const arn = acm_certificate.arn;
  const r53rs = https_fqdns.map((fqdn, i) => {

    const domain_validation_options = domainValidationOptions(acm_certificate, i);
    return AR.createRoute53Record(tfgen, "cert" + i, {
      zone_id: sr.primary_dns_zone.zone_id,
      name: domain_validation_options.name,
      type: domain_validation_options.type,
      ttl: "60",
      records: [domain_validation_options.value]
    });
  });

  const acm_certificate_validation = AR.createAcmCertificateValidation(tfgen, "cert", {
    certificate_arn: acm_certificate.arn,
    validation_record_fqdns: r53rs.map(r53r => r53r.fqdn)
  });

  return arn;
}

type DNSRecordType = 'A' | 'AAAA' | 'CAA' | 'CNAME' | 'MX' | 'NAPTR' | 'NS' | 'PTR' | 'SOA' | 'SPF' | 'SRV' | 'TXT';

interface DomainValidationOptions {
  name: string,
  type: DNSRecordType,
  value: string
}

function domainValidationOptions(acm_certificate: AR.AcmCertificate, i: number): DomainValidationOptions {
  return {
    name: "${aws_acm_certificate." + acm_certificate.tfname.join("_") + '.domain_validation_options.' + i + '.resource_record_name}',
    type: "${aws_acm_certificate." + acm_certificate.tfname.join("_") + '.domain_validation_options.' + i + '.resource_record_type}' as DNSRecordType,
    value: "${aws_acm_certificate." + acm_certificate.tfname.join("_") + '.domain_validation_options.' + i + '.resource_record_value}'
  }
}

function appUserOrDefault(app_user?: string): string {
  return app_user || 'app';
}

function externalSubnetId(network: shared.NetworkResources): SubnetId {
  return network.azs.map(az => az.external_subnet.id)[0]
}

function contextFiles(config_s3: s3.S3Ref, files: s3.S3Ref[] = []): deploytool.ContextFile[] {
  return [
    ...files
  ].map(ref => deploytool.contextFile(config_s3, ref));
  // ].map(ref => deploytool.contextFromS3(ref.url(), ref))
}

function endpointsOrDefault(dns_name: string, endpoints?: EndPoint[]): EndPoint[] {
  return endpoints || [
    { kind: 'https', name: 'main', dnsname: dns_name },
    { kind: 'https', name: 'test', dnsname: dns_name + '-test' },
  ];
}

function httpsFqdnsFromEndpoints(sr: shared.SharedResources, endpoints: EndPoint[]): string[] {
  const https_fqdns: string[] = [];
  endpoints.forEach(ep => {
    if (ep.kind === 'https') {
      https_fqdns.push(shared.fqdn(sr, ep.dnsname));
    } else if (ep.kind === 'https-external') {
      https_fqdns.push(ep.fqdnsname);
    }
  });
  return https_fqdns;
}

function proxyEndpoints(sr: shared.SharedResources, endpoints: EndPoint[]): C.EndPoint[] {
  return endpoints
    .map(ep => {
      const fqdnsname = (ep.kind === 'https') ? shared.fqdn(sr, ep.dnsname) : ep.fqdnsname;
      return deploytool.httpProxyEndpoint(ep.name, [fqdnsname]);
    });
}

function controllerLabel(label?: string) {
  return label || "controller";
}


type SubnetId = {type:'SubnetId',value:string};

interface AutoscaleDeploymentParams {
  /**
   * The AWS keyname used for the EC2 instance.
   */
  key_name: AT.KeyName;

  /**
   * The DNS name of the machine. This is a prefix to the shared primary DNS zone.
   * (ie if the value is aaa and the primary dns zone is helix.com, then the final DNS entry
   * will be aaa.helix.com).
   */
  dns_name: string;

  /**
   * The S3 location where hx-deploy-tool releases are stored.
   */
  releases_s3: s3.S3Ref;

  /**
   * The S3 location where hx-deploy-tool context files are stored.
   */
  config_s3: s3.S3Ref;

  /**
   * The S3 location where hx-deploy-tool keeps it's state information
   */
  state_s3: s3.S3Ref;

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
  endpoints?: EndPoint[];

  /**
   * Additional operations for the controller first boot can be passed vis the operation.
   */
  controller_extra_bootscript?: bootscript.BootScript;

  /**
   * Specifies the AMI for the controller. Defaults to an ubuntu 16.04 AMI
   * for the appropriate region.
   */
  controller_amis?(region: AT.Region): AT.Ami;

  /**
   * The context files are fetched from S3 and made available to the controller instance for
   * interpolation into the deployed application configuration.
   */
  controller_context_files?: s3.S3Ref[];

  /**
   * Label the deploy master instance and associated resources for client convenience
   */
  controller_label?: string;

  /**
   * Additional operations for the EC2 instances first boot can be passed vis the operation.
   */
  appserver_extra_bootscript?: bootscript.BootScript;

  /**
   * The AWS instance type (ie mem and cores) for the EC2 instance.
   */
  appserver_instance_type: AT.InstanceType;

  /**
   * Specifies the AMI for the EC2 instances. Defaults to an ubuntu 16.04 AMI
   * for the appropriate region.
   */
  appserver_amis?(region: AT.Region): AT.Ami;

  /**
   * The context files are fetched from S3 and made available to hx-deploy-tool for interpolation
   * into the deployed application configuration.
   */
  appserver_context_files?: s3.S3Ref[];

  /**
   * The EC2 instance created is given an IAM profile with sufficient access policies to
   * log metrics, run the deploy tool and create SSL certificates. Additional policies
   * can be specified here.
   */
  appserver_extra_policies?: policies.NamedPolicy[];

  /** Lower bound of EC2 instances for the Autoscaling group */
  min_size?: number;

  /** Upper bound of EC2 instances for the Autoscaling group */
  max_size?: number;

  /**
   * Override the default docker config.
   */
  docker_config?: docker.DockerConfig;

  /**
   * Use this AWS ACM certificate rather than automatically generating one
   */
  acm_certificate_arn?: AT.ArnT<"AcmCertificate">

}

interface AutoscaleDeployment {
  autoscaling_group: AR.AutoscalingGroup;
  target_group: AR.LbTargetGroup;
  load_balancer: AR.Lb;
}
