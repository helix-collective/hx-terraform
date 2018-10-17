/**
 *  Module configuring AWS resources shared accross all projects in an AWS (account,region)
 *
 *  (includes VPC and networking etc)
 */

import * as TF from "../core/core";
import * as AT from "../providers/aws-types";
import * as AR from "../providers/aws-resources";
import * as s3 from "./aws-s3";
import {ingressOnPort, egress_all, contextTagsWithName} from "./util";
import {s3ModifyPolicy, ecr_modify_all_policy} from "./aws-policies";
import { RSA_NO_PADDING } from "constants";

/**
 * A configuration for an entire VPC, with a public
 * and private subnet in each availability zone
 */
export interface NetworkConfig {
  region: AT.Region,
  cidr_block: AT.CidrBlock,
  azs: AzConfig[]
};

/**
 * The configuration for a network availability zone, containing a
 * a public (external) and a private (internal) subnet.
 */
export interface AzConfig {
  azname: string,
  availability_zone: AT.AvailabilityZone,
  internal_cidr_block: AT.CidrBlock,
  external_cidr_block: AT.CidrBlock
};

/**
 *  Shared resources created once for a region in a given AWS account. These include:
 *    - a VPC and network resources
 *    - standard s3 buckets
 *    - a route53 DNS zone
 *    - common security groups
 *    - SNS topics for alerts and alarms
 */
export interface SharedResources {
  network: NetworkResources,
  primary_dns_zone: AR.Route53Zone,
  domain_name: string,
  deploy_bucket: AR.S3Bucket,
  deploy_bucket_name: string,
  backup_bucket: AR.S3Bucket,
  backup_bucket_name: string,
  bastion_security_group: AR.SecurityGroup,
  appserver_security_group: AR.SecurityGroup,
  load_balancer_security_group: AR.SecurityGroup,
  alert_topic: AR.SnsTopic,
  alarm_topic: AR.SnsTopic,
};

export interface NetworkResources {
  vpc: AR.Vpc,
  azs: AzResources[],
  region: AT.Region,
}

export interface AzResources {
  azname: string,
  external_subnet: AR.Subnet,
  internal_subnet: AR.Subnet
}

/**
 * Construct the share resources for an AWS account and region
 */
export function createResources(tfgen: TF.Generator, domain_name: string, s3_bucket_prefix: string, network_config:NetworkConfig) : SharedResources {

  const network = createNetworkResources(tfgen,network_config);
  const primary_dns_zone = AR.createRoute53Zone(tfgen, "primary", {
    name: domain_name,
    tags: tfgen.tagsContext()
  })

  const deploy_bucket_name = s3_bucket_prefix + "-shared-deploy";
  const deploy_bucket = AR.createS3Bucket(tfgen, "deploy", {
    bucket: deploy_bucket_name,
    versioning: {
      enabled: true
    },
    tags: tfgen.tagsContext()
  });

  const backup_bucket_name = s3_bucket_prefix + "-shared-backups";
  const backup_bucket = AR.createS3Bucket(tfgen, "backup", {
    bucket: backup_bucket_name,
    versioning: {
      enabled: true
    },
    tags: tfgen.tagsContext()
  });

  const bastion_security_group = AR.createSecurityGroup(tfgen, "bastion", {
    vpc_id: TF.refAttribute(network.vpc.id),
    ingress: [ingressOnPort(22)],
    egress: [egress_all],
    tags: contextTagsWithName(tfgen, "bastion")
  });

  const appserver_security_group = AR.createSecurityGroup(tfgen, "appserver", {
    vpc_id: TF.refAttribute(network.vpc.id),
    ingress: [ingressOnPort(22), ingressOnPort(80), ingressOnPort(443)],
    egress: [egress_all],
    tags: contextTagsWithName(tfgen, "appserver")
  });

  const load_balancer_security_group = AR.createSecurityGroup(tfgen, "lb", {
    vpc_id: TF.refAttribute(network.vpc.id),
    ingress: [ingressOnPort(80), ingressOnPort(443)],
    egress: [egress_all],
    tags: contextTagsWithName(tfgen, "lb")
  });

  const buildbot_user = AR.createIamUser(tfgen, "buildbot", {
    name: tfgen.scopedName("buildbot").join('_')
  });

  const modifys3deploy = s3ModifyPolicy("modifys3deploy", deploy_bucket_name);

  AR.createIamUserPolicy(tfgen, "modifys3deploy", {
    name: tfgen.scopedName("modifys3deploy").join('_'),
    policy: JSON.stringify(modifys3deploy.policy, null, 2),
    user: TF.refStringAttribute(buildbot_user.name)
  });

  AR.createIamUserPolicy(tfgen, "ecrmodifyall", {
    name: tfgen.scopedName("ecrmodifyall").join('_'),
    policy: JSON.stringify(ecr_modify_all_policy.policy, null, 2),
    user: TF.refStringAttribute(buildbot_user.name)
  });

  AR.createIamUserPolicyAttachment(tfgen, "readonly", {
    user: TF.refStringAttribute(buildbot_user.name),
    policy_arn: AT.arn("arn:aws:iam::aws:policy/ReadOnlyAccess")
  });

  const alarm_topic = AR.createSnsTopic(tfgen, "alarms", {
    name: tfgen.scopedName("alarms").join("_")
  });

  const alert_topic = AR.createSnsTopic(tfgen, "alerts", {
    name: tfgen.scopedName("alerts").join("_")
  });

  return {
    network,
    primary_dns_zone,
    domain_name,
    deploy_bucket,
    deploy_bucket_name,
    backup_bucket,
    backup_bucket_name,
    bastion_security_group,
    appserver_security_group,
    load_balancer_security_group,
    alert_topic,
    alarm_topic,
  };
}

