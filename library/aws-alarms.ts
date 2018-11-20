import * as TF from '../core/core';
import * as AT from '../providers/aws-types';
import * as AR from '../providers/aws-resources';

import { SharedResources } from './aws-shared';

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
