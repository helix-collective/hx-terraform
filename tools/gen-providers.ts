import * as path from 'path';

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
  arnType,
  resourceIdType,
  recordType,
  enumType,
  listType,
  Generator,
  fileGenerator,
  stringAttr,
  stringAliasAttr,
  resourceIdAttr,
  NUMBERSTR,
} from './gen-helpers';
import { arn } from '../providers/aws/types';

type ResourcesParams = {
  resources: { [key: string]: RecordDecl };
  params: { [key: string]: RecordDecl };
};

const instance_root_block_device: RecordDecl = {
  name: 'instance_root_block_device',
  fields: [
    optionalField('volume_type', enumType(['standard', 'gp2', 'io1'])),
    optionalField('volume_size', NUMBER),
    optionalField('iops', NUMBER),
    optionalField('delete_on_termination', BOOLEAN),
  ],
};

const instance: RecordDecl = {
  name: 'instance',
  fields: [
    requiredField('ami', stringAliasType('AT.Ami')),
    requiredField('instance_type', stringAliasType('AT.InstanceType')),
    optionalField('availability_zone', stringAliasType('AT.AvailabilityZone')),
    optionalField('ebs_optimized', BOOLEAN),
    optionalField('key_name', stringAliasType('AT.KeyName')),
    optionalField('monitoring', BOOLEAN),
    optionalField('subnet_id', resourceIdType('SubnetId')),
    optionalField('associate_public_ip_address', BOOLEAN),
    optionalField('root_block_device', recordType(instance_root_block_device)),
    optionalField('user_data', STRING),
    optionalField(
      'iam_instance_profile',
      resourceIdType('IamInstanceProfileId')
    ),
    optionalField(
      'vpc_security_group_ids',
      listType(resourceIdType('SecurityGroupId'))
    ),
    optionalField('tags', TAGS_MAP),
  ],
};

const db_instance: RecordDecl = {
  name: 'db_instance',
  fields: [
    requiredField('allocated_storage', NUMBER),
    requiredField('engine', stringAliasType('AT.DbEngine')),
    requiredField('instance_class', stringAliasType('AT.DbInstanceType')),
    requiredField('username', STRING),
    optionalField('password', STRING),
    optionalField('engine_version', STRING),
    optionalField('identifier', STRING),
    optionalField('name', STRING),
    optionalField('port', NUMBER),
    optionalField('publicly_accessible', BOOLEAN),
    optionalField('backup_retention_period', NUMBER),
    optionalField(
      'vpc_security_group_ids',
      listType(resourceIdType('SecurityGroupId'))
    ),
    optionalField('deletion_protection', BOOLEAN),
    optionalField('performance_insights_enabled', BOOLEAN),
    optionalField('parameter_group_name', STRING),
    optionalField('db_subnet_group_name', STRING),
    optionalField('tags', TAGS_MAP),
    optionalField('skip_final_snapshot', BOOLEAN),
    optionalField('final_snapshot_identifier', STRING),
    optionalField('multi_az', BOOLEAN),
    optionalField('license_model', STRING),
    optionalField('auto_minor_version_upgrade', BOOLEAN),
    optionalField('replicate_source_db', stringAliasType('DbInstanceId')),
    optionalField('apply_immediately', BOOLEAN),
    optionalField('storage_encrypted', BOOLEAN),
    optionalField('storage_type', stringAliasType('AT.DbInstanceStorageType')),
    optionalField('iops', NUMBER),
    optionalField('snapshot_identifier', STRING),
    optionalField('monitoring_interval', NUMBER),
  ],
};

const db_parameter_group_parameter: RecordDecl = {
  name: 'db_parameter_group_parameter',
  fields: [
    requiredField('name', STRING),
    requiredField('value', STRING),
    optionalField('apply_method', enumType(['immediate', 'pending-reboot'])),
    optionalField('tags', TAGS_MAP),
  ],
};

const db_parameter_group: RecordDecl = {
  name: 'db_parameter_group',
  fields: [
    optionalField('name', STRING),
    requiredField('family', STRING),
    optionalField('description', STRING),
    optionalField('tags', TAGS_MAP),
    optionalField(
      'parameter',
      listType(recordType(db_parameter_group_parameter))
    ),
  ],
};

const vpc: RecordDecl = {
  name: 'vpc',
  fields: [
    requiredField('cidr_block', stringAliasType('AT.CidrBlock')),
    optionalField('instance_tenancy', STRING),
    optionalField('enable_dns_support', BOOLEAN),
    optionalField('enable_dns_hostnames', BOOLEAN),
    optionalField('enable_classiclink', BOOLEAN),
    optionalField('tags', TAGS_MAP),
  ],
};

const default_vpc: RecordDecl = {
  name: 'default_vpc',
  fields: [
    optionalField('enable_dns_support', BOOLEAN),
    optionalField('enable_dns_hostnames', BOOLEAN),
    optionalField('enable_classiclink', BOOLEAN),
    optionalField('tags', TAGS_MAP),
  ],
};

const subnet: RecordDecl = {
  name: 'subnet',
  fields: [
    requiredField('vpc_id', resourceIdType('VpcId')),
    requiredField('cidr_block', stringAliasType('AT.CidrBlock')),
    optionalField('map_public_ip_on_launch', BOOLEAN),
    optionalField('availability_zone', stringAliasType('AT.AvailabilityZone')),
    optionalField('tags', TAGS_MAP),
  ],
};

const default_subnet: RecordDecl = {
  name: 'default_subnet',
  fields: [
    requiredField('availability_zone', stringAliasType('AT.AvailabilityZone')),
    optionalField('map_public_ip_on_launch', BOOLEAN),
    optionalField('tags', TAGS_MAP),
  ],
};

const eip: RecordDecl = {
  name: 'eip',
  fields: [
    optionalField('vpc', BOOLEAN),
    optionalField('instance', resourceIdType('InstanceId')),
    optionalField('tags', TAGS_MAP),
  ],
};

const ingress_rule: RecordDecl = {
  name: 'ingress_rule',
  fields: [
    requiredField('from_port', NUMBER),
    requiredField('to_port', NUMBER),
    requiredField('protocol', enumType(['tcp', 'udp', 'icmp', '-1'])),
    requiredField('cidr_blocks', listType(stringAliasType('AT.CidrBlock'))),
  ],
};

const egress_rule: RecordDecl = {
  name: 'egress_rule',
  fields: [
    requiredField('from_port', NUMBER),
    requiredField('to_port', NUMBER),
    requiredField('protocol', enumType(['tcp', 'udp', 'icmp', '-1'])),
    requiredField('cidr_blocks', listType(stringAliasType('AT.CidrBlock'))),
  ],
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
  ],
};

const security_group_rule: RecordDecl = {
  name: 'security_group_rule',
  fields: [
    requiredField('type', enumType(['ingress', 'egress'])),
    optionalField('cidr_blocks', listType(stringAliasType('AT.CidrBlock'))),
    optionalField('description', STRING),
    requiredField('from_port', NUMBER),
    requiredField('protocol', enumType(['tcp', 'udp', 'icmp', 'all', '-1'])),
    optionalField('security_group_id', resourceIdType('SecurityGroupId')),
    optionalField(
      'source_security_group_id',
      resourceIdType('SecurityGroupId')
    ),
    requiredField('to_port', NUMBER),
  ],
};

const internet_gateway: RecordDecl = {
  name: 'internet_gateway',
  fields: [
    requiredField('vpc_id', resourceIdType('VpcId')),
    optionalField('tags', TAGS_MAP),
  ],
};

const nat_gateway: RecordDecl = {
  name: 'nat_gateway',
  fields: [
    requiredField('allocation_id', resourceIdType('EipId')),
    requiredField('subnet_id', resourceIdType('SubnetId')),
  ],
};

const route_table: RecordDecl = {
  name: 'route_table',
  fields: [
    requiredField('vpc_id', resourceIdType('VpcId')),
    optionalField('tags', TAGS_MAP),
  ],
};

const route: RecordDecl = {
  name: 'route',
  fields: [
    requiredField('route_table_id', resourceIdType('RouteTableId')),
    requiredField('destination_cidr_block', stringAliasType('AT.CidrBlock')),
    optionalField('nat_gateway_id', resourceIdType('NatGatewayId')),
    optionalField('gateway_id', resourceIdType('InternetGatewayId')),
  ],
};

const route_table_association: RecordDecl = {
  name: 'route_table_association',
  fields: [
    requiredField('subnet_id', resourceIdType('SubnetId')),
    requiredField('route_table_id', resourceIdType('RouteTableId')),
  ],
};

const route53_zone: RecordDecl = {
  name: 'route53_zone',
  fields: [
    requiredField('name', STRING),
    optionalField('comment', STRING),
    optionalField('vpc_id', resourceIdType('VpcId')),
    optionalField('vpc_region', stringAliasType('AT.Region')),
    optionalField('force_destroy', BOOLEAN),
    optionalField('tags', TAGS_MAP),
  ],
};

const route53_alias: RecordDecl = {
  name: 'route53_alias',
  fields: [
    requiredField('name', STRING),
    requiredField('zone_id', stringAliasType('AT.HostedZoneId')),
    requiredField('evaluate_target_health', BOOLEAN),
  ],
};

const route53_record: RecordDecl = {
  name: 'route53_record',
  fields: [
    requiredField('zone_id', stringAliasType('AT.HostedZoneId')),
    requiredField('name', STRING),
    requiredField(
      'type',
      enumType([
        'A',
        'AAAA',
        'CAA',
        'CNAME',
        'MX',
        'NAPTR',
        'NS',
        'PTR',
        'SOA',
        'SPF',
        'SRV',
        'TXT',
      ])
    ),
    optionalField('ttl', STRING),
    optionalField('records', listType(STRING)),
    optionalField('alias', recordType(route53_alias)),
    optionalField('allow_overwrite', BOOLEAN),
  ],
};

const bucket_versioning: RecordDecl = {
  name: 'bucket_versioning',
  fields: [
    optionalField('enabled', BOOLEAN),
    optionalField('mfa_delete', BOOLEAN),
  ],
};

const expiration: RecordDecl = {
  name: 'expiration',
  fields: [
    optionalField('days', NUMBER),
    optionalField('date', STRING),
    optionalField('expired_object_delete_marker', BOOLEAN),
  ],
};

const lifecycle_rule: RecordDecl = {
  name: 'lifecycle_rule',
  fields: [
    optionalField('id', STRING),
    requiredField('prefix', STRING),
    requiredField('enabled', BOOLEAN),
    optionalField('expiration', recordType(expiration)),
  ],
};

const cors_rule: RecordDecl = {
  name: 'cors_rule',
  fields: [
    optionalField('allowed_headers', listType(STRING)),
    requiredField('allowed_methods', listType(STRING)),
    requiredField('allowed_origins', listType(STRING)),
    optionalField('expose_headers', listType(STRING)),
    optionalField('max_age_seconds', NUMBER),
  ],
};

const website: RecordDecl = {
  name: 'website',
  fields: [
    optionalField('index_document', STRING),
    optionalField('error_document', STRING),
    optionalField('redirect_all_requests_to', STRING),
    optionalField('routing_rules', STRING),
  ],
};

const s3_bucket: RecordDecl = {
  name: 's3_bucket',
  fields: [
    requiredField('bucket', STRING),
    optionalField('acl', stringAliasType('AT.CannedAcl')),
    optionalField('policy', STRING),
    optionalField('versioning', recordType(bucket_versioning)),
    optionalField('lifecycle_rule', recordType(lifecycle_rule)),
    optionalField('cors_rule', recordType(cors_rule)),
    optionalField('website', recordType(website)),
    optionalField('tags', TAGS_MAP),
  ],
};

