/**
 *  Module configuring AWS resources shared accross all projects in an AWS (account,region)
 *
 *  (includes VPC and networking etc)
 */

import * as TF from '../../core/core';
import * as AT from '../../providers/aws/types';
import * as AR from '../../providers/aws/resources';
import * as s3 from './s3';
import { Customize, ingressOnPort, egress_all, contextTagsWithName } from '../util';
import { s3ModifyPolicy, ecr_modify_all_policy } from './policies';

/**
 * A configuration for an entire VPC, with a public
 * and private subnet in each availability zone
 */
export interface NetworkConfig {
  region: AT.Region;
  cidr_block: AT.CidrBlock;
  azs: AzConfig[];
  customize_security_groups?: Customize<SecurityGroupsConfig>;
};

/**
 * The configuration for a network availability zone, containing a
 * a public (external) and a private (internal) subnet.
 */
export interface AzConfig {
  azname: string;
  availability_zone: AT.AvailabilityZone;
  internal_cidr_block: AT.CidrBlock;
  external_cidr_block: AT.CidrBlock;
};

/**
 * An availability zone
 */
export interface AvailabilityZone {
  azname: string;
}

/**
 * An availability zone with an externally accessible
 * subnet
 */
export interface AzResourcesExternalSubnet {
  external_subnet: AR.Subnet;
  external_route_table_id: AR.RouteTableId;
}

/**
 * Resources for an availability zone and also with a
 * an internal subnet
 */
export interface AzResourcesInternalSubnet {
  internal_subnet: AR.Subnet;
  internal_route_table_id: AR.RouteTableId;
}


/**
 * SharedResources: Resources for an availability zone -
 *  maybe has public/external subnet
 *  maybe has private/internal subnet.
 */
export type PartialAzResources = AvailabilityZone & Partial<AzResourcesExternalSubnet & AzResourcesInternalSubnet>;

/**
 * SharedResources: Resources for an availability zone - with public/external subnet
 */
export type PublicAzResources = AvailabilityZone & AzResourcesExternalSubnet;

/**
 * SharedResources: Resources for an availability zone - with private/internal subnet
 */
export type PrivateAzResources = AvailabilityZone & AzResourcesInternalSubnet;

/**
 * SharedResources: Resources for an availability zone - with public/external subnet and private/internal subnet.
 */
export type SplitAzResources = AvailabilityZone & AzResourcesExternalSubnet & AzResourcesInternalSubnet;

/**
 * SharedResources: VPC and region resources
 */
export type RegionResources = {
  vpc: AR.Vpc;
  region: AT.Region;
  // internet_gateway: AR.InternetGateway;
};

/**
 * SharedResources: array of availability zones
 */
export type AzsResourcesT<AzR> = {
  azs: AzR[];
};

/**
 * SharedResources: Default AzsResources uses the option to specifiy possible
 *  public and private subnets in availability zones at runtime (not compile time)
 */
export type AzsResources = AzsResourcesT<PartialAzResources>;

/**
 * SharedResources: common parameters for network
 */
export type NetworkResources = RegionResources & AzsResources;

/**
 * SharedResources: route53 zone and primary domain name
 */
export type DomainResources = {
  domain_name: string;
  primary_dns_zone: AR.Route53Zone;
};

/**
 * SharedResources: shared buckets
 */
export type SharedBucketsResources = {
  s3_bucket_prefix: string;
  deploy_bucket: AR.S3Bucket;
  deploy_bucket_name: string;
  backup_bucket: AR.S3Bucket;
  backup_bucket_name: string;
};

/**
 * SharedResources: shared security groups
 */
export type SharedSecurityGroupResources = {
  bastion_security_group: AR.SecurityGroup;
  appserver_security_group: AR.SecurityGroup;
  load_balancer_security_group: AR.SecurityGroup;
  lambda_security_group: AR.SecurityGroup;
};

/**
 * SharedResources: shared SNS topics
 */
export type SharedSnsTopicResources = {
  alert_topic: AR.SnsTopic;
  alarm_topic: AR.SnsTopic;
};

