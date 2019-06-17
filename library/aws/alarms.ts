import * as TF from '../../core/core';
import * as AT from '../../providers/aws/types';
import * as AR from '../../providers/aws/resources';

import { SharedResources } from './shared';

// How to prepare alarms:
//    Use AWS console cloudwatch metrics to browse through metrics and pick instances/auto scale groups etc
//    The metric should be able to be plotted before creating a new alarm for it.
//
//    Use "Source" tab to preview the json source of the metric.
//    "metrics": [
//      [ "System/Linux", "DiskSpaceUtilization", "MountPath", "/", "Filesystem", "/dev/nvme0n1p1"]
//    ]
//    The 'dimensions' parameter in CloudwatchMetricAlarmParams is a map and the "metrics" array in the source is a list that alternates keys/values
//    (except dimensions for "namespace" and "metric_name" are done separately)
//
//  After creating - ensure that the alarm does not stay in state INSUFFICIENT_DATA for longer than reasonable.

export function createUatScalingAlarms(
  tfgen: TF.Generator,
  sr: SharedResources,
  autoscaling_group: AR.AutoscalingGroup,
  load_balancer: AR.Lb,
  target_group: AR.LbTargetGroup,
  hosts_alarm_threshold: number = 3
) {
  createScalingHighCpuAlarm(tfgen, sr.alert_topic, autoscaling_group);
  createScalingLowHostsAlarm(
    tfgen,
    sr.alert_topic,
    load_balancer,
    target_group,
    hosts_alarm_threshold
  );
}

export function createProdScalingAlarms(
  tfgen: TF.Generator,
  sr: SharedResources,
  autoscaling_group: AR.AutoscalingGroup,
  load_balancer: AR.Lb,
  target_group: AR.LbTargetGroup,
  hosts_alarm_threshold: number = 3
) {
  createScalingHighCpuAlarm(tfgen, sr.alarm_topic, autoscaling_group);
  createScalingLowHostsAlarm(
    tfgen,
    sr.alarm_topic,
    load_balancer,
    target_group,
    hosts_alarm_threshold
  );
}

/**
 *  Create alarm resources on the given EC2 instance suitable for use in a Prod environment
 */
export function createProdAlarms(
  tfgen: TF.Generator,
  sr: SharedResources,
  ec2: AR.Instance
) {
  createHighCpuAlarm(tfgen, sr.alarm_topic, ec2);
  createHighDiskAlarm(tfgen, sr.alarm_topic, ec2);
  createHighMemAlarm(tfgen, sr.alarm_topic, ec2);
}

/**
 *  Create alarm resources on the given EC2 instance suitable for use in a UAT environment
 */
export function createUatAlarms(
  tfgen: TF.Generator,
  sr: SharedResources,
  ec2: AR.Instance
) {
  createHighCpuAlarm(tfgen, sr.alert_topic, ec2);
  createHighDiskAlarm(tfgen, sr.alert_topic, ec2);
  createHighMemAlarm(tfgen, sr.alert_topic, ec2);
}

/**
 *  Create alarm resources on the given RDS instance suitable for use in a Prod environment
 */
export function createProdDbAlarms(
  tfgen: TF.Generator,
  sr: SharedResources,
  db: AR.DbInstance
) {
  createHighDbCpuAlarm(tfgen, sr.alarm_topic, db);
  createLowDbSpaceAlarm(tfgen, sr.alarm_topic, db);
}

/**
 *  Create alarm resources on the given RDS instance suitable for use in a UAT environment
 */
export function createUatDbAlarms(
  tfgen: TF.Generator,
  sr: SharedResources,
  db: AR.DbInstance
) {
  createHighDbCpuAlarm(tfgen, sr.alert_topic, db);
  createLowDbSpaceAlarm(tfgen, sr.alert_topic, db);
}

export function createScalingHighCpuAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  autoscaling_group: AR.AutoscalingGroup
) {
  // Assumes an autoscaling group won't be used with an ec2 instance on the same namespace
  const name = 'highcpu';
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator: 'GreaterThanThreshold',
    evaluation_periods: 2,
    metric_name: 'CPUUtilization',
    namespace: 'AWS/EC2',
    period: 120,
    statistic: 'Average',
    threshold: 90,
    dimensions: {
      AutoScalingGroupName: autoscaling_group.name,
    },
    alarm_description: 'Sustained high cpu usage across an autoscaling group',
    alarm_actions: [topic.arn],
  });
}

export function createScalingLowHostsAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  load_balancer: AR.Lb,
  target_group: AR.LbTargetGroup,
  hosts_threshold: number
) {
  const name = 'lowhosts';
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator: 'LessThanThreshold',
    evaluation_periods: 2,
    metric_name: 'HealthyHostCount',
    namespace: 'AWS/ApplicationELB',
    period: 120,
    statistic: 'Average',
    threshold: hosts_threshold,
    dimensions: {
      LoadBalancer: TF.rawExpr(
        `"\${replace("${
          load_balancer.arn.value
        }", "/arn:aws:elasticloadbalancing:([^:]*:)*loadbalancer[/]/", "")}"`
      ),
      TargetGroup: TF.rawExpr(
        `"\${replace("${
          target_group.arn.value
        }", "/arn:aws:elasticloadbalancing:([^:]*:)*/", "")}"`
      ),
    },
    alarm_description: 'Less than configured hosts across an autoscaling group',
    alarm_actions: [topic.arn],
  });
}

