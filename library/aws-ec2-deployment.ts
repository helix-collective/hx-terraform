import * as _ from 'lodash';
import * as TF from "../core/core"
import * as AT from "../providers/aws-types";
import * as AR from "../providers/aws-resources";

import * as aws from "./aws";
import * as roles from "./aws-roles";
import * as alarms from "./aws-alarms";
import * as policies from "./aws-policies";
import * as shared from "./aws-shared";
import * as util from "./util";
import * as s3 from "./aws-s3";
import * as bootscript from "./bootscript";
import * as docker from "./docker";
import * as deploytool from "./deploytool";
import { Transform } from 'stream';

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
export function createEc2Deployment(tfgen: TF.Generator, name: string, sr: shared.SharedResources, params: Ec2DeploymentParams) : Ec2Deployment {
    
    // Build the bootscript for the instance
    const bs = bootscript.newBootscript();
    const app_user = params.app_user || "app";
    const docker_config = params.docker_config || docker.DEFAULT_CONFIG;
    let context_files = [
        {name:INFRASTRUCTURE_JSON, source_name: INFRASTRUCTURE_JSON},
        {name:SECRETS_JSON, source_name: SECRETS_JSON },
    ];
    if (params.extra_context_files) {
        context_files = context_files.concat(params.extra_context_files(params.config_s3));
    }
    let endpoints = params.endpoints || [
        {name: "main", dnsname: params.dns_name},
        {name: "test", dnsname: params.dns_name + "-test"},
    ];
    bs.utf8Locale()
    bs.dockerWithConfig(docker_config);
    bs.createUserWithKeypairAccess(app_user);
    bs.addUserToGroup(app_user, "docker");
    bs.cloudwatchMetrics(app_user);

    const ssl_cert_dns_names = endpoints.map( ep => shared.fqdn(sr, ep.dnsname));
    const ssl_cert_dir = "/etc/letsencrypt/live/" + ssl_cert_dns_names[0];
    const proxy_endpoints = endpoints.map(ep => 
        deploytool.httpsProxyEndpoint(ep.name, shared.fqdn(sr, ep.dnsname), ssl_cert_dir)
    );
    bs.include(
        deploytool.install(app_user, params.releases_s3, params.config_s3, context_files, deploytool.localProxy(proxy_endpoints))
    )
    bs.letsencyptAwsRoute53(params.ssl_cert_email, ssl_cert_dns_names);

    let iampolicies = [
        policies.publish_metrics_policy,
        aws.s3DeployBucketReadOnlyPolicy(sr),
        policies.route53ModifyZonePolicy("modifydns", sr.primary_dns_zone),
      ];
    if (params.extra_policies) {
        iampolicies = iampolicies.concat(params.extra_policies);
    }

    const instance_profile = roles.createInstanceProfileWithPolicies(tfgen, "appserver", iampolicies);

    const appserver = aws.createInstanceWithEip(tfgen, "appserver", sr, {
        instance_type: params.instance_type,
        ami: params.ami || getDefaultAmi,
        security_group: sr.appserver_security_group,
        key_name: params.key_name,
        customize_instance: (i:AR.InstanceParams) => {
            i.user_data = bs.compile();
            i.iam_instance_profile = TF.refAttribute(instance_profile.id);
        }
    });

    endpoints.forEach( ep => {
        shared.dnsARecord(tfgen, "appserver_" + ep.name, sr, ep.dnsname, [TF.refAttribute(appserver.eip.public_ip)], "3600");
    })

    return appserver;
}

export interface Ec2DeploymentParams {
  key_name: AT.KeyName,
  instance_type: AT.InstanceType;
  dns_name: string,
  ssl_cert_email: string,
  releases_s3 : s3.S3Ref,
  config_s3: s3.S3Ref,

  app_user?: string,
  endpoints? : EndPoint[],
  ami?(region: AT.Region): AT.Ami,
  extra_policies?: policies.NamedPolicy[],
  extra_context_files?: (ref:s3.S3Ref) => deploytool.ContextFile[],
  extra_bootscript? : bootscript.BootScript,
  docker_config?: docker.DockerConfig
}

export interface EndPoint {
    name: string, 
    dnsname: string
};

interface Ec2Deployment  {
    eip: AR.Eip, 
    ec2: AR.Instance
}

/**
 * Standard ubuntu base AMIs.
 * 
 * (ubuntu xenial, hvm:ebs-ssd)
 */
function getDefaultAmi(region: AT.Region): AT.Ami {
  if (region.value === AT.ap_southeast_2.value) {
      return AT.ami("ami-47c21a25");
  } else if (region.value === AT.us_east_1.value) {
      return AT.ami("ami-759bc50a");
  } if (region.value === AT.us_east_2.value) {
      return AT.ami("ami-5e8bb23b");
  }
  throw new Error("No AMI specified for region " + region.value);
}

export const INFRASTRUCTURE_JSON = "infrastructure.json";
export const SECRETS_JSON = "secrets.json";