/**
 *  Shared resources created once for a region in a given AWS account. These include:
 *    - a VPC and network resources
 *    -   (AzsResources uses the option to specifiy possible public and private subnets in availability zones at runtime (not compile time))
 *    -   Use function shared.externalSubnetIds and shared.internalSubnetIds to extract relevant subnet types where particularly relevant.
 *    - standard s3 buckets
 *    - a route53 DNS zone
 *    - common security groups
 *    - SNS topics for alerts and alarms
 */
export type SharedResources =
  & RegionResources
  & AzsResources
  & DomainResources
  & SharedBucketsResources
  & SharedSecurityGroupResources
  & SharedSnsTopicResources
;

/**
 * Construct the share resources for an AWS account and region
 */
export function createResources(
    tfgen: TF.Generator,
    domain_name: string,
    s3_bucket_prefix: string,
    network_config: NetworkConfig,
  ): SharedResources {
  const network = createNetworkResources(tfgen, network_config);
  const domain = createDomainResources(tfgen, {domain_name});
  const buckets = createSharedBucketsResources(tfgen, {s3_bucket_prefix});
  const securityGroups = createSharedSecurityGroupResources(tfgen, network, network_config.customize_security_groups);
  const snsTopics = createSharedSnsTopicsResources(tfgen, {});

  return {
    ...network,
    ...domain,
    ...buckets,
    ...securityGroups,
    ...snsTopics,
  };
}

/**
 *  Return the externally accessible public subnets on the network
 */
export function externalSubnetIds(params: AzsResources): AR.SubnetId[] {
  function hasExternalSubnet(az: PartialAzResources) : az is PublicAzResources {
    return az.external_subnet !== undefined;
  }
  const {azs} = params;
  const res = azs.filter(hasExternalSubnet).map(az=>az.external_subnet.id);
  if(res.length === 0) {
    throw new Error("No external subnets configured");
  }
  return res;
}

/**
 *  Return the internal subnets on the network
 */
export function internalSubnetIds(params: AzsResources): AR.SubnetId[] {
  function hasInternalSubnet(az: PartialAzResources) : az is SplitAzResources {
    return az.internal_subnet !== undefined;
  }
  const {azs} = params;
  const res = azs.filter(hasInternalSubnet).map(az=>az.internal_subnet.id);
  if(res.length === 0) {
    throw new Error("No internal subnets configured");
  }
  return res;
}

export type DomainParams = {domain_name: string};
export function createDomainResources(
  tfgen : TF.Generator,
  params : DomainParams
) : DomainResources {
  const {domain_name} = params;
  const primary_dns_zone = AR.createRoute53Zone(tfgen, 'primary', {
    name: domain_name,
    tags: tfgen.tagsContext(),
  });
  return {
    domain_name,
    primary_dns_zone
  }
}

export type SharedBucketParams = {
  s3_bucket_prefix: string,
  deploy?: Partial<AR.S3BucketParams>,
  backup?: Partial<AR.S3BucketParams>,
}
export function createSharedBucketsResources(tfgen: TF.Generator, params : SharedBucketParams) : SharedBucketsResources {
  const {s3_bucket_prefix} = params;

  const deploy_bucket_name = s3_bucket_prefix + '-shared-deploy';
  const deploy_bucket = AR.createS3Bucket(tfgen, 'deploy', {
    bucket: deploy_bucket_name,
    versioning: {
      enabled: true,
    },
    tags: tfgen.tagsContext(),
    ...params.deploy,
  });

  const backup_bucket_name = s3_bucket_prefix + '-shared-backups';
  const backup_bucket = AR.createS3Bucket(tfgen, 'backup', {
    bucket: backup_bucket_name,
    versioning: {
      enabled: true,
    },
    tags: tfgen.tagsContext(),
    ...params.backup,
  });

  return {
    s3_bucket_prefix,
    deploy_bucket,
    deploy_bucket_name,
    backup_bucket,
    backup_bucket_name
  };
}