const s3_bucket_object: RecordDecl = {
  name: 's3_bucket_object',
  fields: [
    requiredField('bucket', STRING),
    requiredField('key', STRING),
    optionalField('source', STRING),
    optionalField('content', STRING),
  ],
};

const iam_user: RecordDecl = {
  name: 'iam_user',
  fields: [
    requiredField('name', STRING),
    optionalField('path', STRING),
    optionalField('force_destroy', BOOLEAN),
  ],
};

const iam_user_policy: RecordDecl = {
  name: 'iam_user_policy',
  fields: [
    requiredField('name', STRING),
    requiredField('policy', STRING),
    requiredField('user', STRING),
  ],
};

const iam_user_policy_attachment: RecordDecl = {
  name: 'iam_user_policy_attachment',
  fields: [
    requiredField('user', STRING),
    requiredField('policy_arn', stringAliasType('AT.Arn')),
  ],
};

const ecr_repository: RecordDecl = {
  name: 'ecr_repository',
  fields: [requiredField('name', STRING)],
};

const db_subnet_group: RecordDecl = {
  name: 'db_subnet_group',
  fields: [
    requiredField('name', STRING),
    optionalField('description', STRING),
    requiredField('subnet_ids', listType(resourceIdType('SubnetId'))),
    optionalField('tags', TAGS_MAP),
  ],
};

const sns_topic: RecordDecl = {
  name: 'sns_topic',
  fields: [
    requiredField('name', STRING),
    optionalField('display_name', STRING),
  ],
};

const cloudwatch_metric_alarm: RecordDecl = {
  name: 'cloudwatch_metric_alarm',
  fields: [
    requiredField('alarm_name', STRING),
    requiredField(
      'comparison_operator',
      enumType([
        'GreaterThanOrEqualToThreshold',
        'GreaterThanThreshold',
        'LessThanThreshold',
        'LessThanOrEqualToThreshold',
      ])
    ),
    requiredField('evaluation_periods', NUMBER, ["The number of periods over which data is compared to the specified threshold."]),
    requiredField('metric_name', STRING),
    requiredField('namespace', STRING),
    requiredField('period', NUMBER, ["The period in seconds over which the specified statistic is applied."]),
    requiredField(
      'statistic',
      enumType(['SampleCount', 'Average', 'Sum', 'Minimum', 'Maximum'])
    ),
    requiredField('threshold', NUMBER, ["The value against which the specified statistic is compared. This parameter is required for alarms based on static thresholds"]),
    optionalField('actions_enabled', BOOLEAN, ["Indicates whether or not actions should be executed during any changes to the alarm's state. Defaults to true."]),
    optionalField('alarm_actions', listType(stringAliasType('AT.Arn')), ["The list of actions to execute when this alarm transitions into an ALARM state from any other state"]),
    optionalField('alarm_description', STRING),
    optionalField('datapoints_to_alarm', NUMBER, ["The number of datapoints that must be breaching to trigger the alarm."]),
    optionalField('dimensions', TAGS_MAP),
    optionalField(
      'insufficient_data_actions',
      listType(stringAliasType('AT.Arn')),
      ["The list of actions to execute when this alarm transitions into an INSUFFICIENT_DATA state from any other state"]
    ),
    optionalField('ok_actions', listType(stringAliasType('AT.Arn')), ["The list of actions to execute when this alarm transitions into an OK state from any other state"]),
    optionalField('unit', STRING),
    optionalField('treat_missing_data', enumType(["missing", "ignore", "breaching", "notBreaching"]), ["Sets how this alarm is to handle missing data points"])
  ],
};

const iam_instance_profile: RecordDecl = {
  name: 'iam_instance_profile',
  fields: [
    optionalField('name', STRING),
    optionalField('name_prefix', STRING),
    optionalField('path', STRING),
    optionalField('roles', listType(STRING)),
    optionalField('role', STRING),
  ],
};

const iam_role: RecordDecl = {
  name: 'iam_role',
  fields: [
    optionalField('name', STRING),
    optionalField('name_prefix', STRING),
    requiredField('assume_role_policy', STRING),
    optionalField('path', STRING),
    optionalField('description', STRING),
  ],
};

const iam_policy: RecordDecl = {
  name: 'iam_policy',
  fields: [
    optionalField('description', STRING),
    optionalField('name', STRING),
    optionalField('name_prefix', STRING),
    optionalField('path', STRING),
    requiredField('policy', STRING),
  ],
};

const iam_role_policy_attachment: RecordDecl = {
  name: 'iam_role_policy_attachment',
  fields: [
    requiredField('role', STRING),
    requiredField('policy_arn', arnType(iam_policy)),
  ],
};

const iam_role_policy: RecordDecl = {
  name: 'iam_role_policy',
  fields: [
    requiredField('name', STRING),
    requiredField('policy', STRING),
    requiredField('role', resourceIdType('IamRoleId')),
  ],
};

const sqs_queue: RecordDecl = {
  name: 'sqs_queue',
  fields: [
    optionalField('name', STRING),
    optionalField('name_prefix', STRING),
    optionalField('visibility_timeout_seconds', NUMBER),
    optionalField('message_retention_seconds ', NUMBER),
    optionalField('max_message_size', NUMBER),
    optionalField('delay_seconds', NUMBER),
    optionalField('receive_wait_time_seconds', NUMBER),
    optionalField('policy', STRING),
    optionalField('redrive_policy', STRING),
    optionalField('fifo_queue', BOOLEAN),
    optionalField('content_based_deduplication', BOOLEAN),
    optionalField('tags', TAGS_MAP),
  ],
};

const sqs_queue_policy: RecordDecl = {
  name: 'sqs_queue_policy',
  fields: [requiredField('queue_url', STRING), requiredField('policy', STRING)],
};

const lb_subnet_mapping = {
  name: 'lb_subnet_mapping',
  fields: [
    requiredField('subnet_id', resourceIdType('SubnetId')),
    requiredField('allocation_id', resourceIdType('EipId')),
  ],
};

const lb_access_logs = {
  name: 'lb_access_logs',
  fields: [
    requiredField('bucket', STRING),
    optionalField('bucket_prefix', STRING),
    optionalField('interval', NUMBER),
    optionalField('enabled', BOOLEAN),
  ],
};

const lb: RecordDecl = {
  name: 'lb',
  fields: [
    optionalField('name', STRING),
    optionalField('name_prefix', STRING),
    optionalField('internal', BOOLEAN),
    optionalField('load_balancer_type', enumType(['application', 'network'])),
    optionalField(
      'security_groups',
      listType(resourceIdType('SecurityGroupId'))
    ),
    optionalField('access_logs', recordType(lb_access_logs)),
    optionalField('subnets', listType(resourceIdType('SubnetId'))),
    optionalField('subnet_mapping', listType(recordType(lb_subnet_mapping))),
    optionalField('idle_timeout', NUMBER),
    optionalField('enable_deletion_protection', BOOLEAN),
    optionalField('enable_cross_zone_load_balancing', BOOLEAN),
    optionalField('enable_http2', BOOLEAN),
    optionalField('ip_address_type', enumType(['ipv4', 'dualstack'])),
    optionalField('tags', TAGS_MAP),
  ],
};

const acm_certificate: RecordDecl = {
  name: 'acm_certificate',
  fields: [
    requiredField('domain_name', STRING),
    optionalField('subject_alternative_names', listType(STRING)),
    requiredField('validation_method', STRING),
    optionalField('tags', TAGS_MAP),
  ],
};

const acm_certificate_validation: RecordDecl = {
  name: 'acm_certificate_validation',
  fields: [
    requiredField('certificate_arn', arnType(acm_certificate)),
    optionalField('validation_record_fqdns', listType(STRING)),
  ],
};

const lb_target_group_stickiness: RecordDecl = {
  name: 'lb_target_group_stickiness',
  fields: [
    requiredField('type', enumType(['lb_cookie'])),
    optionalField('cookie_duration', NUMBER),
    optionalField('enabled', BOOLEAN),
  ],
};

const lb_target_group_health_check: RecordDecl = {
  name: 'lb_target_group_health_check',
  fields: [
    optionalField('interval', NUMBER),
    optionalField('path', STRING),
    optionalField('port', STRING),
    optionalField('protocol', enumType(['TCP', 'HTTP', 'HTTPS'])),
    optionalField('timeout', NUMBER),
    optionalField('healthy_threshold', NUMBER),
    optionalField('unhealthy_threshold', NUMBER),
    optionalField('matcher', STRING),
  ],
};

const lb_target_group: RecordDecl = {
  name: 'lb_target_group',
  fields: [
    optionalField('name', STRING),
    optionalField('name_prefix', STRING),
    requiredField('port', NUMBER),
    requiredField('protocol', enumType(['TCP', 'HTTP', 'HTTPS'])),
    requiredField('vpc_id', resourceIdType('VpcId')),
    optionalField('deregistration_delay', NUMBER),
    optionalField('slow_start', NUMBER),
    optionalField('proxy_protocol_v2', BOOLEAN),
    optionalField('stickiness', recordType(lb_target_group_stickiness)),
    optionalField('health_check', recordType(lb_target_group_health_check)),
    optionalField('target_type', enumType(['instance', 'ip'])),
    optionalField('tags', TAGS_MAP),
  ],
};

const lb_listener_action_redirect: RecordDecl = {
  name: 'lb_listener_action_redirect',
  fields: [
    optionalField('host', STRING),
    optionalField('path', STRING),
    optionalField('port', STRING),
    optionalField('protocol', enumType(['HTTP', 'HTTPS', '#{protocol}'])),
    optionalField('query', STRING),
    requiredField('status_code', enumType(['HTTP_301', 'HTTP_302'])),
  ],
};

const lb_listener_action_fixed_response: RecordDecl = {
  name: 'lb_listener_action_fixed_response',
  fields: [
    requiredField(
      'content_type',
      enumType([
        'text/plain',
        'text/css',
        'text/html',
        'application/javascript',
        'application/json',
      ])
    ),
    optionalField('message_body', STRING),
    optionalField('status_code', NUMBER),
  ],
};

const lb_listener_action: RecordDecl = {
  name: 'lb_listener_action',
  fields: [
    requiredField('type', enumType(['forward', 'redirect', 'fixed-response'])),
    optionalField('target_group_arn', arnType(lb_target_group)),
    optionalField('redirect', recordType(lb_listener_action_redirect)),
    optionalField(
      'fixed_response',
      recordType(lb_listener_action_fixed_response)
    ),
  ],
};

const lb_listener_rule_values: RecordDecl = {
  name: 'lb_listener_rule_values',
  fields: [
    requiredField('values', listType(STRING)),
  ],
};

const lb_listener_rule_condition: RecordDecl = {
  name: 'lb_listener_rule_condition',
  fields: [
    optionalField('host_header', recordType(lb_listener_rule_values)),
    optionalField('http_request_method', recordType(lb_listener_rule_values)),
    optionalField('path_pattern', recordType(lb_listener_rule_values)),
    optionalField('source_ip', recordType(lb_listener_rule_values)),
  ],
};


const lb_listener: RecordDecl = {
  name: 'lb_listener',
  fields: [
    requiredField('load_balancer_arn', arnType(lb)),
    requiredField('port', NUMBER),
    optionalField('protocol', enumType(['TCP', 'HTTP', 'HTTPS'])),
    optionalField('ssl_policy', STRING),
    optionalField('certificate_arn', arnType(acm_certificate)),
    requiredField('default_action', recordType(lb_listener_action)),
  ],
};

