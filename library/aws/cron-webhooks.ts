import * as TF from '../../core/core';
import * as AR from '../../providers/aws/resources';
import * as AT from '../../providers/aws/types';

import * as secrets from './secrets';
import * as shared from './shared';
import * as policies from './policies';
import * as roles from './roles';

/**
 * A simple periodic schedule.
 */
export interface RateScheduleType {
  kind: 'rate';
  period: number;
  period_units: 'minutes' | 'hours' | 'days';
}

/**
 * A cron style schedule. See
 *   https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html
 * for details of the possible field values.
 */
export interface CronScheduleType {
  kind: 'cron';
  fields: string;
}

/**
 * A ScheduleItem specifies a regular post request to a given URL
 */
export interface ScheduleItem {
  name: string;
  url: string;
  schedule: ScheduleType;
}

export type ScheduleType = RateScheduleType | CronScheduleType;

export interface CronWebhooksParams {
  schedule_items: ScheduleItem[];
}

export interface CronWebhooks {
  shared_secret: AR.SecretsmanagerSecret;
}

/**
 *
 * Constructs AWS resources required to hit a set of endpoints periodically
 */
export function createCronWebhooks(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  params: CronWebhooksParams
): CronWebhooks {
  // Construct a shared secret in order that periodic webhook consumers
  // can validate that the requests actually originated from the periodic system.
  const shared_secret = secrets.createRandomJsonSecret(tfgen, name, sr, {});

  // Construct a lambda function that will be called at each periodic event. It needs
  // a role to be able to write logs and access the shared secret.
  const role = roles.createIamRoleWithPolicies(tfgen, name, [
    policies.putAnyLogsPolicy('lambdalogs'),
    policies.secretReadOnlyPolicy('secretro', shared_secret.arn),
  ]);

  // The python lambda function will have already been packed (by doit) into
  // the zipfile before terraform is run. (The lambda function will be updated
  // whenever the hash of the zipfile changes).
  const runtime: AT.LambdaRuntime = AT.python_3_7;
  const handler: string = 'post_cron_webhook.post_cron_webhook';
  const zipfile: string = '../build/lambdas/post_cron_webhook.zip';
  const lambda = AR.createLambdaFunction(tfgen, name, {
    runtime,
    handler,
    function_name: tfgen.scopedName(name).join('_'),
    role: role.arn,
    filename: zipfile,
    source_code_hash: TF.rawExpr(`"\${base64sha256(file("${zipfile}"))}"`),
    tags: tfgen.tagsContext(),
  });

  // Setup cloudwatch to call the lambda function for each scheduled item
  params.schedule_items.forEach(item => {
    const resourceName = `${name}_${item.name}`;
    const event_rule = AR.createCloudwatchEventRule(tfgen, resourceName, {
      name: tfgen.scopedName(resourceName).join('_'),
      schedule_expression: scheduleExpression(item.schedule),
    });

    AR.createCloudwatchEventTarget(tfgen, resourceName, {
      rule: event_rule.name,
      arn: lambda.arn,
      input: JSON.stringify({
        endpoint: item.url,
        shared_secret_arn: shared_secret.arn.value,
      }),
    });

    AR.createLambdaPermission(tfgen, resourceName, {
      action: AT.lambda_InvokeFunction,
      function_name: lambda.function_name,
      principal: 'events.amazonaws.com',
      source_arn: event_rule.arn,
    });
  });

  return { shared_secret };
}

/**
 * Helper function to format a ScheduleType as an AWS string.
 */
export function scheduleExpression(schedule_type: ScheduleType): string {
  switch (schedule_type.kind) {
    case 'rate':
      let period_units: string = schedule_type.period_units;
      if (schedule_type.period === 1 && period_units.endsWith('s')) {
        period_units = period_units.substr(0, period_units.length - 1);
      }
      return `rate(${schedule_type.period} ${period_units})`;
    case 'cron':
      return `cron(${schedule_type.fields})`;
  }
}
