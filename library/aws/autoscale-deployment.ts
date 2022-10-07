import { DEFAULT_NGINX_DOCKER_VERSION } from './defaults';
import * as TF from '../../core/core';
import * as AT from '../../providers/aws/types';
import * as AR from '../../providers/aws/resources';

import * as aws from './aws';
import * as roles from './roles';
import * as shared from './shared';
import * as s3 from './s3';
import * as bootscript from '../bootscript';
import * as policies from './policies';
import * as docker from '../docker';
import * as camus2 from '../camus2/camus2';
import * as C from '../../library/camus2/adl-gen/config';

import * as deploytool from '../deploytool_legacy/deploytool';
import * as DC from '../../library/deploytool_legacy/adl-gen/config';

import {
  EndPoint,
  httpsFqdnsFromEndpoints,
  ec2InstallScript,
} from './ec2-deployment';
import { contextTagsWithName, Customize, applyCustomize } from '../util';

/**
 *  Creates a logical application frontend service on an aws EC2 autoscaling group, including:
 *
 *      - the autoscale group itself
 *      - a controller machine
 *      - AWS generated SSL certificatesAppserver
 *      - DNS entries for the endpoints
 *      - Load balancer in front of autoscaling group
 *
 * hx-deploy-tool is configured onto the group, running in remote proxy mode.
 */
export function createAutoscaleFrontend(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResourcesNEI,
  params: AutoscaleFrontendParams,
  nginxDockerVersion?: string,
): AutoscaleDeployment {
  return TF.withLocalNameScope(tfgen, name, tfgen => {

    if(params.controller_enable) {
      const controller = createController(
        tfgen,
        'controller',
        sr,
        params,
        params.endpoints,
        nginxDockerVersion === undefined ? DEFAULT_NGINX_DOCKER_VERSION : nginxDockerVersion,
      );
    }

    const autoscale_processor = createProcessorAutoScaleGroup(
      tfgen,
      'asg',
      sr,
      params,
      params.endpoints,
      nginxDockerVersion === undefined ? DEFAULT_NGINX_DOCKER_VERSION : nginxDockerVersion,
    );

    const https_fqdns: string[] = httpsFqdnsFromEndpoints(sr, params.endpoints);
    // Create a new certificate if an existing certificate ARN isn't provided.
    // When new domains are added, the certificate is deleted and re-created, in this situation,
    // we need the certificate to be created first (as it can't be deleted while connectec to an ALB)
    const acm_certificate_arn =
      params.acm_certificate === undefined
        ? createAcmCertificate(tfgen, sr, https_fqdns, true)
        : params.acm_certificate.kind === 'generate'
          ? createAcmCertificate(tfgen, sr, https_fqdns, true)
          : params.acm_certificate.kind === 'generate_with_manual_verify'
            ? createAcmCertificate(tfgen, sr, https_fqdns, false)
            : params.acm_certificate.arn;

    const lb = createLoadBalancer(tfgen, 'lb', sr, {
      customize_lb:params.customize_lb,
      acm_certificate_arn
    });

    const tg = createAutoscaleTargetGroup(
      tfgen,
      'lb',
      sr,
      lb,
      autoscale_processor.autoscaling_group,
      params,
    );

    return {
      autoscale_processor,
      target_group: tg.target_group,
      load_balancer: tg.load_balancer,
      lb_https_listener: tg.lb_https_listener,
    };
  });
}

/**
 * Create a processor on an AWS EC2 autoscaling group, including
 *
 *      - the autoscale group itself
 *      - a controller machine
 *
 * hx-deploy-tool is configured onto the group, running in remote proxy mode.
 */

