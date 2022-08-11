import { DEFAULT_NGINX_DOCKER_VERSION } from './defaults.ts';
import * as TF from '../../core/core.ts';
import * as AT from '../../providers/aws/types.ts';
import * as AR from '../../providers/aws/resources.ts';

import * as aws from './aws.ts';
import * as roles from './roles.ts';
import * as shared from './shared.ts';
import * as s3 from './s3.ts';
import * as bootscript from '../bootscript.ts';
import * as policies from './policies.ts';
import * as docker from '../docker.ts';
import * as camus2 from '../camus2/camus2.ts';
import * as C from '../../library/camus2/adl-gen/config.ts';
import * as amis from './amis.ts';

import {
  EndPoint,
  httpsFqdnsFromEndpoints,
  ec2InstallScript,
} from './ec2-deployment.ts';
import { contextTagsWithName, Customize, applyCustomize } from '../util.ts';

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
  sr: shared.SharedResources,
  params: AutoscaleFrontendParams,
  nginxDockerVersion?: string,
): AutoscaleDeployment {
  if( !params.health_check.outgoingPath.startsWith('/') ) {
    throw new Error("params.health_check.outgoingPath must start with '/'")
  }
  return TF.withLocalNameScope(tfgen, name, tfgen => {
    if (params.create_controller) {
      createController(
        tfgen,
        'controller',
        sr,
        params,
        params.create_controller,
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

    const acm_certificate_arn = handleMakeAcmCertificateCases(tfgen, sr, params.endpoints, params.acm_certificate);

    const lb = createLoadBalancer(tfgen, 'lb', sr, {
      customize_lb: params.customize_lb,
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
  sr: shared.SharedResources,
  params: AutoscaleProcessorParams,
): AutoscaleProcessor {
  return TF.withLocalNameScope(tfgen, name, tfgen => {
    if (params.create_controller) {
      createController(
        tfgen,
        'controller',
        sr,
        params,
        params.create_controller,
        [],
        params.nginxDockerVersion === undefined
            ? DEFAULT_NGINX_DOCKER_VERSION : params.nginxDockerVersion,
      );
    }
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
  sr: shared.SharedResources,
  pparams: AutoscaleProcessorParams,
  cparams: ControllerParams,
  endpoints: EndPoint[],
  nginxDockerVersion: string,
) {
  const controller_label = cparams.label || name;
  const subnetId = shared.externalSubnetIds(sr)[0];

  const bsf = new ControllerBootScriptFactory(sr, pparams,cparams.deploy_contexts || [],  endpoints, nginxDockerVersion);
  const bs = cparams.bootscript
   ? cparams.bootscript(bsf)
   : bsf.installAndConfigure();

  let controller_iampolicies: policies.NamedPolicy[] = [aws.s3DeployBucketModifyPolicy(sr)];

  if (cparams.extra_policies) {
    controller_iampolicies = controller_iampolicies.concat(cparams.extra_policies);
  }

  const controller_instance_profile = roles.createInstanceProfileWithPolicies(
    tfgen,
    controller_label,
    controller_iampolicies
  );

  const controller = aws.createInstanceWithEip(tfgen, controller_label, sr, shared.externalSubnetIds(sr)[0], {
    instance_type: cparams.instance_type ? cparams.instance_type : AT.t3_nano,
    ami: cparams.amis,
    security_group: sr.bastion_security_group,
    key_name: pparams.key_name,
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
    cparams.dns_name,
    [controller.eip.public_ip],
    '3600'
  );

  return {};
}

export function createProcessorAutoScaleGroup(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
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
  const bsf = new AsgBootScriptFactory(sr, params, endpoints, nginxDockerVersion);
  const bs = params.appserver_bootscript
   ? params.appserver_bootscript(bsf)
   : bsf.installAndConfigure();

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
    image_id: params.appserver_amis(sr.region),
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
    vpc_zone_identifier: shared.internalSubnetIds(sr),
    launch_configuration: launch_config.name,
    enabled_metrics: ['GroupInServiceInstances', 'GroupDesiredCapacity'],
    termination_policies: [
      // flush out old instances when asg size reduces
      'OldestInstance',
    ],
    tag: Object.entries(contextTagsWithName(tfgen, name)).map(
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

  // https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/autoscaling_attachment#with-an-autoscaling-group-resource
  //
  // > Terraform currently provides both a standalone aws_autoscaling_attachment
  // > resource (describing an ASG attached to an ELB or ALB), and an
  // > aws_autoscaling_group with load_balancers and target_group_arns defined
  // > in-line. These two methods are not mutually-exclusive. If
  // > aws_autoscaling_attachment resources are used, either alone or with inline
  // > load_balancers or target_group_arns, the aws_autoscaling_group resource
  // > must be configured to ignore changes to the load_balancers and
  // > target_group_arns arguments within a lifecycle configuration block.
  //
  // Because we are using aws_autoscaling_group_attachment ignore this
  // changes as per doc.
  tfgen.ignoreChanges(autoscaling_group, 'load_balancers');
  tfgen.ignoreChanges(autoscaling_group, 'target_group_arns');

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

export function createLoadBalancer(tfgen: TF.Generator, tfname: string, sr: shared.SharedResources,
  params: {
    acm_certificate_arn: AT.ArnT<'AcmCertificate'>,
    customize_lb?: Customize<AR.LbParams>;
    customize_http_listener?: Customize<AR.LbListenerParams>;
    customize_https_listener?: Customize<AR.LbListenerParams>;
    alb_name?: string;
    internal?: boolean;
  } ): LoadBalancerAndListeners {
    const lbParams: AR.LbParams = {
      name: tfgen.scopedName(tfname).join('-'),
      load_balancer_type: 'application',
      tags: tfgen.tagsContext(),
      security_groups: [sr.load_balancer_security_group.id],
      subnets: params.internal ? shared.internalSubnetIds(sr) : shared.externalSubnetIds(sr),
      internal: params.internal,
    };
    const lb = AR.createLb(
      tfgen,
      params.alb_name || 'alb',
      applyCustomize(params.customize_lb, lbParams)
    );
  const http_listener_params: AR.LbListenerParams = {
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
  };
  const lb_http_listener = AR.createLbListener(
    tfgen,
    tfname + '_http',
    applyCustomize(params.customize_http_listener, http_listener_params)
  );

  const https_listener_params: AR.LbListenerParams = {
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
    }
  };
  const lb_https_listener = AR.createLbListener(
    tfgen,
    tfname + '_https',
    applyCustomize(params.customize_https_listener, https_listener_params),
  );

  return {lb, http_listener: lb_http_listener, https_listener: lb_https_listener};
}


export type TargetGroupResources = {
  load_balancer: AR.Lb;
  target_group: AR.LbTargetGroup;
  lb_https_listener: AR.LbListener;
};

export function createAutoscaleTargetGroupInVpc(
  tfgen: TF.Generator,
  name: string,
  vpc: AR.Vpc,
  dr: shared.DomainResources,
  lb: LoadBalancerAndListeners,
  autoscaling_group: AR.AutoscalingGroup,
  params: {
    endpoints: EndPoint[];
    health_check: C.HealthCheckConfig;
    target_group_generate_name?: boolean;
  },
): TargetGroupResources {
  const https_fqdns: string[] = httpsFqdnsFromEndpoints(dr, params.endpoints);

  const alb_target_group = AR.createLbTargetGroup(tfgen, 'tg80', {
    name: params.target_group_generate_name ? tfgen.scopedName(name).join('-') : undefined,
    port: 80,
    protocol: 'HTTP',
    vpc_id: vpc.id,
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
  const hosts: string[] = httpsFqdnsFromEndpoints(dr, params.endpoints);
  const hosts_max5: string[][] = [];
  for (let i=0; i<hosts.length; i+=5) {
    hosts_max5.push(hosts.slice(i,i+5));
  }
  for(let i = 0; i < hosts_max5.length; i+=1) {
    const tfname = 'https' + (i === 0 ? '' : i+1);
    AR.createLbListenerRule(tfgen, tfname, {
      listener_arn: lb.https_listener.arn,
      condition: [{
        host_header: {
          values: hosts_max5[i],
        },
      }],
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
          dr,
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

export function createAutoscaleTargetGroup(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  lb: LoadBalancerAndListeners,
  autoscaling_group: AR.AutoscalingGroup,
  params: {
    endpoints: EndPoint[];
    health_check: C.HealthCheckConfig;
    target_group_generate_name?: boolean;
  },
): TargetGroupResources {
  return createAutoscaleTargetGroupInVpc(tfgen, name, sr.vpc, sr, lb, autoscaling_group, params);
}

function handleMakeAcmCertificateCases(tfgen: TF.Generator, sr: shared.SharedResources, endpoints: EndPoint[], src: AcmCertificateSource ) {
  if(src.kind === 'existing') {
    // preferred option: make the ACM certificate somewhere else explicitly
    // (manual or an explicit terraform call).
    return src.arn;
  }

  // Create a new certificate if an existing certificate ARN isn't provided.

  // When new domains are added, the certificate is deleted and re-created, in this situation,
  // we need the certificate to be created first (as it can't be deleted while connectec to an ALB)

  const https_fqdns: string[] = httpsFqdnsFromEndpoints(sr, endpoints);
  const auto_verify = (src.kind !== 'generate_with_manual_verify');

  return createAcmCertificate(tfgen, sr, {
    https_fqdns,
    auto_verify
  });
}

export type AcmCertificateParams = {
  https_fqdns: string[],
  auto_verify: boolean
};
export function createAcmCertificate(
  tfgen: TF.Generator,
  sr: shared.DomainResources,
  params: AcmCertificateParams
): AR.AcmCertificateArn {
  const {https_fqdns, auto_verify} = params;

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
  dr: shared.DomainResources,
  endpoints: EndPoint[]
): camus2.EndPointMap {
  const endPointMap: camus2.EndPointMap = {};
  endpoints.forEach(ep => {
    const fqdns: string[] = [];
    ep.urls.forEach(url => {
      if (url.kind === 'https') {
        fqdns.push(shared.fqdn(dr, url.dnsname.replace("TFRAWEXPR:\"","").replace("\"", "")));
        if (url.proxied_from !== undefined) {
          url.proxied_from.forEach(pfqdns => {
            fqdns.push(pfqdns.replace("TFRAWEXPR:\"","").replace("\"", ""));
          });
        }
      } else if (url.kind === 'https-external') {
        fqdns.push(url.fqdnsname.replace("TFRAWEXPR:\"","").replace("\"", ""));
        if (url.proxied_from !== undefined) {
          url.proxied_from.forEach(pfqdns => {
            fqdns.push(pfqdns);
          });
        }
      } else if (url.kind === 'http') {
        fqdns.push(url.fqdnsname.replace("TFRAWEXPR:\"","").replace("\"", ""));
      }
    });
    endPointMap[ep.name] = camus2.httpProxyEndpoint(ep.name, fqdns);
  });
  return endPointMap;
}

export interface AutoscaleProcessorParams {
  /**
   * The AWS keyname used for the EC2 instance.
   */
  key_name: AT.KeyName;


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
   * Override the default bootscript
   */
  appserver_bootscript?(bsf: BootScriptFactory) : bootscript.BootScript,

  /**
   * The AWS instance type (ie mem and cores) for the EC2 instance.
   */
  appserver_instance_type: AT.InstanceType;

  /**
   * Specifies the AMI for the EC2 instances. Defaults to an ubuntu 16.04 AMI
   * for the appropriate region.
   */
  appserver_amis: amis.AmiSelector;

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
   * Health check config
   */
  health_check?: C.HealthCheckConfig;

  /**
   * Nginx version to use for camus2
   */
  nginxDockerVersion?: string,

  /**
   * If set, create a controller/bastion machine
   */
  create_controller?: ControllerParams;
}


export interface ControllerParams {
  /**
   * The DNS name of the controller machine. This is a prefix to the shared primary DNS zone.
   * (ie if the value is aaa and the primary dns zone is helix.com, then the final DNS entry
   * will be aaa.helix.com).
   */
  dns_name: string;

  /**
   * Override the bootscript for the controller.
   */
   bootscript?(bsf: BootScriptFactory) : bootscript.BootScript,

  /**
   * Additional controller IAM policies can be specified here.
   */
   extra_policies?: policies.NamedPolicy[];

   /**
    * Specifies the AMI for the controller. Defaults to an ubuntu 16.04 AMI
    * for the appropriate region.
    */
   amis: amis.AmiSelector;

   /**
    * The context files are fetched from S3 and made available to the controller instance for
    * interpolation into the deployed application configuration.
    */
   deploy_contexts?: camus2.DeployContext[];

   /**
    * Label the deploy master instance and associated resources for client convenience
    */
   label?: string;

   /**
    * Instance type of the controller
    */
   instance_type?: AT.InstanceType;
};



export interface AutoscaleFrontendParams extends AutoscaleProcessorParams {
  /**
   * The endpoints configured for http/https access.
   */
  endpoints: EndPoint[];

  /**
   * Specify the means by which we obtain/generate the SSL certificate
   */
  acm_certificate: AcmCertificateSource;

  /**
   * Customise underlying load balancer (if required)
   * https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html
   */
  customize_lb?: Customize<AR.LbParams>;

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
  health_check: C.HealthCheckConfig;

  /**
   * If set, create a controller/bastion machine
   */
  create_controller?: ControllerParams;
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

/// Factory for the components of an ec2 instance bootscript
export interface BootScriptFactory {

  // Install software including camus2
  install(): bootscript.BootScript,

  // Configure software including camus2
  configure(): bootscript.BootScript

  // Install & Configure software including camus2
  installAndConfigure(): bootscript.BootScript
}

// Factory to build controller bootscripts
class ControllerBootScriptFactory implements BootScriptFactory {
  constructor(
    readonly dr: shared.DomainResources,
    readonly params: AutoscaleProcessorParams,
    readonly deployContexts: camus2.DeployContext[],
    readonly endpoints: EndPoint[],
    readonly nginxDockerVersion: string,
  ) {}

  install(): bootscript.BootScript {
    const app_user = appUserOrDefault(this.params.app_user);
    const docker_config = this.params.docker_config || docker.DEFAULT_CONFIG;
    return ec2InstallScript(app_user, docker_config, true);
  }

  configure(): bootscript.BootScript {
    const app_user = appUserOrDefault(this.params.app_user);
    const releases_s3 = this.params.releases_s3;
    const state_s3 = this.params.state_s3;

    const proxy_endpoints = deployToolEndpoints(this.dr, this.endpoints);

    return camus2.configureCamus2({
        username: app_user,
        releases: releases_s3,
        deployContexts: this.deployContexts,
        proxy: camus2.remoteProxyMaster(proxy_endpoints, state_s3),
        nginxDockerVersion: this.nginxDockerVersion,
        healthCheck: this.params.health_check,
        frontendproxy_nginx_conf_tpl: this.params.frontendproxy_nginx_conf_tpl,
    })
  }

  installAndConfigure(): bootscript.BootScript {
    const bs = new bootscript.BootScript()
    bs.include(this.install())
    bs.include(this.configure())
    return bs
  }

};

// Factory to build asg instance bootscripts
class AsgBootScriptFactory implements BootScriptFactory {
  constructor(
    readonly dr: shared.DomainResources,
    readonly params: AutoscaleProcessorParams,
    readonly endpoints: EndPoint[],
    readonly nginxDockerVersion: string,
  ) {}

  install(): bootscript.BootScript {
    const app_user = appUserOrDefault(this.params.app_user);
    const docker_config = this.params.docker_config || docker.DEFAULT_CONFIG;
    return ec2InstallScript(app_user, docker_config, true);
  }

  configure(): bootscript.BootScript {
    const app_user = appUserOrDefault(this.params.app_user);
    const state_s3 = this.params.state_s3;
    const deploy_contexts: camus2.DeployContext[] =
      this.params.appserver_deploy_contexts || [];
    const proxy_endpoints = deployToolEndpoints(this.dr, this.endpoints);

    return camus2.configureCamus2({
        username: app_user,
        releases: this.params.releases_s3,
        deployContexts: deploy_contexts,
        proxy: camus2.remoteProxySlave(proxy_endpoints, state_s3),
        nginxDockerVersion: this.nginxDockerVersion,
        healthCheck: this.params.health_check,
        frontendproxy_nginx_conf_tpl: this.params.frontendproxy_nginx_conf_tpl,
      })
  }

  installAndConfigure(): bootscript.BootScript {
    const bs = new bootscript.BootScript()
    bs.include(this.install())
    bs.include(this.configure())
    return bs
  }
}
