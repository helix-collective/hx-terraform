import * as AR from '../../providers/aws/resources.ts';
import { ArnSecret } from './secrets.ts';
import {assumeServiceRole, autoscalingGroupEnableSetInstanceProtection as autoscalingGroupEnableSetInstanceProtectionStatements, ecrModifyAll, ecrReadonly, edModify, firehosePutRecord, lambdaInVpc, NamedPolicy, newNamedPolicy, publishMetrics, putLogs, putAnyLogs, route53ModifyZone, s3ModifyBuckets, s3PublicReadonly, s3ReadonlyBuckets, secretReadOnly, sesAllActions, snsFullAccess, snsPostSms, sqsQueueModify, Statement} from './policies_v2.ts';
export type { NamedPolicy, Statement } from './policies_v2.ts';

/** 
 * Legacy functions to create s3 policies.
 * The preferred approach is to use the functions in policies_v2 to construct statements,
 * and compose them as required into policies.
 */

export const assume_role_policy = newNamedPolicy('assumerole', [
    ...assumeServiceRole("ec2.amazonaws.com"),
    ...assumeServiceRole("lambda.amazonaws.com"),
    ...assumeServiceRole("firehose.amazonaws.com"),
    ...assumeServiceRole("apigateway.amazonaws.com"),
]);

export const publish_metrics_policy = newNamedPolicy('publishmetrics', [
  ...publishMetrics()
]);

export function s3ReadonlyPolicy(name: string, bucket: string, key_prefix: string = '*') {
  return s3ReadonlyPolicyMultipleBuckets(name, [bucket], key_prefix)
}

export function s3ReadonlyPolicyMultipleBuckets(name: string, buckets: string[], key_prefix: string = '*') {
  return newNamedPolicy(name, s3ReadonlyBuckets(buckets, key_prefix));
}

export function s3PublicReadonlyPolicy(name: string, bucket: string, key_prefix: string = '*') {
  return newNamedPolicy(name, s3PublicReadonly(bucket, key_prefix));
}

export function s3ModifyPolicy(name: string, bucket: string, key_prefix: string = '*') {
  return s3ModifyPolicyMultipleBuckets(name, [bucket], key_prefix)
}

export function s3ModifyPolicyMultipleBuckets(name: string, buckets: string[], key_prefix: string = '*') {
  return newNamedPolicy(name, s3ModifyBuckets(buckets, key_prefix));
}

export function putLogsPolicy(name: string, log_group: AR.CloudwatchLogGroup) {
  return newNamedPolicy(name, putLogs(log_group));
}

export function putAnyLogsPolicy(name: string) {
  return newNamedPolicy(name, putAnyLogs());
}

export function route53ModifyZonePolicy(
  name: string,
  zone: AR.Route53Zone
): NamedPolicy {
  return newNamedPolicy(name, route53ModifyZone(zone));
}

export function sqsQueueModifyPolicy(
  name: string,
  queue: AR.SqsQueue
): NamedPolicy {
  return newNamedPolicy(name, sqsQueueModify(queue));
}

export const ecr_readonly_policy: NamedPolicy = newNamedPolicy(
  'ecrreadonly',
  ecrReadonly()
);

export const ecr_modify_all_policy: NamedPolicy = 
newNamedPolicy(
  'ecrmodifyall',
  ecrModifyAll()
);

export const lambda_in_vpc_policy: NamedPolicy = newNamedPolicy(
  'vpclambda',
  lambdaInVpc()
);

export function edModifyPolicy(
  name: string,
  esdomain: AR.ElasticsearchDomain
): NamedPolicy {
  return newNamedPolicy(name, edModify(esdomain));
}

export function secretReadOnlyPolicy(
  name: string,
  arn: ArnSecret
): NamedPolicy {
  return newNamedPolicy(name, [
    ...secretReadOnly(arn),
  ]);
}

export const ses_all_actions_policy: NamedPolicy =  newNamedPolicy(
  'ses_full_access',
  sesAllActions()
);

export function firehosePutRecordPolicy(
  name: string,
  stream: AR.KinesisFirehoseDeliveryStream
): NamedPolicy {
  return newNamedPolicy(name, firehosePutRecord(stream));
}

export function autoscalingGroupEnableSetInstanceProtection(
  name: string,
  Resource: string
) {
  return newNamedPolicy(name, autoscalingGroupEnableSetInstanceProtectionStatements(Resource));
}

/**
 * Allow sending of SMS, but not sns messages to topics, etc.
 *
 * https://stackoverflow.com/questions/38871201/authorization-when-sending-a-text-message-using-amazonsnsclient
 */
export const snsPostSmsPolicy: NamedPolicy = newNamedPolicy(
  'snspostsms',
  snsPostSms()
);

/**
 * Full access to SNS
 */
export const snsFullAccessPolicy: NamedPolicy =  newNamedPolicy(
  'snsfullaccess',
  snsFullAccess()
);