export function createAutoscaleProcessor(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResourcesNEI,
  params: AutoscaleProcessorParams,
): AutoscaleProcessor {
  return TF.withLocalNameScope(tfgen, name, tfgen => {
    const controller = createController(
      tfgen,
      'controller',
      sr,
      params,
      [],
      params.nginxDockerVersion === undefined
          ? DEFAULT_NGINX_DOCKER_VERSION : params.nginxDockerVersion,
    );
    return createProcessorAutoScaleGroup(
      tfgen,
      'asg',
      sr,
      params,
      [],
      params.nginxDockerVersion === undefined
          ? DEFAULT_NGINX_DOCKER_VERSION : params.nginxDockerVersion,
    );
  });
}

export function createController(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResourcesNEI,
  params: AutoscaleProcessorParams,
  endpoints: EndPoint[],
  nginxDockerVersion: string,
) {
  const app_user = appUserOrDefault(params.app_user);
  const releases_s3 = params.releases_s3;
  const state_s3 = params.state_s3;
  const controller_label = params.controller_label || name;
  const subnetId = shared.externalSubnetIds(sr)[0];

  const deploy_contexts: camus2.DeployContext[] =
    params.controller_deploy_contexts || [];

  const proxy_endpoints = deployToolEndpoints(sr, endpoints);
  const docker_config = params.docker_config || docker.DEFAULT_CONFIG;

  // Build the bootscript for the controller
  const bs = bootscript.newBootscript();
  const include_install = params.bootscripts_include_install == undefined ? true : params.bootscripts_include_install;
  if (include_install) {
    bs.include(ec2InstallScript(app_user, docker_config, !params.use_hxdeploytool, true));
  }

  if (params.use_hxdeploytool) {
    const legacy_proxy_endpoints: DC.EndPoint[] = [];
    for (const label of Object.keys(proxy_endpoints)) {
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
        releases_s3,
        deploy_contexts,
        deploytool.remoteProxyMaster(legacy_proxy_endpoints, state_s3),
        params.health_check,
        params.frontendproxy_nginx_conf_tpl
      )
    );
  } else {
    bs.include(
      camus2.configureCamus2(
        app_user,
        releases_s3,
        deploy_contexts,
        camus2.remoteProxyMaster(proxy_endpoints, state_s3),
        nginxDockerVersion,
        params.health_check,
        params.frontendproxy_nginx_conf_tpl
      )
    );
  }

  if (params.controller_extra_bootscript) {
    bs.include(params.controller_extra_bootscript);
  }

  let controller_iampolicies: policies.NamedPolicy[] = [aws.s3DeployBucketModifyPolicy(sr)];

  if (params.controller_extra_policies) {
    controller_iampolicies = controller_iampolicies.concat(params.controller_extra_policies);
  }

  const controller_instance_profile = roles.createInstanceProfileWithPolicies(
    tfgen,
    controller_label,
    controller_iampolicies
  );

  const controller = aws.createInstanceWithEip(tfgen, controller_label, sr, shared.externalSubnetIds(sr)[0], {
    instance_type: AT.t2_micro,
    ami: params.controller_amis,
    security_group: sr.bastion_security_group,
    key_name: params.key_name,
    customize_instance: (i: AR.InstanceParams) => {
      i.user_data = bs.compile();
      i.iam_instance_profile = controller_instance_profile.id;
      i.subnet_id = subnetId;
    },
  });

  const controller_route53 = shared.dnsARecord(
    tfgen,
    controller_label,
    sr,
    params.controller_dns_name,
    [controller.eip.public_ip],
    '3600'
  );

  return {};
}

