/**
 * Generate the resource definitions for AWS
 *
 * Without a machine readable specification of the terraform resources, we are forced to
 * hand encode them here based upon the documentation, and then use this script to
 * generate the corresponding typescript types and helper functions
 */
import {
  RecordDecl,
  requiredField,
  optionalField,
  NUMBER,
  BOOLEAN,
  STRING,
  TAGS_MAP,
  stringAliasType,
  resourceIdType,
  recordType,
  enumType,
  listType,
  Generator,
  fileGenerator,
  stringAttr,
  stringAliasAttr,
  resourceIdAttr,
} from './gen-helpers';

const instance_root_block_device: RecordDecl = {
  name: 'instance_root_block_device',
  fields: [
    optionalField('volume_type', enumType(['standard','gp2','io1'])),
    optionalField('volume_size', NUMBER),
    optionalField('iops', NUMBER),
    optionalField('delete_on_termination', BOOLEAN),
  ]
};

const instance: RecordDecl = {
  name: 'instance',
  fields: [
    requiredField('ami', stringAliasType('AT.Ami')),
    requiredField('instance_type', stringAliasType('AT.InstanceType')),
    optionalField('availability_zone', stringAliasType('AT.AvailabilityZone')),
    optionalField('ebs_optimised', BOOLEAN),
    optionalField('key_name', stringAliasType('AT.KeyName')),
    optionalField('monitoring', BOOLEAN),
    optionalField('subnet_id', resourceIdType('SubnetId')),
    optionalField('associate_public_ip_address', BOOLEAN),
    optionalField('root_block_device', recordType(instance_root_block_device)),
    optionalField('user_data', STRING),
    optionalField('iam_instance_profile', resourceIdType('IamInstanceProfileId')),
    optionalField('vpc_security_group_ids', listType(resourceIdType('SecurityGroupId'))),
    optionalField('tags', TAGS_MAP),
  ]
};

const db_instance: RecordDecl = {
  name: 'db_instance',
  fields : [
    requiredField('allocated_storage', NUMBER),
    requiredField('engine', stringAliasType('AT.DbEngine')),
    requiredField('instance_class', stringAliasType('AT.DbInstanceType')),
    requiredField('username', STRING),
    requiredField('password', STRING),
    optionalField( 'engine_version', STRING),
    optionalField('identifier', STRING),
    optionalField('name', STRING),
    optionalField('port', NUMBER),
    optionalField('publicly_accessible', BOOLEAN),
    optionalField('backup_retention_period',NUMBER),
    optionalField('vpc_security_group_ids', listType(resourceIdType('SecurityGroupId'))),
    optionalField('parameter_group_name', STRING),
    optionalField('db_subnet_group_name', STRING),
    optionalField('tags', TAGS_MAP),
    optionalField('skip_final_snapshot', BOOLEAN),
    optionalField('final_snapshot_identifier', STRING),
  ]
}

const vpc : RecordDecl = {
  name: 'vpc',
  fields: [
    requiredField("cidr_block", stringAliasType('AT.CidrBlock')),
    optionalField("instance_tenancy", STRING),
    optionalField("enable_dns_support", BOOLEAN),
    optionalField("enable_dns_hostnames", BOOLEAN),
    optionalField("enable_classic_link", BOOLEAN),
    optionalField("tags", TAGS_MAP)
  ]
}

const subnet : RecordDecl = {
  name: 'subnet',
  fields: [
    requiredField("vpc_id", resourceIdType('VpcId')),
    requiredField("cidr_block", stringAliasType('AT.CidrBlock')),
    optionalField("map_public_ip_on_launch", BOOLEAN),
    optionalField("availability_zone", stringAliasType("AT.AvailabilityZone")),
    optionalField("tags", TAGS_MAP)
  ]
}

const eip: RecordDecl = {
  name: 'eip',
  fields : [
    optionalField('vpc', BOOLEAN),
    optionalField('instance', resourceIdType('InstanceId')),
    optionalField('tags', TAGS_MAP),
  ]
}

const ingress_rule: RecordDecl = {
  name: 'ingress_rule',
  fields: [
    requiredField("from_port", NUMBER),
    requiredField("to_port", NUMBER),
    requiredField("protocol", enumType(["tcp","udp","icmp","-1"])),
    requiredField("cidr_blocks", listType(stringAliasType('AT.CidrBlock')))
  ]
};

