import * as TF from '../../core/core';
import * as AR from '../../providers/aws/resources';

export interface NamedPolicy {
  name: string;
  policy: {};
}

export const assume_role_policy = {
  name: 'assumerole',
  policy: {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'sts:AssumeRole',
        Principal: { Service: 'ec2.amazonaws.com' },
        Effect: 'Allow',
        Sid: '',
      },
    ],
  },
};

export const assume_lambda_role_policy = {
  name: 'assumerole',
  policy: {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'sts:AssumeRole',
        Principal: { Service: 'lambda.amazonaws.com' },
        Effect: 'Allow',
        Sid: '',
      },
    ],
  },
};

export const assume_role_rds_monitoring_policy = {
  name: 'assumerole',
  policy: {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'sts:AssumeRole',
        Principal: { Service: 'monitoring.rds.amazonaws.com' },
        Effect: 'Allow',
        Sid: '',
      },
    ],
  },
}

export const publish_metrics_policy = {
  name: 'publishmetrics',
  policy: {
    Statement: [
      {
        Action: [
          'cloudwatch:GetMetricStatistics',
          'cloudwatch:ListMetrics',
          'cloudwatch:PutMetricData',
          'ec2:DescribeTags',
        ],
        Effect: 'Allow',
        Resource: '*',
      },
    ],
  },
};

export function s3ReadonlyPolicy(name: string, bucket: string) {
  return {
    name,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['s3:ListBucket'],
          Resource: [`arn:aws:s3:::${bucket}`],
        },
        {
          Action: ['s3:GetObject'],
          Effect: 'Allow',
          Resource: [`arn:aws:s3:::${bucket}/*`],
        },
      ],
    },
  };
}

export function s3PublicReadonlyPolicy(name: string, bucket: string) {
  return {
    name,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: ['s3:GetObject'],
          Effect: 'Allow',
          Principal: '*',
          Resource: [`arn:aws:s3:::${bucket}/*`],
        },
      ],
    },
  };
}

export function s3ModifyPolicy(name: string, bucket: string) {
  return {
    name,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['s3:ListBucket'],
          Resource: [`arn:aws:s3:::${bucket}`],
          Principal: '*',
        },
        {
          Action: [
            's3:PutObject',
            's3:PutObjectAcl',
            's3:GetObject',
            's3:GetObjectAcl',
            's3:DeleteObject',
          ],
          Effect: 'Allow',
          Resource: [`arn:aws:s3:::${bucket}/*`],
          Principal: '*',
        },
      ],
    },
  };
}

export function putLogsPolicy(name: string, log_group: AR.CloudwatchLogGroup) {
  return {
    name,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:DescribeLogStreams',
            'logs:PutLogEvents',
          ],
          Resource: [`${log_group.arn.value}`],
        },
      ],
    },
  };
}

export function route53ModifyZonePolicy(
  name: string,
  zone: AR.Route53Zone
): NamedPolicy {
  return {
    name,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: ['route53:*'],
          Effect: 'Allow',
          Resource: [`arn:aws:route53:::hostedzone/${zone.zone_id.value}`],
        },
        {
          Action: ['route53:ListHostedZones', 'route53:GetChange'],
          Effect: 'Allow',
          Resource: ['*'],
        },
      ],
    },
  };
}

export function sqsQueueModifyPolicy(
  name: string,
  queue: AR.SqsQueue
): NamedPolicy {
  return {
    name,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sqs:*',
          Effect: 'Allow',
          Resource: `${queue.arn.value}`,
        },
      ],
    },
  };
}

export const ecr_readonly_policy: NamedPolicy = {
  name: 'ecrreadonly',
  policy: {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:GetRepositoryPolicy',
          'ecr:DescribeRepositories',
          'ecr:ListImages',
          'ecr:DescribeImages',
          'ecr:BatchGetImage',
        ],
        Resource: '*',
      },
    ],
  },
};

export const ecr_modify_all_policy: NamedPolicy = {
  name: 'ecrmodifyall',
  policy: {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['ecr:*'],
        Resource: '*',
      },
    ],
  },
};

export function edModifyPolicy(
  name: string,
  esdomain: AR.ElasticsearchDomain
): NamedPolicy {
  return {
    name,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['es:*'],
          Resource: `${esdomain.arn.value}`,
        },
      ],
    },
  };
}

export const ses_all_actions_policy: NamedPolicy = {
  name: 'ses_full_access',
  policy: {
    Version: '2012-10-17',
    Statement: [
      {
          'Effect': 'Allow',
          'Action': [
              'ses:*'
          ],
          'Resource': '*'
      }
    ]
  }
}

export function s3PublishNotificationPolicy(name: string, queue: string, bucket: string) {
  return {
    name,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['sqs:SendMessage'],
          Resource: [`arn:aws:sqs:*:*:${queue}`],
          Condition: {
            ArnLike: { "aws:SourceArn": `arn:aws:s3:*:*:${bucket}` }
          }
        },
      ],
    },
  };
}

// This is a snapshot of the aws managed policy 'arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole'
// as at 11 March, 2019
export const rdsMonitoringPolicy: NamedPolicy = {
  name: 'rds-monitoring-policy',
  policy: {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "EnableCreationAndManagementOfRDSCloudwatchLogGroups",
        Effect: "Allow",
        Action: [
          "logs:CreateLogGroup",
          "logs:PutRetentionPolicy"
        ],
        Resource: [
          "arn:aws:logs:*:*:log-group:RDS*"
        ]
      },
      {
        Sid: "EnableCreationAndManagementOfRDSCloudwatchLogStreams",
        Effect: "Allow",
        Action: [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
          "logs:GetLogEvents"
        ],
        Resource: [
          "arn:aws:logs:*:*:log-group:RDS*:log-stream:*"
        ]
      }
    ]
  }
}


// Lambda role policy
export const lambdaRolePolicy: NamedPolicy = {
  name: 'rds-monitoring-policy',
  policy: {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "ec2:DescribeNetworkInterfaces",
          "ec2:CreateNetworkInterface",
          "ec2:DeleteNetworkInterface",
          "ec2:DescribeInstances",
          "ec2:AttachNetworkInterface"
        ],
        "Resource": "*"
      }
    ]
  }
};