export function createProcessorAutoScaleGroup(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResourcesNEI,
  params: AutoscaleProcessorParams,
  endpoints: EndPoint[],
  nginxDockerVersion: string,
): AutoscaleProcessor {
  const app_user = appUserOrDefault(params.app_user);
  const docker_config = params.docker_config || docker.DEFAULT_CONFIG;
  const state_s3 = params.state_s3;
  const deploy_contexts: camus2.DeployContext[] =
    params.appserver_deploy_contexts || [];
  const proxy_endpoints = deployToolEndpoints(sr, endpoints);

  // Build the bootscript for the instance
  const bs = bootscript.newBootscript();
  const include_install = params.bootscripts_include_install == undefined ? true : params.bootscripts_include_install;
  if (include_install) {
    bs.include(ec2InstallScript(app_user, docker_config, !params.use_hxdeploytool, true));
  }

  if (params.use_hxdeploytool) {
    const legacy_proxy_endpoints: DC.EndPoint[] = [];
    for (const label of Object.keys(proxy_endpoints)) {
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
        deploytool.remoteProxySlave(legacy_proxy_endpoints, state_s3),
        params.health_check,
        params.frontendproxy_nginx_conf_tpl
      )
    );
  } else {
    bs.include(
      camus2.configureCamus2(
        app_user,
        params.releases_s3,
        deploy_contexts,
        camus2.remoteProxySlave(proxy_endpoints, state_s3),
        nginxDockerVersion,
        params.health_check,
        params.frontendproxy_nginx_conf_tpl
      )
    );
  }

  if (params.appserver_extra_bootscript) {
    bs.include(params.appserver_extra_bootscript);
  }

  const asgName = tfgen.scopedName(name).join('-');

  let appserver_iampolicies = [
    policies.publish_metrics_policy,
    aws.s3DeployBucketModifyPolicy(sr),
    policies.route53ModifyZonePolicy('modifydns', sr.primary_dns_zone),
    policies.ecr_readonly_policy,

    // due to cyclic dependency we dont know the final asg ARN yet
    // cycle is autoscaling_group -depends-on-> launch_config -depends-on-> appserver_iampolicies -depends-on-> arn of the asg
    // break cycle by using partially wildcarded arn string
    policies.autoscalingGroupEnableSetInstanceProtection(
      'modifyasginstanceprotection',
      `arn:aws:autoscaling:*:*:autoScalingGroup:*:autoScalingGroupName/${asgName}`
    ),
  ];
  if (params.appserver_extra_policies) {
    appserver_iampolicies = appserver_iampolicies.concat(
      params.appserver_extra_policies
    );
  }

  const instance_profile = roles.createInstanceProfileWithPolicies(
    tfgen,
    name,
    appserver_iampolicies
  );

  const launch_config_params = {
    name_prefix: tfgen.scopedName(name).join('-') + '-',
    key_name: params.key_name,
    image_id: params.appserver_amis(sr.network.region),
    instance_type: params.appserver_instance_type,
    iam_instance_profile: instance_profile.id,
    security_groups: [sr.appserver_security_group.id],
    user_data: bs.compile(),
    root_block_device: {
      volume_size: 20,
    },
  };

  if (params.customize_launch_config) {
    params.customize_launch_config(launch_config_params);
  }

  const launch_config = AR.createLaunchConfiguration(
    tfgen,
    name,
    launch_config_params
  );

  tfgen.createBeforeDestroy(launch_config, true);

  const autoscaling_group_params: AR.AutoscalingGroupParams = {
    name: asgName,
    min_size: params.min_size === undefined ? 1 : params.min_size,
    max_size: params.max_size === undefined ? 1 : params.max_size,
    vpc_zone_identifier: sr.network.azs.map(az => az.internal_subnet.id),
    launch_configuration: launch_config.name,
    enabled_metrics: ['GroupInServiceInstances', 'GroupDesiredCapacity'],
    termination_policies: [
      // flush out old instances when asg size reduces
      'OldestInstance',
    ],
    tags: Object.entries(contextTagsWithName(tfgen, name)).map(
      ([key, value]) => {
        // note that tag and tags parameters appear to have the same function
        return {
          key,
          value,
          propagate_at_launch: true,
        };
      }
    ),
  };

  if (params.customize_autoscaling_group) {
    params.customize_autoscaling_group(autoscaling_group_params);
  }

  // prevent customization of the name
  autoscaling_group_params.name = asgName;

  const autoscaling_group = AR.createAutoscalingGroup(
    tfgen,
    name,
    autoscaling_group_params
  );

  return {
    autoscaling_group,
    instance_profile,
  };
}