const egress_rule: RecordDecl = {
  name: 'egress_rule',
  fields: [
    requiredField("from_port", NUMBER),
    requiredField("to_port", NUMBER),
    requiredField("protocol", enumType(["tcp","udp","icmp","-1"])),
    requiredField("cidr_blocks", listType(stringAliasType('AT.CidrBlock')))
  ]
};


const security_group: RecordDecl = {
  name: 'security_group',
  fields: [
    optionalField('name', STRING),
    optionalField('name_prefix', STRING),
    optionalField('description', STRING),
    optionalField('ingress', listType(recordType(ingress_rule))),
    optionalField('egress', listType(recordType(egress_rule))),
    optionalField('vpc_id', resourceIdType('VpcId')),
    optionalField('tags', TAGS_MAP),
  ]
}

const internet_gateway: RecordDecl = {
  name: 'internet_gateway',
  fields: [
    requiredField('vpc_id', resourceIdType('VpcId')),
    optionalField('tags', TAGS_MAP),
  ]
}

const nat_gateway: RecordDecl = {
  name: 'nat_gateway',
  fields: [
    requiredField('allocation_id', resourceIdType('EipId')),
    requiredField('subnet_id', resourceIdType('SubnetId')),
  ]
}

const route_table: RecordDecl = {
  name: 'route_table',
  fields: [
    requiredField('vpc_id', resourceIdType('VpcId')),
    optionalField('tags', TAGS_MAP),
  ]
}

const route: RecordDecl = {
  name: 'route',
  fields: [
    requiredField('route_table_id', resourceIdType('RouteTableId')),
    requiredField('destination_cidr_block', stringAliasType('AT.CidrBlock')),
    optionalField('nat_gateway_id', resourceIdType('NatGatewayId')),
    optionalField('gateway_id', resourceIdType('InternetGatewayId')),
  ]
}

const route_table_association: RecordDecl = {
  name: 'route_table_association',
  fields: [
    requiredField('subnet_id', resourceIdType('SubnetId')),
    requiredField('route_table_id', resourceIdType('RouteTableId')),
  ]
}

const route53_zone: RecordDecl = {
  name: 'route53_zone',
  fields: [
    requiredField('name', STRING),
    optionalField('comment', STRING),
    optionalField('vpc_id', resourceIdType('VpcId')),
    optionalField('vpc_region', stringAliasType('AT.Region')),
    optionalField('force_destroy', BOOLEAN),
    optionalField('tags', TAGS_MAP),
  ]
}

const route53_alias: RecordDecl = {
  name: 'route53_alias',
  fields: [
    requiredField('name', STRING),
    requiredField('zone_id', stringAliasType('AT.HostedZoneId')),
    requiredField('evaluate_target_health', BOOLEAN)
  ]
}

const route53_record: RecordDecl = {
  name: 'route53_record',
  fields: [
    requiredField('zone_id', stringAliasType('AT.HostedZoneId')),
    requiredField('name', STRING),
    requiredField('type', enumType(["A", "AAAA", "CAA", "CNAME", "MX", "NAPTR", "NS", "PTR", "SOA", "SPF", "SRV", "TXT"])),
    optionalField('ttl', STRING),
    optionalField('records', listType(STRING)),
    optionalField('alias', recordType(route53_alias))
  ]
}


const bucket_versioning: RecordDecl = {
  name: 'bucket_versioning',
  fields: [
    optionalField('enabled', BOOLEAN),
    optionalField('mfa_delete', BOOLEAN),
  ]
}

const expiration: RecordDecl = {
  name: 'expiration',
  fields: [
    optionalField('days', NUMBER),
    optionalField('date', STRING),
    optionalField('expired_object_delete_marker', BOOLEAN),
  ]
}

const lifecycle_rule: RecordDecl = {
  name: 'lifecycle_rule',
  fields: [
    optionalField('id', STRING),
    requiredField('prefix', STRING),
    requiredField('enabled', BOOLEAN),
    optionalField('expiration', recordType(expiration)),
  ]
}

const cors_rule: RecordDecl = {
  name: 'cors_rule',
  fields: [
    optionalField('allowed_headers', listType(STRING)),
    requiredField('allowed_methods', listType(STRING)),
    requiredField('allowed_origins', listType(STRING)),
    optionalField('expose_headers', listType(STRING)),
    optionalField('max_age_seconds', NUMBER),
  ]
}