export type SharedSecurityGroupParams = {
  vpc: AR.Vpc;
};
export type SecurityGroupsConfig = {
  bastion: AccessParams;
  appserver: AccessParams;
  lb: AccessParams;
  lambda: AccessParams;
};
export type AccessParams = {
  key: string;
  ingress?: AR.IngressRuleParams[];
  egress: AR.EgressRuleParams[];
}

export function createSharedSecurityGroupResources(tfgen: TF.Generator, params : SharedSecurityGroupParams, customize_security_groups?: Customize<SecurityGroupsConfig>) : SharedSecurityGroupResources {
  const sgConfig: SecurityGroupsConfig = {
    bastion: {
      key: "bastion",
      ingress: [ingressOnPort(22)],
      egress: [egress_all],
    },
    appserver: {
      key: "appserver",
      ingress: [ingressOnPort(22), ingressOnPort(80), ingressOnPort(443)],
      egress: [egress_all],
    },
    lb: {
      key: "lb",
      ingress: [ingressOnPort(80), ingressOnPort(443)],
      egress: [egress_all],
    },
    lambda: {
      key: "lambda",
      ingress: undefined,
      egress: [egress_all],
    },
  }
  if (customize_security_groups) {
    customize_security_groups(sgConfig);
  }
  return {
    bastion_security_group: createSG(tfgen, params, sgConfig.bastion),
    appserver_security_group: createSG(tfgen, params, sgConfig.appserver),
    load_balancer_security_group: createSG(tfgen, params, sgConfig.lb),
    lambda_security_group: createSG(tfgen, params, sgConfig.lambda),
  }
}

function createSG(tfgen: TF.Generator, params : SharedSecurityGroupParams, config: AccessParams) {
  const {vpc} = params;
  return AR.createSecurityGroup(tfgen, config.key, {
    ingress: config.ingress,
    egress: config.egress,
    tags: contextTagsWithName(tfgen, config.key),
    vpc_id: vpc.id,
  })
}

export function createSharedSnsTopicsResources(tfgen: TF.Generator, {}) : SharedSnsTopicResources {
  const alarm_topic = AR.createSnsTopic(tfgen, 'alarms', {
    name: tfgen.scopedName('alarms').join('_'),
  });

  const alert_topic = AR.createSnsTopic(tfgen, 'alerts', {
    name: tfgen.scopedName('alerts').join('_'),
  });
  return {
    alarm_topic,
    alert_topic
  };
}

export type BuildbotUserParams = {
  buckets: {deploy_bucket_name:string}
};
export function createBuildbotUser(tfgen : TF.Generator, {buckets: {deploy_bucket_name}} : BuildbotUserParams) : {} {
  const buildbot_user = AR.createIamUser(tfgen, 'buildbot', {
    name: tfgen.scopedName('buildbot').join('_'),
  });

  const modifys3deploy = s3ModifyPolicy('modifys3deploy', deploy_bucket_name);

  AR.createIamUserPolicy(tfgen, 'modifys3deploy', {
    name: tfgen.scopedName('modifys3deploy').join('_'),
    policy: JSON.stringify(modifys3deploy.policy, null, 2),
    user: buildbot_user.name,
  });

  AR.createIamUserPolicy(tfgen, 'ecrmodifyall', {
    name: tfgen.scopedName('ecrmodifyall').join('_'),
    policy: JSON.stringify(ecr_modify_all_policy.policy, null, 2),
    user: buildbot_user.name,
  });

  AR.createIamUserPolicyAttachment(tfgen, 'readonly', {
    user: buildbot_user.name,
    policy_arn: AT.arn('arn:aws:iam::aws:policy/ReadOnlyAccess'),
  });
  return {};
}

/**
 * Setup networking to use the default vpc and subnets
 */