const lb_listener_rule: RecordDecl = {
  name: 'lb_listener_rule',
  fields: [
    requiredField('listener_arn', arnType(lb_listener)),
    optionalField('priority', NUMBER),
    requiredField('action', recordType(lb_listener_action)),
    requiredField('condition', recordType(lb_listener_rule_condition)),
  ],
};

const lb_listener_certificate: RecordDecl = {
  name: 'lb_listener_certificate',
  fields: [
    requiredField('listener_arn', arnType(lb_listener)),
    requiredField('certificate_arn', arnType(acm_certificate)),
  ],
};

const lb_target_group_attachment: RecordDecl = {
  name: 'lb_target_group_attachment',
  fields: [
    requiredField('target_group_arn', arnType(lb_target_group)),
    requiredField('target_id', STRING),
    optionalField('port', NUMBER),
    optionalField('availability_zone', stringAliasType('AT.AvailabilityZone')),
  ],
};

const autoscaling_attachment: RecordDecl = {
  name: 'autoscaling_attachment',
  fields: [
    requiredField(
      'autoscaling_group_name',
      resourceIdType('AutoscalingGroupId')
    ),
    requiredField('alb_target_group_arn', arnType(lb_target_group)),
  ],
};

const cloudwatch_log_group: RecordDecl = {
  name: 'cloudwatch_log_group',
  fields: [
    optionalField('name', STRING),
    optionalField('name_prefix', STRING),
    optionalField('retention_in_days', NUMBER),
    optionalField('tags', TAGS_MAP),
  ],
};

const aws_provider: RecordDecl = {
  name: 'aws',
  fields: [optionalField('region', stringAliasType('AT.Region'))],
};

const elasticsearch_domain_ebs_options: RecordDecl = {
  name: 'elasticsearch_domain_ebs_options',
  fields: [
    requiredField('ebs_enabled', BOOLEAN),
    optionalField('volume_type', STRING),
    optionalField('volume_size', NUMBER),
    optionalField('iops', NUMBER),
  ],
};

const elasticsearch_domain_cluster_config: RecordDecl = {
  name: 'elasticsearch_domain_cluster_config',
  fields: [
    optionalField('instance_type', stringAliasType('AT.EsInstanceType')),
    optionalField('instance_count', NUMBER),
    optionalField('dedicated_master_enabled', BOOLEAN),
    optionalField(
      'dedicated_master_type',
      stringAliasType('AT.EsInstanceType')
    ),
    optionalField('dedicated_master_count', NUMBER),
    optionalField('zone_awareness_enabled', BOOLEAN),
  ],
};

const elasticsearch_domain_snapshot_options: RecordDecl = {
  name: 'elasticsearch_domain_snapshot_options',
  fields: [requiredField('automated_snapshot_start_hour', NUMBER)],
};

const elasticsearch_domain_vpc_options: RecordDecl = {
  name: 'elasticsearch_domain_vpc_options',
  fields: [
    optionalField(
      'security_group_ids',
      listType(resourceIdType('SecurityGroupId'))
    ),
    requiredField('subnet_ids', listType(resourceIdType('SubnetId'))),
  ],
};

const elasticsearch_domain_cognito_options: RecordDecl = {
  name: 'elasticsearch_domain_cognito_options',
  fields: [
    optionalField('enabled', BOOLEAN),
    requiredField('user_pool_id', resourceIdType('CognitoUserPoolId')),
    requiredField('identity_pool_id', resourceIdType('CognitoIdentityPoolId')),
    requiredField('role_arn', arnType(iam_role)),
  ],
};

const elasticsearch_domain: RecordDecl = {
  name: 'elasticsearch_domain',
  fields: [
    requiredField('domain_name', STRING),
    optionalField('access_policies', STRING),
    optionalField('advanced_options', TAGS_MAP),
    optionalField('ebs_options', recordType(elasticsearch_domain_ebs_options)),
    optionalField(
      'cluster_config',
      recordType(elasticsearch_domain_cluster_config)
    ),
    optionalField(
      'snapshot_options',
      recordType(elasticsearch_domain_snapshot_options)
    ),
    optionalField(
      'cognito_options',
      recordType(elasticsearch_domain_cognito_options)
    ),
    optionalField('vpc_options', recordType(elasticsearch_domain_vpc_options)),
    optionalField('elasticsearch_version', STRING),
    optionalField('tags', TAGS_MAP),
  ],
};

const elasticsearch_domain_policy: RecordDecl = {
  name: 'elasticsearch_domain_policy',
  fields: [
    requiredField('domain_name', STRING),
    optionalField('access_policies', STRING),
  ],
};

const launch_configuration: RecordDecl = {
  name: 'launch_configuration',
  fields: [
    optionalField('name', STRING),
    optionalField('name_prefix', STRING),
    requiredField('image_id', stringAliasType('AT.Ami')),
    requiredField('instance_type', stringAliasType('AT.InstanceType')),
    optionalField(
      'iam_instance_profile',
      resourceIdType('IamInstanceProfileId')
    ),
    optionalField('key_name', stringAliasType('AT.KeyName')),
    optionalField(
      'security_groups',
      listType(resourceIdType('SecurityGroupId'))
    ),
    optionalField('associate_public_ip_address', BOOLEAN),
    optionalField('user_data', STRING),
    optionalField('enable_monitoring', BOOLEAN),

    optionalField('ebs_optimized', BOOLEAN),
    optionalField('root_block_device', recordType(instance_root_block_device)),
    optionalField('spot_price', NUMBERSTR, [
      "(Number in string). Maximum $ per hour spot price"
    ]),
  ],
};

// https://www.terraform.io/docs/providers/aws/r/autoscaling_group.html#tag-and-tags
const autoscaling_group_tag: RecordDecl = {
  name: 'autoscaling_group_tag',
  fields: [
    requiredField('key', STRING),
    requiredField('value', STRING),
    requiredField('propagate_at_launch', BOOLEAN),
  ],
};

const autoscaling_schedule: RecordDecl = {
  name: 'autoscaling_schedule',
  fields: [
    requiredField('autoscaling_group_name', STRING),
    requiredField('scheduled_action_name', STRING),
    optionalField('start_time', STRING),
    optionalField('end_time', STRING),
    optionalField('recurrence', STRING),
    optionalField('min_size', NUMBER),
    optionalField('max_size', NUMBER),
    optionalField('desired_capacity', NUMBER),
  ],
};

const autoscaling_group: RecordDecl = {
  name: 'autoscaling_group',
  fields: [
    optionalField('name', STRING),
    optionalField('name_prefix', STRING),
    requiredField('min_size', NUMBER),
    optionalField('desired_capacity', NUMBER),
    requiredField('max_size', NUMBER),
    optionalField('vpc_zone_identifier', listType(resourceIdType('SubnetId'))),

    requiredField('launch_configuration', STRING), // launch_configuration.name
    optionalField('load_balancers', listType(STRING)),
    optionalField(
      'enabled_metrics',
      listType(
        enumType([
          'GroupMinSize',
          'GroupMaxSize',
          'GroupDesiredCapacity',
          'GroupInServiceInstances',
          'GroupPendingInstances',
          'GroupStandbyInstances',
          'GroupTerminatingInstances',
          'GroupTotalInstances',
        ])
      )
    ),

    optionalField('tags', listType(recordType(autoscaling_group_tag))),

    optionalField(
      'termination_policies',
      listType(
        enumType([
          'OldestInstance',
          'NewestInstance',
          'OldestLaunchConfiguration',
          'ClosestToNextInstanceHour',
          'OldestLaunchTemplate',
          'AllocationStrategy',
          'Default',
        ])
      )
    ),
  ],
};

const cloudwatch_logging_options: RecordDecl = {
  name: 'cloudwatch_logging_options',
  fields: [
    optionalField('enabled', BOOLEAN),
    optionalField('log_group_name', STRING),
    optionalField('log_stream_name', STRING),
  ],
};

const extended_s3_configuration: RecordDecl = {
  name: 'extended_s3_configuration',
  fields: [
    requiredField('role_arn', arnType(iam_role)),
    requiredField('bucket_arn', arnType(s3_bucket)),
    optionalField('buffer_size', NUMBER),
    optionalField('buffer_interval', NUMBER),
    optionalField(
      'cloudwatch_logging_options',
      recordType(cloudwatch_logging_options)
    ),
  ],
};

const kinesis_firehose_delivery_stream: RecordDecl = {
  name: 'kinesis_firehose_delivery_stream',
  fields: [
    requiredField('name', STRING),
    requiredField(
      'destination',
      enumType(['extended_s3', 'redshift', 'elasticsearch', 'splunk'])
    ),
    optionalField(
      'extended_s3_configuration',
      recordType(extended_s3_configuration)
    ),
    optionalField('tags', TAGS_MAP),
  ],
};

const s3_bucket_metric: RecordDecl = {
  name: 's3_bucket_metric',
  fields: [requiredField('bucket', STRING), requiredField('name', STRING)],
};

const elasticache_subnet_group: RecordDecl = {
  name: 'elasticache_subnet_group',
  fields: [
    requiredField('name', STRING),
    optionalField('description', STRING),
    requiredField('subnet_ids', listType(resourceIdType('SubnetId'))),
  ],
};

const elasticache_parameter_group: RecordDecl = {
  name: 'elasticache_parameter_group',
  fields: [
    requiredField('name', STRING),
    requiredField('family', STRING),
    optionalField('description', STRING),
  ],
};

const elasticache_cluster: RecordDecl = {
  name: 'elasticache_cluster',
  fields: [
    requiredField('cluster_id', STRING),
    requiredField('engine', enumType(['memcached', 'redis'])),
    requiredField('node_type', stringAliasType('AT.CacheNodeType')),
    requiredField('num_cache_nodes', NUMBER),
    requiredField(
      'parameter_group_name',
      stringAliasType('AT.ElasticacheParameterGroupName')
    ),
    optionalField('port', NUMBER),
    optionalField(
      'security_group_ids',
      listType(resourceIdType('SecurityGroupId'))
    ),
    optionalField('subnet_group_name', STRING),
    optionalField('tags', TAGS_MAP),
  ],
};

const vpc_config: RecordDecl = {
  name: 'vpc_config',
  fields: [
    requiredField('subnet_ids', listType(resourceIdType('SubnetId'))),
    requiredField(
      'security_group_ids',
      listType(resourceIdType('SecurityGroupId'))
    ),
  ],
};

const lambda_function_environment: RecordDecl = {
  name: 'lambda_function_environment',
  fields: [optionalField('variables', TAGS_MAP)],
};

const lambda_function: RecordDecl = {
  name: 'lambda_function',
  fields: [
    requiredField('function_name', STRING),
    optionalField('filename', STRING),
    optionalField('s3_bucket', STRING),
    optionalField('s3_key', STRING),
    optionalField('source_code_hash', STRING),
    requiredField('role', arnType(iam_role)),
    requiredField('handler', STRING),
    requiredField('runtime', stringAliasType('AT.LambdaRuntime')),
    optionalField('vpc_config', recordType(vpc_config)),
    optionalField('environment', recordType(lambda_function_environment)),
    optionalField('timeout', NUMBER),
    optionalField('memory_size', NUMBER),
    optionalField('tags', TAGS_MAP),
  ],
};