const s3_bucket: RecordDecl = {
  name: 's3_bucket',
  fields: [
    requiredField('bucket', STRING),
    optionalField('acl', stringAliasType('AT.CannedAcl')),
    optionalField('versioning', recordType(bucket_versioning)),
    optionalField('lifecycle_rule', recordType(lifecycle_rule)),
    optionalField('cors_rule', recordType(cors_rule)),
    optionalField('tags', TAGS_MAP),
  ]
}

const s3_bucket_object: RecordDecl = {
  name: 's3_bucket_object',
  fields: [
    requiredField('bucket', STRING),
    requiredField('key', STRING),
    optionalField('source', STRING),
    optionalField('content', STRING)
  ]
}

const iam_user: RecordDecl = {
  name: 'iam_user',
  fields: [
    requiredField('name', STRING),
    optionalField('path', STRING),
    optionalField('force_destroy', BOOLEAN)
  ]
}

const iam_user_policy: RecordDecl = {
  name: 'iam_user_policy',
  fields: [
    requiredField('name', STRING),
    requiredField('policy', STRING),
    requiredField('user', STRING)
  ]
}

const iam_user_policy_attachment: RecordDecl = {
  name: 'iam_user_policy_attachment',
  fields: [
    requiredField('user', STRING),
    requiredField('policy_arn', stringAliasType('AT.Arn')),
  ]
}

const ecr_repository: RecordDecl = {
  name: 'ecr_repository',
  fields: [
    requiredField('name', STRING),
  ]
}

const db_subnet_group: RecordDecl = {
  name: 'db_subnet_group',
  fields: [
    requiredField('name', STRING),
    optionalField('description', STRING),
    requiredField('subnet_ids', listType(resourceIdType('SubnetId'))),
    optionalField('tags', TAGS_MAP)
  ]
}

const sns_topic: RecordDecl = {
  name: 'sns_topic',
  fields: [
    requiredField('name', STRING),
    optionalField('display_name', STRING),
  ],
}

const cloudwatch_metric_alarm: RecordDecl = {
  name: 'cloudwatch_metric_alarm',
  fields: [
    requiredField("alarm_name", STRING),
    requiredField("comparison_operator", enumType([
      'GreaterThanOrEqualToThreshold',
      'GreaterThanThreshold',
      'LessThanThreshold',
      'LessThanOrEqualToThreshold'
    ])),
    requiredField("evaluation_periods", NUMBER),
    requiredField("metric_name", STRING),
    requiredField("namespace", STRING),
    requiredField("period", NUMBER),
    requiredField("statistic", enumType([
      'SampleCount',
      'Average',
      'Sum',
      'Minimum',
      'Maximum'
    ])),
    requiredField("threshold", NUMBER),
    optionalField("actions_enabled", BOOLEAN),
    optionalField("alarm_actions", listType(stringAliasType('AT.Arn'))),
    optionalField("alarm_description", STRING),
    optionalField("dimensions", TAGS_MAP),
    optionalField("insufficient_data_actions", listType(stringAliasType('AT.Arn'))),
    optionalField("ok_actions", listType(stringAliasType('AT.Arn'))),
    optionalField("unit", STRING),
  ]
}

const iam_instance_profile: RecordDecl = {
  name: "iam_instance_profile",
  fields: [
    optionalField("name", STRING),
    optionalField("name_prefix", STRING),
    optionalField("path", STRING),
    optionalField("roles", listType(STRING)),
    optionalField("role", STRING),
  ]
}

const iam_role : RecordDecl = {
  name: "iam_role",
  fields: [
    optionalField("name", STRING),
    optionalField("name_prefix", STRING),
    requiredField("assume_role_policy", STRING),
    optionalField("path", STRING),
  ]
}

const iam_role_policy: RecordDecl = {
  name: "iam_role_policy",
  fields: [
    requiredField("name", STRING),
    requiredField("policy", STRING),
    requiredField("role", resourceIdType("IamRoleId")),
  ]
}