export function useDefaultNetworkResources(
  tfgen: TF.Generator,
  region: AT.Region,
  azs0: AT.AvailabilityZone[],
): NetworkResources {
  const default_vpc = AR.createDefaultVpc(tfgen, "default", {});
  const vpc: AR.Vpc = {id:default_vpc.id, tftype:default_vpc.tftype, tfname:default_vpc.tfname, type:"Vpc", default_route_table_id: default_vpc.default_route_table_id};

  const azs: PublicAzResources[] = azs0.map( az => {
    const default_subnet = AR.createDefaultSubnet(tfgen, az.value, {
      availability_zone: az
    });
    const external_subnet: AR.Subnet = {id:default_subnet.id, tftype:default_subnet.tftype, tfname:default_subnet.tfname, type:"Subnet"};
    return {
      azname: az.value,
      external_subnet,
      external_route_table_id: vpc.default_route_table_id,
    };
  });

  // Cast default_vpc, default_subnet to a vpc, subnet
  return {
    region,
    vpc,
    azs
  }
}

// Generate VPC Endpoint for list of services.
// For example ['s3'] will generate endpoint for com.amazonaws.<region>.s3
export function createVpcEndpointsForServices(
  tfgen: TF.Generator,
  vpc: AR.Vpc,
  region: AT.Region,
  services: string[],
  endpointParams: Partial<AR.VpcEndpointParams>,
) {
  // Don't go through GW for predefined services.
  for (const service of services) {
    AR.createVpcEndpoint(tfgen, service, {
      vpc_id: vpc.id,
      tags: contextTagsWithName(tfgen, 'vpce_' + service),
      service_name: 'com.amazonaws.' + region.value + '.' + service,
      ...endpointParams,
    });
  }

}

export function createNetworkResources(
  tfgen: TF.Generator,
  network_config: NetworkConfig
): NetworkResources {
  const vpc = AR.createVpc(tfgen, 'vpc', {
    cidr_block: network_config.cidr_block,
    enable_dns_hostnames: true,
    tags: contextTagsWithName(tfgen, 'vpc'),
  });

  // Ignore eks related tags changes
  tfgen.ignoreChanges(vpc, 'tags.%');
  tfgen.ignoreChanges(vpc, 'tags.kubernetes.io/');

  const internet_gateway = AR.createInternetGateway(tfgen, 'gw', {
    vpc_id: vpc.id,
    tags: contextTagsWithName(tfgen, 'gw'),
  });

  const rtexternal = AR.createRouteTable(tfgen, 'rtexternal', {
    vpc_id: vpc.id,
    tags: contextTagsWithName(tfgen, 'rtexternal'),
  });

  AR.createRoute(tfgen, 'r', {
    route_table_id: rtexternal.id,
    destination_cidr_block: AT.cidrBlock('0.0.0.0/0'),
    gateway_id: internet_gateway.id,
  });

  const azs = network_config.azs.map(az => {
    return TF.withLocalNameScope(tfgen, az.azname, tfgen => {
      const external_subnet = AR.createSubnet(tfgen, 'external', {
        vpc_id: vpc.id,
        cidr_block: az.external_cidr_block,
        availability_zone: az.availability_zone,
        tags: contextTagsWithName(tfgen, 'external'),
      });

      // Ignore eks related tags changes
      tfgen.ignoreChanges(external_subnet, 'tags.%');
      tfgen.ignoreChanges(external_subnet, 'tags.kubernetes.io/');

      const eip = AR.createEip(tfgen, 'ngeip', {
        vpc: true,
      });

      const nat_gateway = AR.createNatGateway(tfgen, 'ng', {
        allocation_id: eip.id,
        subnet_id: external_subnet.id,
      });
      tfgen.dependsOn(nat_gateway, internet_gateway);

      AR.createRouteTableAssociation(tfgen, 'raexternal', {
        subnet_id: external_subnet.id,
        route_table_id: rtexternal.id,
      });

      const rtinternal = AR.createRouteTable(tfgen, 'rtinternal', {
        vpc_id: vpc.id,
        tags: contextTagsWithName(tfgen, 'rtinternal'),
      });

      AR.createRoute(tfgen, 'r1', {
        route_table_id: rtinternal.id,
        destination_cidr_block: AT.cidrBlock('0.0.0.0/0'),
        nat_gateway_id: nat_gateway.id,
      });

      const internal_subnet = AR.createSubnet(tfgen, 'internal', {
        vpc_id: vpc.id,
        cidr_block: az.internal_cidr_block,
        availability_zone: az.availability_zone,
        tags: contextTagsWithName(tfgen, 'internal'),
      });

      // Ignore eks related tags changes
      tfgen.ignoreChanges(internal_subnet, 'tags.%');
      tfgen.ignoreChanges(internal_subnet, 'tags.kubernetes.io/');

      AR.createRouteTableAssociation(tfgen, 'rtainternal', {
        subnet_id: internal_subnet.id,
        route_table_id: rtinternal.id,
      });

      return {
        external_subnet,
        external_route_table_id: rtexternal.id,
        internal_subnet,
        internal_route_table_id: rtinternal.id,
        azname: az.azname,
      };
    });
  });

  return { vpc, azs, region: network_config.region };
}