export interface LoadBalancerAndListeners {
  lb :  AR.Lb;
  http_listener: AR.LbListener;
  https_listener: AR.LbListener;
};

export function createLoadBalancer(tfgen: TF.Generator, tfname: string, sr: shared.SharedResourcesNEI,
  params: {
    acm_certificate_arn: AT.ArnT<'AcmCertificate'>,
    customize_lb?: Customize<AR.LbParams>;
  } ): LoadBalancerAndListeners {
    const lbParams: AR.LbParams = {
      name: tfgen.scopedName(tfname).join('-'),
      load_balancer_type: 'application',
      tags: tfgen.tagsContext(),
      security_groups: [sr.load_balancer_security_group.id],
      subnets: sr.network.azs.map(az => az.external_subnet.id),
    };
    const lb = AR.createLb(
      tfgen,
      'alb',
      applyCustomize(params.customize_lb, lbParams)
    );
  const lb_http_listener = AR.createLbListener(tfgen, tfname + '_http', {
    load_balancer_arn: lb.arn,
    port: 80,
    protocol: 'HTTP',
    default_action: {
      type: 'redirect',
      redirect: {
        protocol: 'HTTPS',
        port: '443',
        status_code: 'HTTP_301',
      },
    },
  });

  const lb_https_listener = AR.createLbListener(tfgen, tfname + '_https', {
    load_balancer_arn: lb.arn,
    port: 443,
    protocol: 'HTTPS',
    certificate_arn: params.acm_certificate_arn,
    default_action: {
      type: 'fixed-response',
      fixed_response: {
        content_type: 'text/plain',
        message_body: 'Invalid host',
        status_code: 503,
      }
    },
  });

  return {lb, http_listener: lb_http_listener, https_listener: lb_https_listener};
}


export type TargetGroupResources = {
  load_balancer: AR.Lb;
  target_group: AR.LbTargetGroup;
  lb_https_listener: AR.LbListener;
};

export function createAutoscaleTargetGroup(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResourcesNEI,
  lb: LoadBalancerAndListeners,
  autoscaling_group: AR.AutoscalingGroup,
  params: AutoscaleFrontendParams,
): TargetGroupResources {
  const https_fqdns: string[] = httpsFqdnsFromEndpoints(sr, params.endpoints);

  const alb_target_group = AR.createLbTargetGroup(tfgen, 'tg80', {
    name: params.target_group_generate_name ? tfgen.scopedName(name).join('-') : undefined,
    port: 80,
    protocol: 'HTTP',
    vpc_id: sr.network.vpc.id,
    health_check: {
      path: params.health_check.incomingPath,
    },
    tags: tfgen.tagsContext(),
  });

  const autoscaling_attachment = AR.createAutoscalingAttachment(tfgen, name, {
    autoscaling_group_name: autoscaling_group.id,
    alb_target_group_arn: alb_target_group.arn,
  });

  // An ALB listener rule can only have a maxmium of 5 hosts names. So
  // split into groups of 5 and create a rule for each.
  const hosts: string[] = httpsFqdnsFromEndpoints(sr, params.endpoints);
  const hosts_max5: string[][] = [];
  for (let i=0; i<hosts.length; i+=5) {
    hosts_max5.push(hosts.slice(i,i+5));
  }
  for(let i = 0; i < hosts_max5.length; i++) {
    const tfname = 'https' + (i == 0 ? '' : i+1);
    AR.createLbListenerRule(tfgen, tfname, {
      listener_arn: lb.https_listener.arn,
      condition: {
        host_header: {
          values: hosts_max5[i],
        },
      },
      action: {
        type: 'forward',
        target_group_arn: alb_target_group.arn,
      },
    });
  }

  params.endpoints.forEach(ep => {
    ep.urls.forEach((url, i) => {
      if (url.kind === 'https') {
        shared.dnsAliasRecord(
          tfgen,
          name + '_lb_' + ep.name + '_' + i,
          sr,
          url.dnsname,
          {
            name: lb.lb.dns_name,
            zone_id: lb.lb.zone_id,
            evaluate_target_health: true,
          }
        );
      }
    });
  });

  return {
    load_balancer: lb.lb,
    target_group: alb_target_group,
    lb_https_listener: lb.https_listener,
  };
}