function generateAws(gen: Generator) {
  // Generate the resources
  gen.generateResource(
    "Provides an EC2 instance resource.",
    "https://www.terraform.io/docs/providers/aws/r/instance.html",
    instance,
    [
      resourceIdAttr('id', instance),
      stringAliasAttr('arn', 'Arn', 'AT.ArnAttr'),
      stringAliasAttr('availability_zone', 'AvailabilityZone', 'AT.AvailabilityZoneAttr'),
    ]
  );

  gen.generateResource(
    "Provides an RDS instance resource.",
    "https://www.terraform.io/docs/providers/aws/r/db_instance.html",
    db_instance,
    [
      resourceIdAttr('id', db_instance),
      stringAliasAttr('arn', 'Arn', 'AT.ArnAttr'),
      stringAttr('name'),
      stringAttr('username'),
      stringAttr('address'),
      stringAttr('port'),
    ]
  );

  gen.generateResource(
    "Provides an Elastic IP Address.",
    "https://www.terraform.io/docs/providers/aws/r/eip.html",
    eip,
    [
      resourceIdAttr('id', eip),
      stringAliasAttr('public_ip', 'IpAddress', 'AT.IpAddressAttr'),
      stringAliasAttr('private_ip', 'IpAddress', 'AT.IpAddressAttr'),
    ]
  );

  gen.generateResource(
    "Provides a VPC.",
    "https://www.terraform.io/docs/providers/aws/d/vpc.html",
    vpc,
    [
      resourceIdAttr('id', vpc),
    ]
  );

  gen.generateResource(
    "Provides a VPC Subnet.",
    "https://www.terraform.io/docs/providers/aws/d/subnet.html",
    subnet,
    [
      resourceIdAttr('id', subnet),
    ]
  );

  gen.generateResource(
    "Provides a security group resource.",
    "https://www.terraform.io/docs/providers/aws/r/security_group.html",
    security_group,
    [
      resourceIdAttr('id', security_group),
      stringAttr('owner_id')
    ]
  );

  gen.generateResource(
    "Provides a resource to create a VPC Internet Gateway.",
    "https://www.terraform.io/docs/providers/aws/r/internet_gateway.html",
    internet_gateway,
    [
      resourceIdAttr('id', internet_gateway),
    ]
  );

  gen.generateResource(
    "Provides a resource to create a VPC NAT Gateway.",
    "https://www.terraform.io/docs/providers/aws/r/nat_gateway.html",
    nat_gateway,
    [
      resourceIdAttr('id', nat_gateway),
    ]
  );

  gen.generateResource(
    "Provides a resource to create a VPC routing table.",
    "https://www.terraform.io/docs/providers/aws/r/route_table.html",
    route_table,
    [
      resourceIdAttr('id', route_table),
    ]
  );

  gen.generateResource(
    "Provides a resource to create a routing table entry (a route) in a VPC routing table.",
    "https://www.terraform.io/docs/providers/aws/r/route.html",
    route,
    [
    ]
  );

  gen.generateResource(
    "Provides a resource to create an association between a subnet and routing table.",
    "https://www.terraform.io/docs/providers/aws/r/route_table_association.html",
    route_table_association,
    [
      resourceIdAttr('id', route_table_association),
    ]
  );

  gen.generateResource(
    "Provides a Route53 Hosted Zone resource.",
    "https://www.terraform.io/docs/providers/aws/r/route53_zone.html",
    route53_zone,
    [
      stringAliasAttr('zone_id', 'HostedZoneId', 'AT.HostedZoneIdAttr'),
    ]
  );

  gen.generateResource(
    "Provides a Route53 record resource.",
    "https://www.terraform.io/docs/providers/aws/r/route53_record.htm",
    route53_record,
    [
      stringAttr('name'),
      stringAttr('fqdn'),
    ]
  );

  gen.generateResource(
    "Provides a S3 bucket resource.",
    "https://www.terraform.io/docs/providers/aws/r/s3_bucket.html",
    s3_bucket,
    [
      stringAttr('id')
    ]
  );

  gen.generateResource(
    "Provides a S3 bucket object resource.",
    "https://www.terraform.io/docs/providers/aws/d/s3_bucket_object.html",
    s3_bucket_object,
    [
      stringAttr('id'),
      stringAttr('etag'),
      stringAttr('version_id'),
    ]
  );

  gen.generateResource(
    "Provides an SNS topic resource",
    "https://www.terraform.io/docs/providers/aws/r/sns_topic.html",
    sns_topic,
    [
      resourceIdAttr('id', sns_topic),
      stringAliasAttr('arn', 'Arn', 'AT.ArnAttr'),
    ]
  );

  gen.generateResource(
    "Provides an IAM user.",
    "https://www.terraform.io/docs/providers/aws/r/iam_user.html",
    iam_user,
    [
      stringAliasAttr('arn', 'Arn', 'AT.ArnAttr'),
      stringAttr('name'),
      stringAttr('unique_id'),
    ]
  );

  gen.generateResource(
    "Provides an IAM policy attached to a user.",
    "https://www.terraform.io/docs/providers/aws/r/iam_user_policy.html",
    iam_user_policy,
    [
    ]
  );

  gen.generateResource(
    "Attaches a Managed IAM Policy to an IAM user",
    "https://www.terraform.io/docs/providers/aws/r/iam_user_policy_attachment.html",
    iam_user_policy_attachment,
    [
    ]
  );

  gen.generateResource(
    "Provides an EC2 Container Registry Repository",
    "https://www.terraform.io/docs/providers/aws/r/ecr_repository.html",
    ecr_repository,
    [
      stringAliasAttr('arn', 'Arn', 'AT.ArnAttr'),
      stringAttr('name'),
      stringAttr('registry_id'),
      stringAttr('repository_url'),
    ]
  );

  gen.generateResource(
    "Provides an RDS DB subnet group resource.",
    "https://www.terraform.io/docs/providers/aws/r/db_subnet_group.html",
    db_subnet_group,
    [
      resourceIdAttr('id', db_subnet_group),
      stringAttr('name'),
      stringAliasAttr('arn', 'Arn', 'AT.ArnAttr'),
    ]
  )

  gen.generateResource(
    "Provides a CloudWatch Metric Alarm resource.",
    "https://www.terraform.io/docs/providers/aws/r/cloudwatch_metric_alarm.html",
    cloudwatch_metric_alarm,
    [
      resourceIdAttr('id', cloudwatch_metric_alarm),
    ]
  );

  gen.generateResource(
    "Provides an IAM role.",
    "https://www.terraform.io/docs/providers/aws/r/iam_role.html",
    iam_role,
    [
      resourceIdAttr("id", iam_role),
      stringAliasAttr('arn', 'Arn', 'AT.ArnAttr'),
      stringAttr("name"),
      stringAttr("create_date"),
      stringAttr("unique_id"),
      stringAttr("description"),
    ]
  )
  
  gen.generateResource(
    "Provides an IAM role policy",
    "https://www.terraform.io/docs/providers/aws/r/iam_role_policy.html",
    iam_role_policy,
    [
      stringAttr("id"),
      stringAttr("name"),
      stringAttr("policy"),
      stringAttr("role"),     
    ]
  )

  gen.generateResource(
    "Provides an IAM instance profile.",
    "https://www.terraform.io/docs/providers/aws/r/iam_instance_profile.html",
    iam_instance_profile,
    [
      resourceIdAttr("id", iam_instance_profile),
      stringAliasAttr('arn', 'Arn', 'AT.ArnAttr'),
      stringAttr("name"),
      stringAttr("create_date"),
      stringAttr("unique_id"),
    ]
  )

  // Generate all of the parameter structures
  gen.generateParams(instance_root_block_device);
  gen.generateParams(instance);
  gen.generateParams(db_instance);
  gen.generateParams(eip);
  gen.generateParams(vpc);
  gen.generateParams(subnet);
  gen.generateParams(security_group);
  gen.generateParams(ingress_rule);
  gen.generateParams(egress_rule);
  gen.generateParams(internet_gateway);
  gen.generateParams(nat_gateway);
  gen.generateParams(route_table);
  gen.generateParams(route);
  gen.generateParams(route_table_association);
  gen.generateParams(route53_zone);
  gen.generateParams(route53_record);
  gen.generateParams(route53_alias);
  gen.generateParams(bucket_versioning);
  gen.generateParams(expiration);
  gen.generateParams(lifecycle_rule);
  gen.generateParams(cors_rule);
  gen.generateParams(s3_bucket);
  gen.generateParams(s3_bucket_object);
  gen.generateParams(sns_topic);
  gen.generateParams(iam_user);
  gen.generateParams(iam_user_policy);
  gen.generateParams(iam_user_policy_attachment);
  gen.generateParams(ecr_repository);
  gen.generateParams(db_subnet_group);
  gen.generateParams(cloudwatch_metric_alarm);
  gen.generateParams(iam_instance_profile);
  gen.generateParams(iam_role);
  gen.generateParams(iam_role_policy);
}

function main() {
  const gen = fileGenerator('aws', [
    '/** Automatically @generated by gen-providers.ts, DO NOT EDIT */',
    '',
    'import * as _ from "lodash";',
    'import * as AT from "./aws-types";',
    'import * as TF from "../core/core";',
    '',
  ]);
  generateAws(gen);
  gen.writeFile("./hx-terraform/providers/aws-resources.ts");
}

main()