export function createHighDiskAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  ec2: AR.Instance
) {
  const name = 'highdisk';
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator: 'GreaterThanThreshold',
    evaluation_periods: 1,
    metric_name: 'DiskSpaceUtilization',
    namespace: 'System/Linux',
    period: 300,
    statistic: 'Average',
    threshold: 90,
    dimensions: {
      InstanceId: ec2.id.value,
      Filesystem: '/dev/xvda1',
      MountPath: '/',
    },
    alarm_description: 'Sustained high disk usage for application server',
    alarm_actions: [topic.arn],
  });
}

export function createHighCpuAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  ec2: AR.Instance
) {
  const name = 'highcpu';
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator: 'GreaterThanThreshold',
    evaluation_periods: 4,
    metric_name: 'CPUUtilization',
    namespace: 'AWS/EC2',
    period: 300,
    statistic: 'Average',
    threshold: 90,
    dimensions: {
      InstanceId: ec2.id.value,
    },
    alarm_description: 'Sustained high cpu usage for application server',
    alarm_actions: [topic.arn],
  });
}

export function createHighMemAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  ec2: AR.Instance
) {
  const name = 'highmem';
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator: 'GreaterThanThreshold',
    evaluation_periods: 4,
    metric_name: 'MemoryUtilization',
    namespace: 'System/Linux',
    period: 300,
    statistic: 'Average',
    threshold: 90,
    dimensions: {
      InstanceId: ec2.id.value,
    },
    alarm_description: 'Sustained high memory for application server',
    alarm_actions: [topic.arn],
  });
}

export function createLowDbSpaceAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  db: AR.DbInstance
) {
  const name = 'lowdbspace';
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator: 'LessThanThreshold',
    evaluation_periods: 1,
    metric_name: 'FreeStorageSpace',
    namespace: 'AWS/RDS',
    period: 300,
    statistic: 'Average',
    threshold: 1000000000,
    dimensions: {
      DBInstanceIdentifier: db.id.value,
    },
    alarm_description: 'Low free space in RDS db',
    alarm_actions: [topic.arn],
  });
}

export function createHighDbCpuAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  db: AR.DbInstance
) {
  const name = 'highdbcpu';
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator: 'GreaterThanThreshold',
    evaluation_periods: 4,
    metric_name: 'CPUUtilization',
    namespace: 'AWS/RDS',
    period: 300,
    statistic: 'Average',
    threshold: 90,
    dimensions: {
      DBInstanceIdentifier: db.id.value,
    },
    alarm_description: 'Sustained high cpu usage in RDS db',
    alarm_actions: [topic.arn],
  });
}

export function createQueueLengthAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  queue: AR.SqsQueue,
  maxlength: number
) {
  const name = 'queuelength';
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator: 'GreaterThanThreshold',
    evaluation_periods: 2,
    metric_name: 'ApproximateNumberOfMessagesVisible',
    namespace: 'AWS/SQS',
    period: 60,
    statistic: 'Average',
    threshold: maxlength,
    dimensions: {
      QueueName: queue.name,
    },
    alarm_description: `The sustained length of the message queue is greater than ${maxlength}`,
    alarm_actions: [topic.arn],
  });
}

export function createLambdaFunctionErrorAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  lambda: AR.LambdaFunction,
  name: string,
  maxErrorsPerMin: number,
  overNumMins: number
) {
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator: 'GreaterThanOrEqualToThreshold',
    evaluation_periods: overNumMins,
    metric_name: 'Errors',
    namespace: 'AWS/Lambda',
    period: 60,
    statistic: 'Sum',
    threshold: maxErrorsPerMin,
    dimensions: {
      FunctionName: lambda.function_name,
      Resource: lambda.function_name,
    },
    alarm_description: `More than ${maxErrorsPerMin} lambda invocations fail in ${overNumMins} minute(s)`,
    alarm_actions: [topic.arn],
  });
}

export function createAutoScaleGroupHighDiskAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  autoscaling_group: AR.AutoscalingGroup,
  Filesystem: string,        // linux filesystem as seen by the instances (todo: how to automate this for different types of instances and storage devices?)
  threshold: number = 50,    // threshold on DiskSpaceUtilization (%)
  MountPath: string = "/",
  evaluation_periods: number = 2,
  period: number = 120
) {
  // Assumes an autoscaling group won't be used with an ec2 instance on the same namespace
  const name = 'highdisk';
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    evaluation_periods,
    period,
    threshold,
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator: 'GreaterThanThreshold',
    metric_name: 'DiskSpaceUtilization',
    namespace: 'System/Linux',
    statistic: 'Average',
    dimensions: {
      Filesystem,   // custom to what the processor instances actually have in use depending on instance type/storage type - todo: how to figure it out?
      MountPath,
      AutoScalingGroupName: autoscaling_group.name,
    },
    alarm_description: 'High disk utilisation across the autoscaling group',
    alarm_actions: [topic.arn],
  });
}
