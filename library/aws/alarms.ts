import * as TF from '../../core/core.ts';
import * as AR from '../../providers/aws/resources.ts';
import { Customize } from "../util.ts";
import { CloudwatchMetricAlarmParams } from "../../providers/aws/resources.ts";

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

export function createScalingAlarms(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  autoscaling_group: AR.AutoscalingGroup,
  load_balancer: AR.Lb,
  target_group: AR.LbTargetGroup,
  hosts_alarm_threshold: number = 3
) {
  createScalingHighCpuAlarm(tfgen, topic, autoscaling_group);
  createScalingHighMemAlarm(tfgen, topic, 'Maximum', 90, autoscaling_group);
  createScalingHighMemAlarm(tfgen, topic, 'Average', 70, autoscaling_group);
  createScalingLowHostsAlarm(
    tfgen,
    topic,
    load_balancer,
    target_group,
    hosts_alarm_threshold
  );
}

/**
 *  Create alarm resources on the given EC2 instance
 */
export function createEc2Alarms(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  ec2: AR.Instance,
  filesystem: AlarmRootFilesystem
) {
  createEc2HighCpuAlarm(tfgen, topic, ec2);
  createEc2HighDiskAlarm(tfgen, topic, ec2, filesystem);
  createEc2HighMemAlarm(tfgen, topic, ec2);
  createEc2CheckFailureAlarm(tfgen, topic, ec2);
}

/**
 *  Create alarm resources on the given RDS instance
 */
export function createDbAlarms(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  db: AR.DbInstance,
  customizeDbSpaceAlarm?: Customize<CloudwatchMetricAlarmParams>
) {
  createHighDbCpuAlarm(tfgen, topic, db);
  createLowDbSpaceAlarm(tfgen, topic, db, customizeDbSpaceAlarm);
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

export function createScalingHighMemAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  statistic: 'SampleCount' | 'Average' | 'Sum' | 'Minimum' | 'Maximum',
  threshold: number,
  autoscaling_group: AR.AutoscalingGroup
) {
  // Assumes an autoscaling group won't be used with an ec2 instance on the same namespace
  const name = 'highmem_' + statistic.toLowerCase();
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    statistic,
    threshold,
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator: 'GreaterThanThreshold',
    evaluation_periods: 4,
    metric_name: 'MemoryUtilization',
    namespace: 'System/Linux',
    period: 300,
    dimensions: {
      AutoScalingGroupName: autoscaling_group.name,
    },
    alarm_description:
      'Sustained high memory ' + statistic + ' across an autoscaling group',
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
        `replace("${
          load_balancer.arn.value
        }", "/arn:aws:elasticloadbalancing:([^:]*:)*loadbalancer[/]/", "")`
      ),
      TargetGroup: TF.rawExpr(
        `replace("${
          target_group.arn.value
        }", "/arn:aws:elasticloadbalancing:([^:]*:)*/", "")`
      ),
    },
    alarm_description: 'Less than configured hosts across an autoscaling group',
    alarm_actions: [topic.arn],
  });
}

export function createScalingStatusCheckFailedAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  autoscaling_group: AR.AutoscalingGroup
) {
  const name = 'status-check-failed';
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator: 'GreaterThanOrEqualToThreshold',
    evaluation_periods: 1,
    metric_name: 'StatusCheckFailed',
    namespace: 'AWS/EC2',
    period: 120,
    statistic: 'Maximum',
    threshold: 1,
    dimensions: {
      AutoScalingGroupName: autoscaling_group.name,
    },
    alarm_description: 'Sustained status check failed across an autoscaling group',
    alarm_actions: [topic.arn],
  });
}

export type AlarmRootFilesystem = `/dev/${string}`;

/**
 * Create a cloudwatch alarm for excessive disk usage on an
 * EC2 instances root disk. This relies on the AWS
 * CloudWatchMonitoringScripts on the machine to have generated
 * the metrics.
 *
 * The filessystem parameter must be set appropriately for the
 * instance type. Older types seem to need /dev/xvda1, newer have
 * needed /dev/nvme0n1p1.
 *
 * If in doubt, login to the machine and run df to determin the
 * correct value
 */