function createAcmCertificate(
  tfgen: TF.Generator,
  sr: shared.SharedResourcesNEI,
  https_fqdns: string[],
  auto_verify: boolean
): AR.AcmCertificateArn {
  const create_before_destroy = true;
  const acm_certificate = AR.createAcmCertificate(tfgen, 'cert', {
    domain_name: https_fqdns[0],
    subject_alternative_names: https_fqdns.slice(1),
    validation_method: 'DNS',
    tags: tfgen.tagsContext(),
  });

  // Unfortanately AWS and the existing terraform provider have a problem
  // where the order of the SANs keeps being re-arranged, and hence terraform
  // wants to keep recreating the certificate, when then would need to be
  // re-verified. Here's the github issue:
  //
  //    https://github.com/terraform-providers/terraform-provider-aws/issues/8531
  //
  // As a short term workaround, we ignore changes in this field, which means
  // that the cert resource will need to be manually terraform tainted when
  // the names actually do change.
  tfgen.ignoreChanges(acm_certificate, 'subject_alternative_names');

  tfgen.createBeforeDestroy(acm_certificate, create_before_destroy);

  const arn = acm_certificate.arn;
  if (auto_verify) {
    const r53rs = https_fqdns.map((fqdn, i) => {
      const domain_validation_options = domainValidationOptions(
        acm_certificate,
        i
      );
      return AR.createRoute53Record(tfgen, 'cert' + i, {
        zone_id: sr.primary_dns_zone.zone_id,
        name: domain_validation_options.name,
        type: domain_validation_options.type,
        ttl: '60',
        records: [domain_validation_options.value],
      });
    });

    const acm_certificate_validation = AR.createAcmCertificateValidation(
      tfgen,
      'cert',
      {
        certificate_arn: acm_certificate.arn,
        validation_record_fqdns: r53rs.map(r53r => r53r.fqdn),
      }
    );
  }
  return arn;
}

type DNSRecordType =
  | 'A'
  | 'AAAA'
  | 'CAA'
  | 'CNAME'
  | 'MX'
  | 'NAPTR'
  | 'NS'
  | 'PTR'
  | 'SOA'
  | 'SPF'
  | 'SRV'
  | 'TXT';

interface DomainValidationOptions {
  name: string;
  type: DNSRecordType;
  value: string;
}

function domainValidationOptions(
  acm_certificate: AR.AcmCertificate,
  i: number
): DomainValidationOptions {
  return {
    name:
      '${aws_acm_certificate.' +
      acm_certificate.tfname.join('_') +
      '.domain_validation_options.' +
      i +
      '.resource_record_name}',
    type: ('${aws_acm_certificate.' +
      acm_certificate.tfname.join('_') +
      '.domain_validation_options.' +
      i +
      '.resource_record_type}') as DNSRecordType,
    value:
      '${aws_acm_certificate.' +
      acm_certificate.tfname.join('_') +
      '.domain_validation_options.' +
      i +
      '.resource_record_value}',
  };
}

function appUserOrDefault(app_user?: string): string {
  return app_user || 'app';
}

function deployToolEndpoints(
  sr: shared.SharedResourcesNEI,
  endpoints: EndPoint[]
): camus2.EndPointMap {
  const endPointMap: camus2.EndPointMap = {};
  endpoints.forEach(ep => {
    const fqdns: string[] = [];
    ep.urls.forEach(url => {
      if (url.kind === 'https') {
        fqdns.push(shared.fqdn(sr, url.dnsname));
        if (url.proxied_from !== undefined) {
          url.proxied_from.forEach(pfqdns => {
            fqdns.push(pfqdns);
          });
        }
      } else if (url.kind === 'https-external') {
        fqdns.push(url.fqdnsname);
        if (url.proxied_from !== undefined) {
          url.proxied_from.forEach(pfqdns => {
            fqdns.push(pfqdns);
          });
        }
      } else if (url.kind === 'http') {
        fqdns.push(url.fqdnsname);
      }
    });
    endPointMap[ep.name] = camus2.httpProxyEndpoint(ep.name, fqdns);
  });
  return endPointMap;
}