const cloudwatch_event_rule = {
  name: 'cloudwatch_event_rule',
  fields: [
    optionalField('name', STRING),
    optionalField('schedule_expression', STRING),
    optionalField('description', STRING),
  ],
};

const cloudwatch_event_target = {
  name: 'cloudwatch_event_target',
  fields: [
    requiredField('rule', STRING),
    requiredField('arn', stringAliasType('AT.Arn')),
    requiredField('input', STRING),
  ],
};

const lambda_permission: RecordDecl = {
  name: 'lambda_permission',
  fields: [
    requiredField('action', stringAliasType('AT.LambdaPermissionAction')),
    requiredField('function_name', STRING),
    requiredField('principal', STRING),
    optionalField('source_arn', stringAliasType('AT.Arn')),
  ],
};

const field_to_match: RecordDecl = {
  name: 'field_to_match',
  fields: [
    optionalField('data', STRING),
    requiredField(
      'type',
      enumType([
        'HEADER',
        'METHOD',
        'QUERY_STRING',
        'URI',
        'BODY',
        'SINGLE_QUERY_ARG',
        'ALL_QUERY_ARGS',
      ])
    ),
  ],
};

const byte_match_tuples: RecordDecl = {
  name: 'byte_match_tuples',
  fields: [
    requiredField('field_to_match', recordType(field_to_match)),
    requiredField(
      'positional_constraint',
      stringAliasType('AT.PositionalConstraint')
    ),
    optionalField('target_string', STRING),
  ],
};

const waf_byte_match_set: RecordDecl = {
  name: 'waf_byte_match_set',
  fields: [
    requiredField('name', STRING),
    requiredField('byte_match_tuples', recordType(byte_match_tuples)),
  ],
};

const ip_set_descriptors: RecordDecl = {
  name: 'ip_set_descriptors',
  fields: [
    requiredField('type', enumType(['IPV4', 'IPV6'])),
    requiredField('value', STRING),
  ],
};

const waf_ipset: RecordDecl = {
  name: 'waf_ipset',
  fields: [
    requiredField('name', STRING),
    requiredField('ip_set_descriptors', recordType(ip_set_descriptors)),
  ],
};

const wafregional_regex_pattern_set: RecordDecl = {
  name: 'wafregional_regex_pattern_set',
  fields: [
    requiredField('name', STRING),
    optionalField('regex_pattern_strings', listType(STRING)),
  ],
};

const regex_match_tuple: RecordDecl = {
  name: 'regex_match_tuple',
  fields: [
    requiredField('field_to_match', recordType(field_to_match)),
    requiredField(
      'regex_pattern_set_id',
      resourceIdType('WafregionalRegexPatternSetId')
    ),
    requiredField(
      'text_transformation',
      stringAliasType('AT.TextTransformation')
    ),
  ],
};

const wafregional_regex_match_set: RecordDecl = {
  name: 'wafregional_regex_match_set',
  fields: [
    requiredField('name', STRING),
    requiredField('regex_match_tuple', recordType(regex_match_tuple)),
  ],
};

const wafregional_ipset: RecordDecl = {
  name: 'wafregional_ipset',
  fields: [
    requiredField('name', STRING),
    optionalField(
      'ip_set_descriptor',
      listType(recordType(ip_set_descriptors))
    ),
  ],
};

const predicate: RecordDecl = {
  name: 'predicate',
  fields: [
    requiredField(
      'type',
      enumType([
        'IPMatch',
        'ByteMatch',
        'SqlInjectionMatch',
        'GeoMatch',
        'SizeConstraint',
        'XssMatch',
        'RegexMatch',
      ])
    ),
    requiredField('data_id', STRING),
    requiredField('negated', BOOLEAN),
  ],
};

const wafregional_rule: RecordDecl = {
  name: 'wafregional_rule',
  fields: [
    requiredField('name', STRING),
    requiredField('metric_name', STRING),
    optionalField('predicate', listType(recordType(predicate))),
  ],
};

const action: RecordDecl = {
  name: 'action',
  fields: [requiredField('type', enumType(['ALLOW', 'BLOCK', 'COUNT']))],
};

const rule: RecordDecl = {
  name: 'rule',
  fields: [
    requiredField('action', recordType(action)),
    optionalField('override_action', recordType(action)),
    requiredField('priority', NUMBER),
    requiredField('rule_id', resourceIdType('WafregionalRuleId')),
    optionalField('type', enumType(['REGULAR', 'RATE_BASED', 'GROUP'])),
  ],
};

const wafregional_web_acl: RecordDecl = {
  name: 'wafregional_web_acl',
  fields: [
    requiredField('name', STRING),
    requiredField('metric_name', STRING),
    requiredField('default_action', recordType(action)),
    requiredField('rule', recordType(rule)),
  ],
};

const wafregional_web_acl_association: RecordDecl = {
  name: 'wafregional_web_acl_association',
  fields: [
    requiredField('web_acl_id', resourceIdType('WafregionalWebAclId')),
    requiredField('resource_arn', arnType(lb)),
  ],
};

const secretsmanager_secret: RecordDecl = {
  name: 'secretsmanager_secret',
  fields: [
    optionalField('name', STRING),
    optionalField('name_prefix', STRING),
    optionalField('description', STRING),
    optionalField('tags', TAGS_MAP),
  ],
};

const secretsmanager_secret_version: RecordDecl = {
  name: 'secretsmanager_secret_version',
  fields: [
    requiredField('secret_id', resourceIdType('SecretsmanagerSecretId')),
    optionalField('secret_string', STRING),
    optionalField('secret_binary', STRING),
    optionalField('version_stages', listType(STRING)),
  ],
};

const cloudfront_cookies: RecordDecl = {
  name: 'cloudfront_cookies',
  fields: [
    requiredField('forward', enumType(['all', 'none', 'whitelist'])),
    optionalField('whitelisted_names', listType(STRING)),
  ],
};

const cloudfront_forwarded_values: RecordDecl = {
  name: 'cloudfront_forwarded_values',
  fields: [
    requiredField('cookies', recordType(cloudfront_cookies)),
    requiredField('query_string', BOOLEAN),
  ],
};

const cloudfront_cache_behavior: RecordDecl = {
  name: 'cloudfront_cache_behaviour',
  fields: [
    requiredField('allowed_methods', listType(STRING)),
    requiredField('cached_methods', listType(STRING)),
    requiredField('forwarded_values', recordType(cloudfront_forwarded_values)),
    optionalField('path_pattern', STRING),
    optionalField('compress', BOOLEAN),
    optionalField('default_ttl', NUMBER),
    optionalField('min_ttl', NUMBER),
    optionalField('max_ttl', NUMBER),
    requiredField('target_origin_id', STRING),
    requiredField(
      'viewer_protocol_policy',
      enumType(['allow-all', 'https-only', 'redirect-to-https'])
    ),
  ],
};

const cloudfront_s3_origin_config: RecordDecl = {
  name: 'cloudfront_s3_origin_config',
  fields: [],
};

const cloudfront_custom_origin_config: RecordDecl = {
  name: 'cloudfront_custom_origin_config',
  fields: [
    requiredField('http_port', NUMBER),
    requiredField('https_port', NUMBER),
    requiredField(
      'origin_protocol_policy',
      enumType(['http-only', 'https-only', 'match-viewer'])
    ),
    requiredField(
      'origin_ssl_protocols',
      listType(enumType(['SSLv3', 'TLSv1', 'TLSv1.1', 'TLSv1.2']))
    ),
    optionalField('origin_keepalive_timeout', NUMBER),
    optionalField('origin_read_timeout', NUMBER),
  ],
};

const cloudfront_origin: RecordDecl = {
  name: 'cloudfront_origin',
  fields: [
    requiredField('domain_name', STRING),
    requiredField('origin_id', STRING),
    optionalField('s3_origin_config', recordType(cloudfront_s3_origin_config)),
    optionalField(
      'custom_origin_config',
      recordType(cloudfront_custom_origin_config)
    ),
  ],
};

const cloudfront_geo_restrictions: RecordDecl = {
  name: 'cloudfront_geo_restrictions',
  fields: [
    requiredField(
      'restriction_type',
      enumType(['none', 'whitelist', 'blacklist'])
    ),
    optionalField('locations', listType(STRING)),
  ],
};

const cloudfront_restrictions: RecordDecl = {
  name: 'cloudfront_restrictions',
  fields: [
    requiredField('geo_restriction', recordType(cloudfront_geo_restrictions)),
  ],
};

const cloudfront_viewer_certificate: RecordDecl = {
  name: 'cloudfront_viewer_certificate',
  fields: [
    optionalField('cloudfront_default_certificate', BOOLEAN),
    optionalField('acm_certificate_arn', arnType(acm_certificate)),
    optionalField(
      'minimum_protocol_version',
      enumType(['SSLv3', 'TLSv1', 'TLSv1_2016', 'TLSv1.1_2016', 'TLSv1.2_2018'])
    ),
    optionalField('ssl_support_method', enumType(['vip', 'sni-only'])),
  ],
};

const cloudfront_custom_error_response: RecordDecl = {
  name: 'cloudfront_custom_error_response',
  fields: [
    requiredField('error_code', NUMBER),
    optionalField('response_code', NUMBER),
    optionalField('response_page_path', STRING),
    optionalField('error_caching_min_ttl', NUMBER),
  ],
};

const cloudfront_distribution: RecordDecl = {
  name: 'cloudfront_distribution',
  fields: [
    requiredField(
      'default_cache_behavior',
      recordType(cloudfront_cache_behavior)
    ),
    requiredField('enabled', BOOLEAN),
    requiredField('origin', listType(recordType(cloudfront_origin))),
    requiredField('restrictions', recordType(cloudfront_restrictions)),
    requiredField(
      'viewer_certificate',
      recordType(cloudfront_viewer_certificate)
    ),
    optionalField('aliases', listType(STRING)),
    optionalField('is_ipv6_enabled', BOOLEAN),
    optionalField(
      'custom_error_response',
      listType(recordType(cloudfront_custom_error_response))
    ),
    optionalField('tags', TAGS_MAP),
  ],
};

const api_gateway_rest_api: RecordDecl = {
  name: 'api_gateway_rest_api',
  fields: [requiredField('name', STRING), optionalField('description', STRING)],
};

const api_gateway_resource: RecordDecl = {
  name: 'api_gateway_resource',
  fields: [
    requiredField('rest_api_id', resourceIdType('ApiGatewayRestApiId')),
    requiredField('parent_id', resourceIdType('ApiGatewayRestApiId')),
    requiredField('path_part', STRING),
  ],
};