export function createEc2HighDiskAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  ec2: AR.Instance,
  filesystem: AlarmRootFilesystem
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
      Filesystem: filesystem,
      MountPath: '/',
    },
    alarm_description: `Sustained high disk usage for ${tfgen.nameContext().join('_')}`,
    alarm_actions: [topic.arn],
  });
}

export function createEc2HighCpuAlarm(
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
    alarm_description: `Sustained high cpu usage for ${tfgen.nameContext().join('_')}`,
    alarm_actions: [topic.arn],
  });
}

/**
 * Create a cloudwatch alarm for excessive memory usage on an
 * EC2 instance. This relies on the AWS CloudWatchMonitoringScripts
 * on the machine to have generated the metrics.
 *
 */
export function createEc2HighMemAlarm(
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
    alarm_description: `Sustained high memory for ${tfgen.nameContext().join('_')}`,
    alarm_actions: [topic.arn],
  });
}

export function createEc2StatusCheckFailureAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  ec2: AR.Instance,
) {
  const name = 'check-failure';
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator: 'GreaterThanOrEqualToThreshold',
    evaluation_periods: 1,
    metric_name: 'StatusCheckFailed',
    namespace: 'AWS/EC2',
    period: 120,
    statistic: 'Maximum',
    threshold: 1,
    dimensions: {
      InstanceId: ec2.id.value,
    },
    alarm_description: `Sustained status check failures for ${tfgen.nameContext().join('_')}`,
    alarm_actions: [topic.arn],
  });
}

export function createLowDbSpaceAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  db: AR.DbInstance,
  customize?: Customize<CloudwatchMetricAlarmParams>
) {
  const name = 'lowdbspace';
  const params: CloudwatchMetricAlarmParams = {
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
  };
  if (customize) {
    customize(params);
  }
  return AR.createCloudwatchMetricAlarm(tfgen, name, params);
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
  maxlength: number,
  customize?: Customize<AR.CloudwatchMetricAlarmParams>
) {
  const name = 'queuelength';
  const params: AR.CloudwatchMetricAlarmParams = {
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
  };
  if (customize) {
    customize(params);
  }
  return AR.createCloudwatchMetricAlarm(tfgen, name, params);
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
  Filesystem: string, // linux filesystem as seen by the instances (todo: how to automate this for different types of instances and storage devices?)
  threshold: number = 50, // threshold on DiskSpaceUtilization (%)
  MountPath: string = '/',
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
      Filesystem, // custom to what the processor instances actually have in use depending on instance type/storage type - todo: how to figure it out?
      MountPath,
      AutoScalingGroupName: autoscaling_group.name,
    },
    alarm_description: 'High disk utilisation across the autoscaling group',
    alarm_actions: [topic.arn],
  });
}

export function createAutoScaleGroupActiveInstancesAlarm(
  tfgen: TF.Generator,
  topic: AR.SnsTopic,
  autoscaling_group: AR.AutoscalingGroup,
  comparison_operator: CloudwatchMetricAlarmParams['comparison_operator'],
  threshold: number,
  period: number = 1,
  // MountPath: string = "/",
  evaluation_periods: number = 2,
  name = 'active_instances',
) {
  // Assumes an autoscaling group won't be used with an ec2 instance on the same namespace
  return AR.createCloudwatchMetricAlarm(tfgen, name, {
    evaluation_periods,
    period,
    threshold,
    alarm_name: tfgen.scopedName(name).join('_'),
    comparison_operator,
    metric_name: 'GroupInServiceInstances',
    namespace: 'AWS/AutoScaling',
    statistic: 'Average',
    datapoints_to_alarm: evaluation_periods,
    dimensions: {
      AutoScalingGroupName: autoscaling_group.name,
    },

    alarm_description: 'Maximum sustained number of instances across the autoscaling group',
    alarm_actions: [topic.arn],
  });
}