type SubnetId = { type: 'SubnetId'; value: string };

export interface AutoscaleProcessorParams {
  /**
   * The AWS keyname used for the EC2 instance.
   */
  key_name: AT.KeyName;

  controller_enable: boolean;

  /**
   * The DNS name of the controller machine. This is a prefix to the shared primary DNS zone.
   * (ie if the value is aaa and the primary dns zone is helix.com, then the final DNS entry
   * will be aaa.helix.com).
   */
  controller_dns_name: string;

  /**
   * The S3 location where hx-deploy-tool releases are stored.
   */
  releases_s3: s3.S3Ref;

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
   * Additional operations for the controller first boot can be passed vis the operation.
   */
  controller_extra_bootscript?: bootscript.BootScript;

  /**
   * If true (or not specified), the bootscripts includes ec2InstallScript().
   * Otherwise it's assumed this software is baked into the AMI
   */
  bootscripts_include_install?: boolean;

  /**
   * Additional controller IAM policies can be specified here.
   */
  controller_extra_policies?: policies.NamedPolicy[];

  /**
   * Specifies the AMI for the controller. Defaults to an ubuntu 16.04 AMI
   * for the appropriate region.
   */
  controller_amis(region: AT.Region): AT.Ami;

  /**
   * The context files are fetched from S3 and made available to the controller instance for
   * interpolation into the deployed application configuration.
   */
  controller_deploy_contexts?: camus2.DeployContext[];

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
  appserver_amis(region: AT.Region): AT.Ami;

  /**
   * The context files are fetched from S3 and made available to hx-deploy-tool for interpolation
   * into the deployed application configuration.
   */
  appserver_deploy_contexts?: camus2.DeployContext[];

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
   * Customize the launch configuration
   */
  customize_launch_config?: Customize<AR.LaunchConfigurationParams>;

  /**
   * Customize the autoscaling group
   */
  customize_autoscaling_group?: Customize<AR.AutoscalingGroupParams>;

  /**
   * Substitute the default nginx template used.
   */
  frontendproxy_nginx_conf_tpl?: string;

  /**
   * If true `tfgen.scopedName(name).join('-')` is used as the name.
   * Else name is undefined and Terraform will assign a random, unique name.
   *
   * Note changing this for existing infra will forces new resource.
   * see
   * https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lb_target_group#name
   *
   * This caused a PLP prod outage.
   *
   * Recommend using false for existing infra and true for new.
   */
   target_group_generate_name: boolean;

  /**
   * Health check config
   */
  health_check?: C.HealthCheckConfig;

  /**
   * Use legacy hx-deploy-tool. If not specified, camus2
   * will be used
   */
  use_hxdeploytool?: boolean;

  /**
   * Nginx version to use for camus2
   */
  nginxDockerVersion?: string,
}

export interface AutoscaleFrontendParams extends AutoscaleProcessorParams {
  /**
   * The endpoints configured for http/https access.
   */
  endpoints: EndPoint[];

  /**
   * Specify the means by which we obtain/generate the SSL certificate
   */
  acm_certificate?: AcmCertificateSource;

  /**
   * Customise underlying load balancer (if required)
   * https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html
   */
  customize_lb?: Customize<AR.LbParams>;

  /**
   * Health check config
   */
  health_check: C.HealthCheckConfig;
}

type AcmCertificateSource =
  | { kind: 'existing'; arn: AR.AcmCertificateArn }
  | { kind: 'generate' }
  | { kind: 'generate_with_manual_verify' };