function createNetworkResources(tfgen: TF.Generator, network_config:NetworkConfig) : NetworkResources {
  const vpc = AR.createVpc(tfgen, "vpc", {
    cidr_block: network_config.cidr_block,
    enable_dns_hostnames: true,
    tags: contextTagsWithName(tfgen, "vpc")
  });

  const internet_gateway = AR.createInternetGateway(tfgen, "gw", {
    vpc_id: TF.refAttribute(vpc.id),
    tags: contextTagsWithName(tfgen, "gw")
  });

  const rtexternal = AR.createRouteTable(tfgen, "rtexternal", {
    vpc_id: TF.refAttribute(vpc.id),
    tags: contextTagsWithName(tfgen, "rtexternal")
  });

  AR.createRoute(tfgen, "r", {
    route_table_id: TF.refAttribute(rtexternal.id),
    destination_cidr_block: AT.cidrBlock("0.0.0.0/0"),
    gateway_id: TF.refAttribute(internet_gateway.id),
  });

  const azs = network_config.azs.map( az => {
    return TF.withLocalNameScope( tfgen, az.azname, tfgen => {

      const external_subnet = AR.createSubnet(tfgen, "external", {
        vpc_id: TF.refAttribute(vpc.id),
        cidr_block: az.external_cidr_block,
        availability_zone: az.availability_zone,
        tags: contextTagsWithName(tfgen, "external")
      });

      const eip = AR.createEip(tfgen, "ngeip", {
        vpc: true
      });

      const nat_gateway = AR.createNatGateway(tfgen, "ng", {
        allocation_id: TF.refAttribute(eip.id),
        subnet_id: TF.refAttribute(external_subnet.id),
      });
      tfgen.dependsOn(nat_gateway, internet_gateway);

      AR.createRouteTableAssociation(tfgen, "raexternal", {
        subnet_id: TF.refAttribute(external_subnet.id),
        route_table_id: TF.refAttribute(rtexternal.id)
      });

      const rtinternal = AR.createRouteTable(tfgen, "rtinternal", {
        vpc_id: TF.refAttribute(vpc.id),
        tags: contextTagsWithName(tfgen, "rtinternal")
      });

      AR.createRoute(tfgen, "r1", {
        route_table_id: TF.refAttribute(rtinternal.id),
        destination_cidr_block: AT.cidrBlock("0.0.0.0/0"),
        nat_gateway_id: TF.refAttribute(nat_gateway.id),
      });

      const internal_subnet = AR.createSubnet(tfgen, "internal", {
        vpc_id: TF.refAttribute(vpc.id),
        cidr_block: az.internal_cidr_block,
        availability_zone: az.availability_zone,
        tags: contextTagsWithName(tfgen, "internal")
      });

      AR.createRouteTableAssociation(tfgen, "rtainternal", {
        subnet_id: TF.refAttribute(internal_subnet.id),
        route_table_id: TF.refAttribute(rtinternal.id)
      });

      return {
        azname: az.azname,
        external_subnet,
        internal_subnet
      }
    });
  });

  return {vpc, azs, region: network_config.region};
}


/**
 * Create a DNS A record in the primary dns zone
 */
export function dnsARecord(tfgen: TF.Generator, name: string, sr: SharedResources, dnsname: string, ipaddresses:AT.IpAddress[], ttl: string ) {
  AR.createRoute53Record(tfgen, name, {
      zone_id: TF.refAttribute(sr.primary_dns_zone.zone_id),
      name: dnsname,
      type: "A",
      ttl: ttl,
      records: ipaddresses.map( a => a.value)
  })
}

/**
 * Return the full qualified domain name for a host in the primary dns zone
 */
export function fqdn(sr: SharedResources, dnsname: string) {
  return dnsname + "." + sr.domain_name;
}

/** 
 * Return a s3 reference into the shared deployment bucket 
 */
export function getScopedS3Ref(tfgen: TF.Generator, sr: SharedResources): s3.S3Ref {
  return new s3.S3Ref(sr.deploy_bucket_name, tfgen.nameContext().join("/"));
}

