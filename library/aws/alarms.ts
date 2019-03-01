import * as TF from '../../core/core';
import * as AT from '../../providers/aws/types';
import * as AR from '../../providers/aws/resources';

import { SharedResources } from './shared';

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
  target_group: AR.LbTargetGroup
) {
  createScalingHighCpuAlarm(tfgen, sr.alarm_topic, autoscaling_group);
  createScalingLowHostsAlarm(
    tfgen,
    sr.alarm_topic,
    load_balancer,
    target_group,
    3
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
 *  Create alarm resources on the given RDS instance suitable for use in a UAT environment
 */
export function createProdDbAlarms(
  tfgen: TF.Generator,
  sr: SharedResources,
  db: AR.DbInstance
) {
  createHighDbCpuAlarm(tfgen, sr.alert_topic, db);
  createLowDbSpaceAlarm(tfgen, sr.alert_topic, db);
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
    evaluation_periods: 4,
    metric_name: 'CPUUtilization',
    namespace: 'AWS/EC2',
    period: 300,
    statistic: 'Average',
    threshold: 90,
    dimensions: {
      AutoscalingGroupName: autoscaling_group.name,
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
      LoadBalancer: load_balancer.arn.value,
      TargetGroup: target_group.arn.value,
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