export interface AutoscaleDeployment {
  autoscale_processor: AutoscaleProcessor;
  target_group: AR.LbTargetGroup;
  load_balancer: AR.Lb;
  lb_https_listener: AR.LbListener;
}

export interface AutoscaleProcessor {
  autoscaling_group: AR.AutoscalingGroup;
  instance_profile: AR.IamInstanceProfile;
}

/**
 * Creates a set of cron based scaling rules for the specified autoscaling group
 */
export function createAutoscalingCronSchedule(
  tfgen: TF.Generator,
  name: string,
  params: AutoscalingCronScheduleParams
) {
  params.rules.forEach((rule, i) => {
    const rname = name + '_' + (i + 1);
    const sname = tfgen.scopedName(rname).join('_');
    AR.createAutoscalingSchedule(tfgen, rname, {
      autoscaling_group_name: params.autoscaling_group.name,
      scheduled_action_name: sname,
      recurrence: rule.recurrence,
      // Need -1 here to say leave the existing value unchanged.
      min_size: rule.min_size === undefined ? -1 : rule.min_size,
      max_size: rule.max_size === undefined ? -1 : rule.max_size,
      desired_capacity:
        rule.desired_capacity === undefined ? -1 : rule.desired_capacity,
    });
  });
}

interface AutoscalingCronScheduleParams {
  autoscaling_group: AR.AutoscalingGroup;
  rules: AutoscalingCronRule[];
}

interface AutoscalingCronRule {
  recurrence: string; // in cron syntax
  min_size?: number;
  max_size?: number;
  desired_capacity?: number;
}


/**
 *  Creates a logical deployment on an aws EC2 autoscaling group, including:
 *
 *      - the autoscale group itself
 *      - a controller machine
 *      - AWS generated SSL certificates
 *      - DNS entries for the endpoints
 *      - Load balancer in front of autoscaling group
 *
 * hx-deploy-tool is configured onto the group, running in remote proxy mode.
 *
 * DEPRECATED: as it will generated duplicate names if used multiple times. Use createAutoscaleFrontend instead
 */
export function createAutoscaleDeployment_DEPRECATED(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResourcesNEI,
  params: AutoscaleFrontendParams,
  nginxDockerVersion?: string,
): AutoscaleDeployment {
  const controller = createController(
    tfgen,
    'controller',
    sr,
    params,
    params.endpoints,
    nginxDockerVersion === undefined ? DEFAULT_NGINX_DOCKER_VERSION : nginxDockerVersion,
  );
  const autoscale_processor = createProcessorAutoScaleGroup(
    tfgen,
    'appserver',
    sr,
    params,
    params.endpoints,
    nginxDockerVersion === undefined ? DEFAULT_NGINX_DOCKER_VERSION : nginxDockerVersion,
  );

  const https_fqdns: string[] = httpsFqdnsFromEndpoints(sr, params.endpoints);
  // Create a new certificate if an existing certificate ARN isn't provided.
  // When new domains are added, the certificate is deleted and re-created, in this situation,
  // we need the certificate to be created first (as it can't be deleted while connectec to an ALB)
  const acm_certificate_arn =
    params.acm_certificate === undefined
      ? createAcmCertificate(tfgen, sr, https_fqdns, true)
      : params.acm_certificate.kind === 'generate'
        ? createAcmCertificate(tfgen, sr, https_fqdns, true)
        : params.acm_certificate.kind === 'generate_with_manual_verify'
          ? createAcmCertificate(tfgen, sr, https_fqdns, false)
          : params.acm_certificate.arn;

  const lb = createLoadBalancer(tfgen, 'lb', sr, {
    acm_certificate_arn,
    customize_lb:params.customize_lb
  });
  const tg = createAutoscaleTargetGroup(
    tfgen,
    'appserver',
    sr,
    lb,
    autoscale_processor.autoscaling_group,
    params,
  );

  return {
    autoscale_processor,
    target_group: tg.target_group,
    load_balancer: lb.lb,
    lb_https_listener: tg.lb_https_listener,
  };
}



