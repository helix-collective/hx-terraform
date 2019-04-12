import * as TF from '../../core/core';
import * as AR from '../../providers/aws/resources';
import * as AT from '../../providers/aws/types';
import * as aws from './aws';
import * as util from '../util';

import * as secrets from "./secrets";
import { SharedResources } from './shared';
import * as policies from "./policies";
import * as roles from "./roles";
import { createLambdaFunctionInVpc } from './lambdas';


/**
 * A simple periodic schedule.
 */
export interface RateScheduleType {
  kind: 'rate',
  period: number,
  period_units: 'minutes' | 'hours' | 'days'
};

/**
 * A cron style schedule. See 
 *   https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html
 * for details of the possible field values.
 */
export interface CronScheduleType {
  kind: 'cron',
  fields: string
};

/** 
 * A ScheduleItem specifies a regular post request to a given URL
 */
export interface ScheduleItem {
  name: string;
  url: string;
  schedule: ScheduleType;
};

export type ScheduleType =  RateScheduleType | CronScheduleType;


export interface CronWebhooksParams {
  schedule_items: ScheduleItem[]
};

export interface CronWebhooks {
  shared_secret: AR.SecretsmanagerSecret,
}

/**
 * 
 * Constructs AWS resources required to hit a set of endpoints periodically
 */
export function createCronWebhooks(tfgen: TF.Generator, name: string, sr: SharedResources, params: CronWebhooksParams ): CronWebhooks {

  // Construct a shared secret in order that periodic webhook consumers
  // can validate that the requests actually originated from the periodic system. 
  const shared_secret = secrets.createRandomJsonSecret(tfgen, name, sr, {});

  // Construct a lambda function that will be called at each periodic event. It needs
  // a role to be able to write logs and access the shared secret.
  const role = roles.createIamRoleWithPolicies(tfgen, name, [
    policies.lambda_in_vpc_policy,
    policies.putAnyLogsPolicy("lambdalogs"),
    policies.secretReadOnlyPolicy("secretro", shared_secret.arn),
  ]);

  // A memcached elasticcache cluster for caching location and useragent details
    // deployed on the vpc private subnets
    const port = 11211;
    const ecachesubnets = AR.createElasticacheSubnetGroup(tfgen, "ec", {
        name: tfgen.scopedName("ec").join("-"),
        subnet_ids: sr.network.azs.map(az => az.internal_subnet.id),
    });
    const sg = aws.createSecurityGroupInVpc(tfgen, "ec", sr, {
        ingress: [util.ingressOnPort(port)],
        egress: [util.egress_all]
        });
    const ecache = AR.createElasticacheCluster(tfgen, "ec", {
        port,
        cluster_id: tfgen.scopedName("ec").join("-"),
        engine: "memcached",
        node_type: AT.cache_t2_small,
        num_cache_nodes: 1,
        parameter_group_name: AT.elasticacheParameterGroupName("default.memcached1.5"),
        subnet_group_name: ecachesubnets.name,
        security_group_ids: [sg.id],
        tags: tfgen.tagsContext()
    });


  // The python lambda function will have already been packed (by doit) into
  // the zipfile before terraform is run. (The lambda function will be updated
  // whenever the hash of the zipfile changes).
  const runtime: AT.LambdaRuntime = AT.python_3_7;
  const handler: string = "post_cron_webhook.post_cron_webhook";
  const zipfile: string = '../build/lambdas/post_cron_webhook.zip';

  const lambda = createLambdaFunctionInVpc(tfgen, name, sr, {
    runtime,
    handler,
    role_arn: role.arn,
    invoke_principal: "apigateway.amazonaws.com",
    customize: lp => {
      lp.function_name = tfgen.scopedName(name).join("_");
      lp.filename = zipfile;
      lp.source_code_hash = TF.rawExpr(`"\${base64sha256(file("${zipfile}"))}"`);
      lp.environment = {
        variables: {
          "ECACHE_ENDPOINT": ecache.configuration_endpoint
        }
      };
    },
  })

  // Setup cloudwatch to call the lambda function for each scheduled item
  params.schedule_items.forEach( item => {
    const resourceName = `${name}_${item.name}`;
    const event_rule = AR.createCloudwatchEventRule(tfgen, resourceName, {
      name: tfgen.scopedName(resourceName).join("_"),
      schedule_expression: scheduleExpression(item.schedule)
    });

    AR.createCloudwatchEventTarget(tfgen, resourceName, {
        rule: event_rule.name,
        arn: lambda.arn,
        input: JSON.stringify({
          endpoint: item.url,
          shared_secret_arn: shared_secret.arn.value,
        })
    });

    AR.createLambdaPermission(tfgen, resourceName, {
      action: AT.lambda_InvokeFunction,
      function_name: lambda.function_name,
      principal: "events.amazonaws.com",
      source_arn: event_rule.arn
    });
  });

  return {shared_secret};
}

/**
 * Helper function to format a ScheduleType as an AWS string.
 */
export function scheduleExpression(schedule_type: ScheduleType): string {
  switch (schedule_type.kind) {
  case 'rate':
    return `rate(${schedule_type.period} ${schedule_type.period_units})`;
  case 'cron':
    return `cron(${schedule_type.fields})`; 
  };
}