const api_gateway_method: RecordDecl = {
  name: 'api_gateway_method',
  fields: [
    requiredField('rest_api_id', resourceIdType('ApiGatewayRestApiId')),
    requiredField('resource_id', resourceIdType('ApiGatewayResourceId')),
    requiredField(
      'http_method',
      enumType(['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'ANY'])
    ),
    requiredField(
      'authorization',
      enumType(['NONE', 'CUSTOM', 'AWS_IAM', 'COGNITO_USER_POOLS'])
    ),
  ],
};

const api_gateway_method_response: RecordDecl = {
  name: 'api_gateway_method_response',
  fields: [
    requiredField('rest_api_id', resourceIdType('ApiGatewayRestApiId')),
    requiredField('resource_id', resourceIdType('ApiGatewayResourceId')),
    requiredField(
      'http_method',
      enumType(['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'ANY'])
    ),
    requiredField('status_code', STRING),
    optionalField('response_models', TAGS_MAP),
    optionalField('response_parameters', TAGS_MAP),
  ],
};

const api_gateway_integration: RecordDecl = {
  name: 'api_gateway_integration',
  fields: [
    requiredField('rest_api_id', resourceIdType('ApiGatewayRestApiId')),
    requiredField('resource_id', resourceIdType('ApiGatewayResourceId')),
    requiredField(
      'http_method',
      enumType(['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'ANY'])
    ),
    optionalField(
      'integration_http_method',
      enumType(['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTION'])
    ),
    optionalField('uri', STRING),
    optionalField('request_templates', TAGS_MAP),
    requiredField(
      'type',
      enumType(['HTTP', 'MOCK', 'AWS', 'AWS_PROXY', 'HTTP_PROXY'])
    ),
  ],
};

const api_gateway_integration_response: RecordDecl = {
  name: 'api_gateway_integration_response',
  fields: [
    requiredField('rest_api_id', resourceIdType('ApiGatewayRestApiId')),
    requiredField('resource_id', resourceIdType('ApiGatewayResourceId')),
    requiredField(
      'http_method',
      enumType(['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'ANY'])
    ),
    requiredField('status_code', STRING),
    optionalField('response_parameters', TAGS_MAP),
  ],
};

const api_gateway_deployment: RecordDecl = {
  name: 'api_gateway_deployment',
  fields: [
    requiredField('rest_api_id', resourceIdType('ApiGatewayRestApiId')),
    requiredField('stage_name', STRING),
    optionalField('description', STRING),
  ],
};

const api_gateway_domain_name: RecordDecl = {
  name: 'api_gateway_domain_name',
  fields: [
    requiredField('domain_name', STRING),
    optionalField('certificate_arn', arnType(acm_certificate)),
  ],
};

const api_gateway_base_path_mapping: RecordDecl = {
  name: 'api_gateway_base_path_mapping',
  fields: [
    requiredField('domain_name', STRING),
    requiredField('api_id', resourceIdType('ApiGatewayRestApiId')),
    optionalField('stage_name', STRING),
    optionalField('base_path', STRING),
  ],
};

const s3_bucket_notification_queue: RecordDecl = {
  name: 's3_bucket_notification_queue',
  fields: [
    optionalField('id', STRING),
    requiredField('queue_arn', arnType(sqs_queue)),
    requiredField('events', listType(STRING)),
    optionalField('filter_prefix', STRING),
    optionalField('filter_suffix', STRING),
  ],
};

const s3_bucket_notification_lambda: RecordDecl = {
  name: 's3_bucket_notification_lambda',
  fields: [
    optionalField('id', STRING),
    requiredField('lambda_function_arn', arnType(lambda_function)),
    requiredField('events', listType(STRING)),
    optionalField('filter_prefix', STRING),
    optionalField('filter_suffix', STRING),
  ],
};

const s3_bucket_notification: RecordDecl = {
  name: 's3_bucket_notification',
  fields: [
    requiredField('bucket', STRING),
    optionalField('queue', recordType(s3_bucket_notification_queue)),
    optionalField('lambda_function', recordType(s3_bucket_notification_lambda)),
  ],
};

const cognito_invite_message_template: RecordDecl = {
  name: 'cognito_invite_message_template',
  fields: [
    optionalField('email_message', STRING),
    optionalField('email_subject', STRING),
    optionalField('sms_message', STRING),
  ],
};

const cognito_admin_create_users: RecordDecl = {
  name: 'cognito_admin_create_users',
  fields: [
    optionalField('allow_admin_create_user_only', BOOLEAN),
    optionalField(
      'invite_message_template',
      recordType(cognito_invite_message_template)
    ),
    optionalField('unused_account_Validity_days', NUMBER),
  ],
};

const cognito_schema_string_attribute_constraints: RecordDecl = {
  name: 'cognito_schema_string_attribute_constraints',
  fields: [
    optionalField('min_length', NUMBER),
    optionalField('max_length', NUMBER),
  ],
};

const cognito_schema_number_attribute_constraints: RecordDecl = {
  name: 'cognito_schema_number_attribute_constraints',
  fields: [
    optionalField('min_value', NUMBER),
    optionalField('max_value', NUMBER),
  ],
};

const cognito_schema_attributes: RecordDecl = {
  name: 'cognito_schema_attributes',
  fields: [
    requiredField('name', STRING),
    requiredField(
      'attribute_data_type',
      enumType(['Boolean', 'Number', 'String', 'DateTime'])
    ),
    optionalField('developer_only_attribute', BOOLEAN),
    optionalField(
      'string_attribute_constraints',
      recordType(cognito_schema_string_attribute_constraints)
    ),
    optionalField(
      'number_attribute_constraints',
      recordType(cognito_schema_number_attribute_constraints)
    ),
    optionalField('mutable', BOOLEAN),
    optionalField('required', BOOLEAN),
  ],
};

const cognito_user_pool: RecordDecl = {
  name: 'cognito_user_pool',
  fields: [
    requiredField('name', STRING),
    optionalField(
      'admin_create_user_config',
      recordType(cognito_admin_create_users)
    ),
    optionalField(
      'auto_verified_attributes',
      listType(enumType(['email', 'phone_number']))
    ),
    optionalField('schema', listType(recordType(cognito_schema_attributes))),
    optionalField(
      'username_attributes',
      listType(enumType(['email', 'phone_number']))
    ),
    optionalField('sms_authentication_message', STRING),
    optionalField('sms_verification_message', STRING),
    optionalField('tags', TAGS_MAP),
    // TODO(timd): complete
  ],
};

const cognito_user_pool_client: RecordDecl = {
  name: 'cognito_user_pool_client',
  fields: [
    requiredField('name', STRING),
    requiredField('user_pool_id', resourceIdType('CognitoUserPoolId')),
    optionalField('read_attributes', listType(STRING)),
    optionalField('write_attributes', listType(STRING)),
    optionalField(
      'allowed_oauth_flows',
      listType(enumType(['code', 'implicit', 'client_credentials']))
    ),
    optionalField('allowed_oauth_flows_user_pool_client', BOOLEAN),
    optionalField(
      'allowed_oauth_scopes',
      listType(
        enumType([
          'phone',
          'email',
          'openid',
          'profile',
          'aws.cognito.signin.user.admin',
        ])
      )
    ),
    optionalField('callback_urls', listType(STRING)),
    optionalField('logout_urls', listType(STRING)),
    optionalField('supported_identity_providers', listType(STRING)),
  ],
};

const cognito_user_pool_domain: RecordDecl = {
  name: 'cognito_user_pool_domain',
  fields: [
    requiredField('domain', STRING),
    requiredField('user_pool_id', resourceIdType('CognitoUserPoolId')),
    optionalField('certificate_arn', arnType(acm_certificate)),
  ],
};

const cognito_identity_provider: RecordDecl = {
  name: 'cognito_identity_provider',
  fields: [
    optionalField('client_id', resourceIdType('CognitoUserPoolId')),
    optionalField('provider_name', STRING),
    optionalField('server_side_token_check', BOOLEAN),
  ],
};

const cognito_identity_pool: RecordDecl = {
  name: 'cognito_identity_pool',
  fields: [
    requiredField('identity_pool_name', STRING),
    requiredField('allow_unauthenticated_identities', BOOLEAN),
    optionalField(
      'cognito_identity_providers',
      listType(recordType(cognito_identity_provider))
    ),
    // TODO(timd): complete
  ],
};

const cognito_identity_pool_roles_attachment_roles: RecordDecl = {
  name: 'cognito_identity_pool_roles_attachment_roles',
  fields: [
    optionalField('authenticated', arnType(iam_role)),
    optionalField('unauthenticated', arnType(iam_role)),
  ],
};

const cognito_identity_pool_roles_attachment: RecordDecl = {
  name: 'cognito_identity_pool_roles_attachment',
  fields: [
    requiredField('identity_pool_id', resourceIdType('CognitoIdentityPoolId')),
    requiredField(
      'roles',
      recordType(cognito_identity_pool_roles_attachment_roles)
    ),
  ],
};

const eks_cluster_vpc_config: RecordDecl = {
  name: 'eks_cluster_vpc_config',
  fields: [
    optionalField('endpoint_private_access', BOOLEAN),
    optionalField('endpoint_public_access', BOOLEAN),
    optionalField(
      'security_group_ids',
      listType(resourceIdType('SecurityGroupId'))
    ),
    requiredField('subnet_ids', listType(resourceIdType('SubnetId'))),
  ],
};

const eks_cluster: RecordDecl = {
  name: 'eks_cluster',
  fields: [
    requiredField('name', STRING),
    requiredField('role_arn', arnType(iam_role)),
    requiredField('vpc_config', recordType(eks_cluster_vpc_config)),
    optionalField(
      'enabled_cluster_log_Types',
      listType(
        enumType([
          'api',
          'audit',
          'authenticator',
          'controllerManager',
          'scheduler',
        ])
      )
    ),
    optionalField('version', STRING),
  ],
};

function autoscaling_policy(gen: Generator): ResourcesParams {
  // https://www.terraform.io/docs/providers/aws/r/autoscaling_policy.html#step_adjustment
  const step_adjustment: RecordDecl = {
    name: 'step_adjustment',
    fields: [
      requiredField('scaling_adjustment ', NUMBER, [
        'The number of members by which to scale, when the adjustment bounds are breached.',
        'A positive value scales up. A negative value scales down.',
      ]),

      optionalField('metric_interval_lower_bound', NUMBER, [
        'The lower bound for the difference between the alarm threshold and the CloudWatch metric.',
        'Without a value, AWS will treat this bound as infinity.',
      ]),

      optionalField('metric_interval_upper_bound', NUMBER, [
        'The upper bound for the difference between the alarm threshold and the CloudWatch metric.',
        'Without a value, AWS will treat this bound as infinity. The upper bound must be greater than the lower bound.',
      ]),
    ],
  };
  gen.generateParams(step_adjustment);

  // https://www.terraform.io/docs/providers/aws/r/autoscaling_policy.html#predefined_metric_specification
  const predefined_metric_specification: RecordDecl = {
    name: 'predefined_metric_specification',
    fields: [
      requiredField(
        'predefined_metric_type',
        enumType([
          'ASGAverageCPUUtilization',
          'ASGAverageNetworkIn',
          'ASGAverageNetworkOut',
          'ALBRequestCountPerTarget',
        ]),
        [
          'ASGAverageCPUUtilization : Average CPU utilization of the Auto Scaling group.',
          'ASGAverageNetworkIn : Average number of bytes received on all network interfaces by the Auto Scaling group.',
          'ASGAverageNetworkOut : Average number of bytes sent out on all network interfaces by the Auto Scaling group.',
          'ALBRequestCountPerTarget : Number of requests completed per target in an Application Load Balancer target group.',
        ]
      ),
      optionalField('resource_label', STRING, [
        'Identifies the resource associated with the metric type.',
      ]),
    ],
  };
  gen.generateParams(predefined_metric_specification);

  // https://www.terraform.io/docs/providers/aws/r/autoscaling_policy.html#metric_dimension
  const metric_dimension: RecordDecl = {
    name: 'metric_dimension',
    fields: [requiredField('name', STRING), requiredField('value', STRING)],
  };
  gen.generateParams(metric_dimension);

  // https://www.terraform.io/docs/providers/aws/r/autoscaling_policy.html#customized_metric_specification
  const customized_metric_specification: RecordDecl = {
    name: 'customized_metric_specification',
    fields: [
      requiredField('metric_name', STRING),
      requiredField('namespace', STRING),
      requiredField('statistic', STRING),
      optionalField('metric_dimension', listType(recordType(metric_dimension))),
      optionalField('unit', STRING),
    ],
  };
  gen.generateParams(customized_metric_specification);

  // https://www.terraform.io/docs/providers/aws/r/autoscaling_policy.html#target_tracking_configuration
  // https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html
  const target_tracking_configuration: RecordDecl = {
    name: 'target_tracking_configuration',
    fields: [
      // The target value for the metric
      requiredField('target_value', NUMBER),

      // One Of:
      optionalField(
        'predefined_metric_specification',
        recordType(predefined_metric_specification)
      ),
      optionalField(
        'customized_metric_specification',
        recordType(customized_metric_specification)
      ),

      //  - (Optional, Default: false) Indicates whether scale in by the target tracking policy is disabled.
      // Disabling scale-in makes sure this target tracking scaling policy will never be used to scale in the Auto Scaling group.
      optionalField('disable_scale_in', BOOLEAN),
    ],
  };
  gen.generateParams(target_tracking_configuration);

  const simple_scaling: RecordDecl = {
    name: 'simple_scaling',
    fields: [
      requiredField('policy_type', enumType(['SimpleScaling'])),
      optionalField('cooldown', NUMBER, [
        'The amount of time, in seconds, after a scaling activity completes and before the next scaling activity can start.',
      ]),
      requiredField('scaling_adjustment', NUMBER, [
        'The number of instances by which to scale.',
        'adjustment_type determines the interpretation of this number',
        '(e.g., as an absolute number or as a percentage of the existing Auto Scaling group size).',
        'A positive increment adds to the current capacity and a negative value removes from the current capacity.',
      ]),
    ],
  };
  gen.generateParams(simple_scaling);

  const step_scaling: RecordDecl = {
    name: 'step_scaling',
    fields: [
      requiredField('policy_type', enumType(['StepScaling'])),
      requiredField(
        'metric_aggregation_type',
        enumType(['Minimum', 'Maximum', 'Average'])
      ),
      requiredField('step_adjustment', listType(recordType(step_adjustment))),
      optionalField('estimated_instance_warmup', NUMBER, [
        'The estimated time, in seconds, until a newly launched instance will contribute CloudWatch metrics.',
        "Without a value, AWS will default to the group's specified cooldown period.",
      ]),
    ],
  };
  gen.generateParams(step_scaling);

  const target_tracking_scaling: RecordDecl = {
    name: 'target_tracking_scaling',
    fields: [
      requiredField('policy_type', enumType(['TargetTrackingScaling'])),
      requiredField(
        'target_tracking_configuration',
        recordType(target_tracking_configuration)
      ),
      optionalField('estimated_instance_warmup', NUMBER, [
        'The estimated time, in seconds, until a newly launched instance will contribute CloudWatch metrics.',
        "Without a value, AWS will default to the group's specified cooldown period.",
      ]),
    ],
  };
  gen.generateParams(target_tracking_scaling);

  // https://www.terraform.io/docs/providers/aws/r/autoscaling_policy.html
  const autoscaling_policy: RecordDecl = {
    name: 'autoscaling_policy',
    fields: [
      requiredField('name', STRING),
      requiredField(
        'autoscaling_group_name',
        resourceIdType('AutoscalingGroupId')
      ),

      optionalField(
        'adjustment_type',
        enumType([
          'ChangeInCapacity',
          'ExactCapacity',
          'PercentChangeInCapacity',
        ])
      ),
    ],
    variants: {
      simple_scaling,
      step_scaling,
      target_tracking_scaling,
    },
  };
  gen.generateResource(
    'Provides an AutoScaling Scaling Policy resource..',
    'https://www.terraform.io/docs/providers/aws/r/autoscaling_policy.html',
    autoscaling_policy,
    [
      stringAttr('name'),
      stringAttr('autoscaling_group_name'), // The scaling policy's assigned autoscaling group.
      stringAttr('adjustment_type'), // The scaling policy's adjustment type.
      stringAttr('policy_type'), // The scaling policy's type.
    ],
    {
      arn: true,
    }
  );
  gen.generateParams(autoscaling_policy);

  return {
    resources: {
      autoscaling_policy,
    },

    params: {
      step_adjustment,
      predefined_metric_specification,
      metric_dimension,
      customized_metric_specification,
      target_tracking_configuration,
    },
  };
}

function generateAws(gen: Generator) {
  // Generate the resources
  gen.generateResource(
    'Provides attachment of a autoscaling group to a ALB load balancer',
    'https://www.terraform.io/docs/providers/aws/r/autoscaling_attachment.html',
    autoscaling_attachment,
    []
  );

  gen.generateResource(
    'Provides aws_autoscaling_group',
    'https://www.terraform.io/docs/providers/aws/r/autoscaling_group.html',
    autoscaling_group,
    [resourceIdAttr('id', autoscaling_group), stringAttr('name')],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides an AutoScaling Schedule resource.',
    'https://www.terraform.io/docs/providers/aws/r/autoscaling_schedule.html',
    autoscaling_schedule,
    [],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides an EC2 instance resource.',
    'https://www.terraform.io/docs/providers/aws/r/instance.html',
    instance,
    [
      resourceIdAttr('id', instance),
      stringAliasAttr('arn', 'Arn', 'AT.Arn'),
      stringAliasAttr(
        'availability_zone',
        'AvailabilityZone',
        'AT.AvailabilityZone'
      ),
    ]
  );

  gen.generateResource(
    'Provides an RDS instance resource.',
    'https://www.terraform.io/docs/providers/aws/r/db_instance.html',
    db_instance,
    [
      resourceIdAttr('id', db_instance),
      stringAttr('name'),
      stringAttr('username'),
      stringAttr('address'),
      stringAttr('port'),
      stringAttr('engine_version'),
    ],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides an RDS DB parameter group resource.',
    'https://www.terraform.io/docs/providers/aws/r/db_parameter_group.html',
    db_parameter_group,
    [resourceIdAttr('id', db_parameter_group)],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides an Elastic IP Address.',
    'https://www.terraform.io/docs/providers/aws/r/eip.html',
    eip,
    [
      resourceIdAttr('id', eip),
      stringAliasAttr('public_ip', 'IpAddress', 'AT.IpAddress'),
      stringAliasAttr('private_ip', 'IpAddress', 'AT.IpAddress'),
    ]
  );

  gen.generateResource(
    'Provides a VPC.',
    'https://www.terraform.io/docs/providers/aws/d/vpc.html',
    vpc,
    [resourceIdAttr('id', vpc)]
  );

  gen.generateResource(
    'Provides a resource to manage the default AWS VPC in the current region.',
    'https://www.terraform.io/docs/providers/aws/r/default_vpc.html',
    default_vpc,
    [resourceIdAttr('id', vpc)]
  );

  gen.generateResource(
    'Provides a VPC Subnet.',
    'https://www.terraform.io/docs/providers/aws/d/subnet.html',
    subnet,
    [
      resourceIdAttr('id', subnet),
    ]
  );

  gen.generateResource(
    'Provides a resource to manage a default AWS VPC subnet in the current region.',
    'https://www.terraform.io/docs/providers/aws/r/default_subnet.html',
    default_subnet,
    [
      resourceIdAttr('id', subnet),
      stringAliasAttr('availability_zone', 'AvailabilityZone', 'AT.AvailabilityZone'),
    ]
  );

  gen.generateResource(
    'Provides a security group resource.',
    'https://www.terraform.io/docs/providers/aws/r/security_group.html',
    security_group,
    [resourceIdAttr('id', security_group), stringAttr('owner_id')]
  );

  gen.generateResource(
    'Provides a security group rule resource.',
    'https://www.terraform.io/docs/providers/aws/r/security_group_rule.html',
    security_group_rule,
    [resourceIdAttr('id', security_group)]
  );

  gen.generateResource(
    'Provides a resource to create a VPC Internet Gateway.',
    'https://www.terraform.io/docs/providers/aws/r/internet_gateway.html',
    internet_gateway,
    [resourceIdAttr('id', internet_gateway)]
  );

  gen.generateResource(
    'Provides a resource to create a VPC NAT Gateway.',
    'https://www.terraform.io/docs/providers/aws/r/nat_gateway.html',
    nat_gateway,
    [resourceIdAttr('id', nat_gateway)]
  );

  gen.generateResource(
    'Provides a resource to create a VPC routing table.',
    'https://www.terraform.io/docs/providers/aws/r/route_table.html',
    route_table,
    [resourceIdAttr('id', route_table)]
  );

  gen.generateResource(
    'Provides a resource to create a routing table entry (a route) in a VPC routing table.',
    'https://www.terraform.io/docs/providers/aws/r/route.html',
    route,
    []
  );

  gen.generateResource(
    'Provides a resource to create an association between a subnet and routing table.',
    'https://www.terraform.io/docs/providers/aws/r/route_table_association.html',
    route_table_association,
    [resourceIdAttr('id', route_table_association)]
  );

  gen.generateResource(
    'Provides a Route53 Hosted Zone resource.',
    'https://www.terraform.io/docs/providers/aws/r/route53_zone.html',
    route53_zone,
    [
      stringAliasAttr('zone_id', 'HostedZoneId', 'AT.HostedZoneId'),
      stringAttr('name'),
    ]
  );

  gen.generateResource(
    'Provides a Route53 record resource.',
    'https://www.terraform.io/docs/providers/aws/r/route53_record.htm',
    route53_record,
    [stringAttr('name'), stringAttr('fqdn')]
  );

  gen.generateResource(
    'Provides a S3 bucket resource.',
    'https://www.terraform.io/docs/providers/aws/r/s3_bucket.html',
    s3_bucket,
    [stringAttr('id')],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides a S3 bucket object resource.',
    'https://www.terraform.io/docs/providers/aws/d/s3_bucket_object.html',
    s3_bucket_object,
    [stringAttr('id'), stringAttr('etag'), stringAttr('version_id')]
  );

  gen.generateResource(
    'Provides an SNS topic resource',
    'https://www.terraform.io/docs/providers/aws/r/sns_topic.html',
    sns_topic,
    [resourceIdAttr('id', sns_topic)],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides an IAM user.',
    'https://www.terraform.io/docs/providers/aws/r/iam_user.html',
    iam_user,
    [stringAttr('name'), stringAttr('unique_id')],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides an IAM policy attached to a user.',
    'https://www.terraform.io/docs/providers/aws/r/iam_user_policy.html',
    iam_user_policy,
    []
  );

  gen.generateResource(
    'Attaches a Managed IAM Policy to an IAM user',
    'https://www.terraform.io/docs/providers/aws/r/iam_user_policy_attachment.html',
    iam_user_policy_attachment,
    []
  );

  gen.generateResource(
    'Provides an EC2 Container Registry Repository',
    'https://www.terraform.io/docs/providers/aws/r/ecr_repository.html',
    ecr_repository,
    [
      stringAttr('name'),
      stringAttr('registry_id'),
      stringAttr('repository_url'),
    ],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides an RDS DB subnet group resource.',
    'https://www.terraform.io/docs/providers/aws/r/db_subnet_group.html',
    db_subnet_group,
    [resourceIdAttr('id', db_subnet_group), stringAttr('name')],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides a CloudWatch Metric Alarm resource.',
    'https://www.terraform.io/docs/providers/aws/r/cloudwatch_metric_alarm.html',
    cloudwatch_metric_alarm,
    [resourceIdAttr('id', cloudwatch_metric_alarm)]
  );

  gen.generateResource(
    'Provides an IAM role.',
    'https://www.terraform.io/docs/providers/aws/r/iam_role.html',
    iam_role,
    [
      resourceIdAttr('id', iam_role),
      stringAttr('name'),
      stringAttr('create_date'),
      stringAttr('unique_id'),
      stringAttr('description'),
    ],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides an IAM role policy',
    'https://www.terraform.io/docs/providers/aws/r/iam_role_policy.html',
    iam_role_policy,
    [
      stringAttr('id'),
      stringAttr('name'),
      stringAttr('policy'),
      stringAttr('role'),
    ]
  );

  gen.generateResource(
    'Provides an IAM policy.',
    'https://www.terraform.io/docs/providers/aws/r/iam_policy.html',
    iam_policy,
    [resourceIdAttr('id', iam_policy)],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Attaches a Managed IAM Policy to an IAM role',
    'https://www.terraform.io/docs/providers/aws/r/iam_role_policy_attachment.html',
    iam_role_policy_attachment,
    []
  );

  gen.generateResource(
    'Provides an IAM instance profile.',
    'https://www.terraform.io/docs/providers/aws/r/iam_instance_profile.html',
    iam_instance_profile,
    [
      resourceIdAttr('id', iam_instance_profile),
      stringAttr('name'),
      stringAttr('create_date'),
      stringAttr('unique_id'),
      stringAttr('role'),
    ],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides an SQS queue.',
    'https://www.terraform.io/docs/providers/aws/r/sqs_queue.html',
    sqs_queue,
    [resourceIdAttr('id', sqs_queue), stringAttr('name')],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Allows you to set a policy of an SQS Queue while referencing ARN of the queue within the policy.',
    'https://www.terraform.io/docs/providers/aws/r/sqs_queue_policy.html',
    sqs_queue_policy,
    []
  );

  gen.generateResource(
    'Provides a Load Balancer resource.',
    'https://www.terraform.io/docs/providers/aws/r/lb.html',
    lb,
    [
      resourceIdAttr('id', lb),
      stringAttr('dns_name'),
      stringAliasAttr('zone_id', 'HostedZoneId', 'AT.HostedZoneId'),
    ],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides a Load Balancer Listener resource.',
    'https://www.terraform.io/docs/providers/aws/r/lb_listener.html',
    lb_listener,
    [resourceIdAttr('id', lb_listener)],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'The ACM certificate resource allows requesting and management of certificates from the Amazon Certificate Manager.',
    'https://www.terraform.io/docs/providers/aws/r/acm_certificate.html',
    acm_certificate,
    [
      resourceIdAttr('id', acm_certificate),
      /*stringAttr list?
      // ??? needs array of attribute options eg domain_validation_options*/
    ],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'This resource represents a successful validation of an ACM certificate in concert with other resources.',
    'https://www.terraform.io/docs/providers/aws/r/acm_certificate.html',
    acm_certificate_validation,
    [
      // terraform only concept - not a real aws resource - hence no id or arn.
    ]
  );

  gen.generateResource(
    'Provides a Load Balancer Listener Certificate resource.',
    'https://www.terraform.io/docs/providers/aws/r/lb_listener_certificate.html',
    lb_listener_certificate,
    [resourceIdAttr('id', lb_listener_certificate)],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides a Target Group resource for use with Load Balancer resources.',
    'https://www.terraform.io/docs/providers/aws/r/lb_target_group.html',
    lb_target_group,
    [
      resourceIdAttr('id', lb_target_group),
      stringAttr('arn_suffix'),
      stringAttr('name'),
    ],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides the ability to register instances and containers with an Application Load Balancer (ALB) or Network Load Balancer (NLB) target group. ',
    'https://www.terraform.io/docs/providers/aws/r/lb_target_group_attachment.html',
    lb_target_group_attachment,
    [resourceIdAttr('id', lb_target_group_attachment)]
  );

  gen.generateResource(
    'Provides a Load Balancer Listener Rule resource.',
    'https://www.terraform.io/docs/providers/aws/r/lb_listener_rule.html',
    lb_listener_rule,
    [
      resourceIdAttr('id', lb_listener_rule),
      stringAliasAttr('arn', 'Arn', 'AT.Arn'),
    ]
  );

  gen.generateResource(
    'Provides an elasticsearch cluster',
    'https://www.terraform.io/docs/providers/aws/r/elasticsearch_domain.html',
    elasticsearch_domain,
    [
      stringAliasAttr('arn', 'Arn', 'AT.Arn'),
      stringAttr('domain_id'),
      stringAttr('domain_name'),
      stringAttr('endpoint'),
    ]
  );

  gen.generateResource(
    'Allows setting policy to an Elasticsearch domain while referencing domain attributes (e.g. ARN)',
    'https://www.terraform.io/docs/providers/aws/r/elasticsearch_domain_policy.html',
    elasticsearch_domain_policy,
    [stringAliasAttr('arn', 'Arn', 'AT.Arn')]
  );

  gen.generateResource(
    'Provides a CloudWatch Log Group resource.',
    'https://www.terraform.io/docs/providers/aws/r/cloudwatch_log_group.html',
    cloudwatch_log_group,
    [stringAliasAttr('arn', 'Arn', 'AT.Arn')]
  );

  gen.generateResource(
    'Provides aws_launch_configuration',
    'https://www.terraform.io/docs/providers/aws/r/launch_configuration.html',
    launch_configuration,
    [resourceIdAttr('id', launch_configuration), stringAttr('name')]
  );

  gen.generateResource(
    'Provides a Kinesis Firehose Delivery Stream resource',
    'https://www.terraform.io/docs/providers/aws/r/kinesis_firehose_delivery_stream.html',
    kinesis_firehose_delivery_stream,
    [stringAttr('name')],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides a S3 bucket metrics configuration resource',
    'https://www.terraform.io/docs/providers/aws/r/s3_bucket_metric.html',
    s3_bucket_metric,
    []
  );

  gen.generateResource(
    'Provides an ElastiCache parameter group resource.',
    'https://www.terraform.io/docs/providers/aws/r/elasticache_parameter_group.html',
    elasticache_parameter_group,
    [
      stringAliasAttr(
        'name',
        'ElasticacheParameterGroupName',
        'AT.ElasticacheParameterGroupName'
      ),
      stringAliasAttr(
        'family',
        'ElasticacheParameterGroupFamily',
        'AT.ElasticacheParameterGroupFamily'
      ),
      stringAttr('description'),
    ],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides an ElastiCache Subnet Group resource.',
    'https://www.terraform.io/docs/providers/aws/r/elasticache_subnet_group.html',
    elasticache_subnet_group,
    [stringAttr('name')]
  );

  gen.generateResource(
    'Provides an elasticache cluster resource.',
    'https://www.terraform.io/docs/providers/aws/r/elasticache_cluster.html',
    elasticache_cluster,
    [
      stringAttr('cluster_id'),
      stringAttr('engine'),
      stringAttr('node_type'),
      stringAliasAttr(
        'parameter_group_name',
        'ElasticacheParameterGroupName',
        'AT.ElasticacheParameterGroupName'
      ),
      stringAttr('configuration_endpoint'),
      stringAttr('cluster_address'),
    ],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides information about a Lambda Function.',
    'https://www.terraform.io/docs/providers/aws/d/lambda_function.html',
    lambda_function,
    [stringAttr('function_name'), resourceIdAttr('role', iam_role)],
    {
      arn: true,
    }
  );

  gen.generateResource(
    `Creates a Lambda permission to allow external sources invoking the Lambda function
    (e.g. CloudWatch Event Rule, SNS or S3).`,
    'https://www.terraform.io/docs/providers/aws/r/lambda_permission.html',
    lambda_permission,
    [
      stringAliasAttr(
        'action',
        'LambdaPermissionAction',
        'AT.LambdaPermissionAction'
      ),
      stringAttr('function_name'),
      stringAttr('principal'),
    ],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides a CloudWatch Event Rule resource.',
    'https://www.terraform.io/docs/providers/aws/r/cloudwatch_event_rule.html',
    cloudwatch_event_rule,
    [
      stringAttr('name'),
      stringAttr('schedule_expression'),
      stringAttr('description'),
    ],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides a CloudWatch Event Target resource.',
    'https://www.terraform.io/docs/providers/aws/r/cloudwatch_event_target.html',
    cloudwatch_event_target,
    [],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides a WAF Byte Match Set Resource',
    'https://www.terraform.io/docs/providers/aws/r/waf_byte_match_set.html',
    waf_byte_match_set,
    [resourceIdAttr('id', waf_byte_match_set)]
  );

  gen.generateResource(
    'Provides a WAF IPSet Resource',
    'https://www.terraform.io/docs/providers/aws/r/waf_ipset.html',
    waf_ipset,
    [resourceIdAttr('id', waf_ipset)],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides a WAF Regional Regex Match Set Resource',
    'https://www.terraform.io/docs/providers/aws/r/wafregional_regex_match_set.html',
    wafregional_regex_match_set,
    [resourceIdAttr('id', wafregional_regex_match_set)]
  );

  gen.generateResource(
    'Provides a WAF Regional Regex Pattern Set Resource',
    'https://www.terraform.io/docs/providers/aws/r/wafregional_regex_pattern_set.html',
    wafregional_regex_pattern_set,
    [resourceIdAttr('id', wafregional_regex_pattern_set)]
  );

  gen.generateResource(
    'Provides a WAF Regional IPSet Resource for use with Application Load Balancer.',
    'https://www.terraform.io/docs/providers/aws/r/wafregional_ipset.html',
    wafregional_ipset,
    [resourceIdAttr('id', wafregional_ipset)],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides an WAF Regional Rule Resource for use with Application Load Balancer.',
    'https://www.terraform.io/docs/providers/aws/r/wafregional_rule.html',
    wafregional_rule,
    [resourceIdAttr('id', wafregional_rule)]
  );

  gen.generateResource(
    'Provides a WAF Regional Web ACL Resource for use with Application Load Balancer.',
    'https://www.terraform.io/docs/providers/aws/r/wafregional_web_acl.html',
    wafregional_web_acl,
    [resourceIdAttr('id', wafregional_web_acl)]
  );

  gen.generateResource(
    'Provides a resource to create an association between a WAF Regional WebACL and Application Load Balancer.',
    'https://www.terraform.io/docs/providers/aws/r/wafregional_web_acl_association.html',
    wafregional_web_acl_association,
    [resourceIdAttr('id', wafregional_web_acl_association)]
  );

  gen.generateResource(
    'Provides a resource to manage AWS Secrets Manager secret metadata.',
    'https://www.terraform.io/docs/providers/aws/r/secretsmanager_secret.html',
    secretsmanager_secret,
    [resourceIdAttr('id', secretsmanager_secret)],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides a resource to manage AWS Secrets Manager secret version including its secret value.',
    'https://www.terraform.io/docs/providers/aws/r/secretsmanager_secret_version.html',
    secretsmanager_secret_version,
    [resourceIdAttr('id', secretsmanager_secret)],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Creates an Amazon CloudFront web distribution.',
    'https://www.terraform.io/docs/providers/aws/r/cloudfront_distribution.html',
    cloudfront_distribution,
    [
      resourceIdAttr('id', cloudfront_distribution),
      stringAttr('domain_name'),
      stringAliasAttr('hosted_zone_id', 'HostedZoneId', 'AT.HostedZoneId'),
    ],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides an API Gateway REST API.',
    'https://www.terraform.io/docs/providers/aws/r/api_gateway_rest_api.html',
    api_gateway_rest_api,
    [
      resourceIdAttr('id', api_gateway_rest_api),
      resourceIdAttr('root_resource_id', api_gateway_rest_api),
    ]
  );

  gen.generateResource(
    'Provides an API Gateway Resource.',
    'https://www.terraform.io/docs/providers/aws/r/api_gateway_resource.html',
    api_gateway_resource,
    [resourceIdAttr('id', api_gateway_resource), stringAttr('path')]
  );

  gen.generateResource(
    'Provides a HTTP Method for an API Gateway Resource.',
    'https://www.terraform.io/docs/providers/aws/r/api_gateway_method.html',
    api_gateway_method,
    []
  );

  gen.generateResource(
    'Provides an HTTP Method Response for an API Gateway Resource.',
    'https://www.terraform.io/docs/providers/aws/r/api_gateway_method_response.html',
    api_gateway_method_response,
    []
  );

  gen.generateResource(
    'Provides an HTTP Method Integration for an API Gateway Integration.',
    'https://www.terraform.io/docs/providers/aws/r/api_gateway_integration.html',
    api_gateway_integration,
    []
  );

  gen.generateResource(
    'Provides an HTTP Method Integration Response for an API Gateway Resource.',
    'https://www.terraform.io/docs/providers/aws/r/api_gateway_integration_response.html',
    api_gateway_integration_response,
    []
  );

  gen.generateResource(
    'Provides an API Gateway Deployment.',
    'https://www.terraform.io/docs/providers/aws/r/api_gateway_deployment.html',
    api_gateway_deployment,
    [
      resourceIdAttr('id', api_gateway_deployment),
      stringAttr('invoke_url'),
      stringAliasAttr('execution_arn', 'Arn', 'AT.Arn'),
    ]
  );

  gen.generateResource(
    'Registers a custom domain name for use with AWS API Gateway.',
    'https://www.terraform.io/docs/providers/aws/r/api_gateway_domain_name.html',
    api_gateway_domain_name,
    [
      resourceIdAttr('id', api_gateway_domain_name),
      stringAttr('cloudfront_domain_name'),
      stringAliasAttr('cloudfront_zone_id', 'HostedZoneId', 'AT.HostedZoneId'),
    ]
  );

  gen.generateResource(
    'Connects a custom domain name registered via aws_api_gateway_domain_name with a deployed API',
    'https://www.terraform.io/docs/providers/aws/r/api_gateway_base_path_mapping.html',
    api_gateway_base_path_mapping,
    []
  );

  gen.generateResource(
    'Manages a S3 Bucket Notification Configuration.',
    'https://www.terraform.io/docs/providers/aws/r/s3_bucket_notification.html',
    s3_bucket_notification,
    []
  );

  gen.generateResource(
    'Provides a Cognito User Pool resource.',
    'https://www.terraform.io/docs/providers/aws/r/cognito_user_pool.html',
    cognito_user_pool,
    [resourceIdAttr('id', cognito_user_pool), stringAttr('endpoint')],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides a Cognito User Pool Client resource.',
    'https://www.terraform.io/docs/providers/aws/r/cognito_user_pool_client.html',
    cognito_user_pool_client,
    [resourceIdAttr('id', cognito_user_pool), stringAttr('client_secret')],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides a Cognito User Pool Domain resource.',
    'https://www.terraform.io/docs/providers/aws/r/cognito_user_pool_domain.html',
    cognito_user_pool_domain,
    []
  );

  gen.generateResource(
    'Provides an AWS Cognito Identity Pool.',
    'https://www.terraform.io/docs/providers/aws/r/cognito_identity_pool.html',
    cognito_identity_pool,
    [resourceIdAttr('id', cognito_identity_pool)],
    {
      arn: true,
    }
  );

  gen.generateResource(
    'Provides an AWS Cognito Identity Pool Roles Attachment.',
    'https://www.terraform.io/docs/providers/aws/r/cognito_identity_pool_roles_attachment.html',
    cognito_identity_pool_roles_attachment,
    []
  );

  gen.generateResource(
    'Manages an EKS Cluster.',
    'https://www.terraform.io/docs/providers/aws/r/eks_cluster.html',
    eks_cluster,
    [
      resourceIdAttr('id', eks_cluster),
      stringAttr('endpoint'),
      stringAttr('platform_version'),
      stringAttr('status'),
      stringAttr('version'),
      stringAttr('certificate_authority'),
    ],
    {
      arn: true,
    }
  );

  // Generate all of the parameter structures
  gen.generateParams(autoscaling_group_tag);
  gen.generateParams(autoscaling_group);
  gen.generateParams(autoscaling_schedule);
  gen.generateParams(autoscaling_attachment);

  gen.generateParams(instance_root_block_device);
  gen.generateParams(instance);
  gen.generateParams(db_instance);
  gen.generateParams(db_parameter_group);
  gen.generateParams(db_parameter_group_parameter);
  gen.generateParams(eip);
  gen.generateParams(vpc);
  gen.generateParams(default_vpc);
  gen.generateParams(subnet);
  gen.generateParams(default_subnet);
  gen.generateParams(security_group);
  gen.generateParams(security_group_rule);
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
  gen.generateParams(website);
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
  gen.generateParams(iam_policy);
  gen.generateParams(iam_role_policy_attachment);
  gen.generateParams(sqs_queue);
  gen.generateParams(sqs_queue_policy);
  gen.generateParams(lb);
  gen.generateParams(lb_access_logs);
  gen.generateParams(lb_subnet_mapping);
  gen.generateParams(lb_listener);
  gen.generateParams(lb_listener_action);
  gen.generateParams(lb_listener_action_redirect);
  gen.generateParams(lb_listener_action_fixed_response);
  gen.generateParams(lb_target_group);
  gen.generateParams(lb_target_group_health_check);
  gen.generateParams(lb_target_group_stickiness);
  gen.generateParams(lb_target_group_attachment);
  gen.generateParams(lb_listener_rule);
  gen.generateParams(lb_listener_rule_values);
  gen.generateParams(lb_listener_rule_condition);
  gen.generateParams(cloudwatch_log_group);
  gen.generateParams(aws_provider);
  gen.generateParams(elasticsearch_domain);
  gen.generateParams(elasticsearch_domain_cluster_config);
  gen.generateParams(elasticsearch_domain_ebs_options);
  gen.generateParams(elasticsearch_domain_snapshot_options);
  gen.generateParams(elasticsearch_domain_vpc_options);
  gen.generateParams(elasticsearch_domain_cognito_options);
  gen.generateParams(elasticsearch_domain_policy);
  gen.generateParams(acm_certificate);
  gen.generateParams(acm_certificate_validation);
  gen.generateParams(lb_listener_certificate);
  gen.generateParams(launch_configuration);
  gen.generateParams(cloudwatch_logging_options);
  gen.generateParams(extended_s3_configuration);
  gen.generateParams(kinesis_firehose_delivery_stream);
  gen.generateParams(s3_bucket_metric);
  gen.generateParams(elasticache_parameter_group);
  gen.generateParams(elasticache_subnet_group);
  gen.generateParams(elasticache_cluster);
  gen.generateParams(vpc_config);
  gen.generateParams(lambda_function);
  gen.generateParams(lambda_function_environment);
  gen.generateParams(lambda_permission);
  gen.generateParams(cloudwatch_event_rule);
  gen.generateParams(cloudwatch_event_target);
  gen.generateParams(field_to_match);
  gen.generateParams(byte_match_tuples);
  gen.generateParams(waf_byte_match_set);
  gen.generateParams(ip_set_descriptors);
  gen.generateParams(waf_ipset);
  gen.generateParams(wafregional_regex_pattern_set);
  gen.generateParams(regex_match_tuple);
  gen.generateParams(wafregional_regex_match_set);
  gen.generateParams(wafregional_ipset);
  gen.generateParams(predicate);
  gen.generateParams(wafregional_rule);
  gen.generateParams(action);
  gen.generateParams(rule);
  gen.generateParams(wafregional_web_acl);
  gen.generateParams(wafregional_web_acl_association);
  gen.generateParams(secretsmanager_secret);
  gen.generateParams(secretsmanager_secret_version);
  gen.generateParams(cloudfront_cookies);
  gen.generateParams(cloudfront_custom_origin_config);
  gen.generateParams(cloudfront_custom_error_response);
  gen.generateParams(cloudfront_cache_behavior);
  gen.generateParams(cloudfront_distribution);
  gen.generateParams(cloudfront_forwarded_values);
  gen.generateParams(cloudfront_origin);
  gen.generateParams(cloudfront_geo_restrictions);
  gen.generateParams(cloudfront_restrictions);
  gen.generateParams(cloudfront_s3_origin_config);
  gen.generateParams(cloudfront_viewer_certificate);
  gen.generateParams(api_gateway_rest_api);
  gen.generateParams(api_gateway_resource);
  gen.generateParams(api_gateway_method);
  gen.generateParams(api_gateway_method_response);
  gen.generateParams(api_gateway_integration);
  gen.generateParams(api_gateway_integration_response);
  gen.generateParams(api_gateway_deployment);
  gen.generateParams(api_gateway_domain_name);
  gen.generateParams(api_gateway_base_path_mapping);
  gen.generateParams(s3_bucket_notification_queue);
  gen.generateParams(s3_bucket_notification_lambda);
  gen.generateParams(s3_bucket_notification);
  gen.generateParams(cognito_invite_message_template);
  gen.generateParams(cognito_admin_create_users);
  gen.generateParams(cognito_schema_attributes);
  gen.generateParams(cognito_schema_string_attribute_constraints),
    gen.generateParams(cognito_schema_number_attribute_constraints),
    gen.generateParams(cognito_user_pool);
  gen.generateParams(cognito_user_pool_client);
  gen.generateParams(cognito_user_pool_domain);
  gen.generateParams(cognito_identity_provider);
  gen.generateParams(cognito_identity_pool);
  gen.generateParams(cognito_identity_pool_roles_attachment);
  gen.generateParams(cognito_identity_pool_roles_attachment_roles);
  gen.generateParams(eks_cluster);
  gen.generateParams(eks_cluster_vpc_config);

  autoscaling_policy(gen);
}

function generateRandom(gen: Generator) {
  const random_string: RecordDecl = {
    name: 'string',
    fields: [requiredField('length', NUMBER)],
  };

  gen.generateResource(
    'The resource random_string generates a random permutation of alphanumeric characters and optionally special characters.',
    'https://www.terraform.io/docs/providers/random/r/string.html',
    random_string,
    [stringAttr('result')]
  );

  gen.generateParams(random_string);
}

function main() {
  {
    const gen = fileGenerator('aws', [
      '/** Automatically @' + 'generated by gen-providers.ts, DO NOT EDIT */',
      '',
      'imp' + 'ort * as _ from "lodash";',
      'imp' + 'ort * as AT from "./types";',
      'imp' + 'ort * as TF from "../../core/core";',
      '',
    ]);
    generateAws(gen);
    gen.writeFile(path.join(__dirname, '..', 'providers', 'aws/resources.ts'));
  }

  {
    const gen = fileGenerator(
      'random',
      [
        '/** Automatically @' + 'generated by gen-providers.ts, DO NOT EDIT */',
        '',
        'imp' + 'ort * as _ from "lodash";',
        'imp' + 'ort * as TF from "../../core/core";',
        '',
      ],
      true
    );
    generateRandom(gen);
    gen.writeFile(
      path.join(__dirname, '..', 'providers', 'random/resources.ts')
    );
  }
}

main();