/**
 * Create a DNS A record in the primary dns zone
 */
export function dnsARecord(
  tfgen: TF.Generator,
  name: string,
  dr: DomainResources,
  dnsname: string,
  ipaddresses: AT.IpAddress[],
  ttl: string
) {
  AR.createRoute53Record(tfgen, name, {
    ttl,
    zone_id: dr.primary_dns_zone.zone_id,
    name: dnsname,
    type: 'A',
    records: ipaddresses.map(a => a.value),
  });
}

/**
 * Create a DNS ALIAS record in the primary dns zone
 */
export function dnsAliasRecord(
  tfgen: TF.Generator,
  name: string,
  dr: DomainResources,
  dnsname: string,
  alias: AR.Route53AliasParams
) {
  AR.createRoute53Record(tfgen, name, {
    alias,
    zone_id: dr.primary_dns_zone.zone_id,
    name: dnsname,
    type: 'A',
  });
}

/**
 * Make a route53 dns zone a subdomain in the primary dns zone
 */
export function dnsSubdomain(
  tfgen: TF.Generator,
  name: string,
  dr: DomainResources,
  subzone: AR.Route53Zone
) {
  AR.createRoute53Record(tfgen, name, {
    zone_id: dr.primary_dns_zone.zone_id,
    name: subzone.name,
    ttl: '60',
    type: 'NS',
    records: [
      '${aws_route53_zone.' + subzone.tfname.join('_') + '.name_servers.0}',
      '${aws_route53_zone.' + subzone.tfname.join('_') + '.name_servers.1}',
      '${aws_route53_zone.' + subzone.tfname.join('_') + '.name_servers.2}',
      '${aws_route53_zone.' + subzone.tfname.join('_') + '.name_servers.3}',
    ],
  });
}

/**
 * Return the full qualified domain name for a host in the primary dns zone
 */
export function fqdn<AZS>(dr: DomainResources, dnsname: string) {
  return dnsname + '.' + dr.domain_name;
}

/**
 * Return a s3 reference into the shared deployment bucket
 */
export function getScopedS3Ref(
  tfgen: TF.Generator,
  sr: SharedBucketsResources
): s3.S3Ref {
  return new s3.S3Ref(sr.deploy_bucket_name, tfgen.nameContext().join('/'));
}


export type SharedResourcesSummary = {
  vpc: string;
  azs: {
    name: string;
    external: string|null;
    internal: string|null;
  }[],
  domain: string;
  primary_dns_zone: string;
  deploy_bucket: string;
  backup_bucket: string;
  region: string;
};

export function sharedResourcesSummary(sr: SharedResources) : SharedResourcesSummary {
  return {
    vpc: sr.vpc.id.value,
    azs: sr.azs.map(az=>{
      return {
        name: az.azname,
        external: az.external_subnet ? az.external_subnet.id.value : null,
        internal: az.internal_subnet ? az.internal_subnet.id.value : null,
      };
    }),
    domain: sr.domain_name,
    primary_dns_zone: sr.primary_dns_zone.name,
    deploy_bucket: sr.deploy_bucket_name,
    backup_bucket: sr.backup_bucket_name,
    region: sr.region.value
  };
}
