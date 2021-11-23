import * as TF from '../../core/core.ts';
import * as AR from '../../providers/aws/resources.ts';
import { ArnSecret } from './secrets.ts';

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
      {
        Action: 'sts:AssumeRole',
        Principal: { Service: 'lambda.amazonaws.com' },
        Effect: 'Allow',
        Sid: '',
      },
      {
        Action: 'sts:AssumeRole',
        Principal: { Service: 'firehose.amazonaws.com' },
        Effect: 'Allow',
        Sid: '',
      },
      {
        Action: 'sts:AssumeRole',
        Principal: { Service: 'apigateway.amazonaws.com' },
        Effect: 'Allow',
        Sid: '',
      },
    ],
  },
};

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

export function s3ReadonlyPolicy(name: string, bucket: string, key_prefix: string = '*') {
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
          Resource: [`arn:aws:s3:::${bucket}/${key_prefix}`],
        },
      ],
    },
  };
}

export function s3PublicReadonlyPolicy(name: string, bucket: string, key_prefix: string = '*') {
  return {
    name,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: ['s3:GetObject'],
          Effect: 'Allow',
          Principal: '*',
          Resource: [`arn:aws:s3:::${bucket}/${key_prefix}`],
        },
      ],
    },
  };
}

export function s3ModifyPolicy(name: string, bucket: string, key_prefix: string = '*') {
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
          Action: [
            's3:PutObject',
            's3:PutObjectAcl',
            's3:GetObject',
            's3:GetObjectAcl',
            's3:DeleteObject',
          ],
          Effect: 'Allow',
          Resource: [`arn:aws:s3:::${bucket}/${key_prefix}`],
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

export function putAnyLogsPolicy(name: string) {
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
          Resource: ['arn:aws:logs:*:*:*'],
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
          Resource: queue.arn.value,
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

export const lambda_in_vpc_policy: NamedPolicy = {
  name: 'vpclambda',
  policy: {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: [
          'ec2:CreateNetworkInterface',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DeleteNetworkInterface',
        ],
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
          Resource: `${esdomain.arn.value}/*`,
        },
      ],
    },
  };
}

export function secretReadOnlyPolicy(
  name: string,
  arn: ArnSecret
): NamedPolicy {
  return {
    name,
    policy: {
      Version: '2012-10-17',
      Statement: {
        Effect: 'Allow',
        Action: 'secretsmanager:GetSecretValue',
        Resource: `${arn.value}`,
      },
    },
  };
}

export const ses_all_actions_policy: NamedPolicy = {
  name: 'ses_full_access',
  policy: {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['ses:*'],
        Resource: '*',
      },
    ],
  },
};

export function firehosePutRecordPolicy(
  name: string,
  stream: AR.KinesisFirehoseDeliveryStream
): NamedPolicy {
  return {
    name,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
          Resource: stream.arn.value,
        },
      ],
    },
  };
}

export function autoscalingGroupEnableSetInstanceProtection(
  name: string,
  Resource: string
) {
  return {
    name,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          // Customise Resource to restrict access
          Resource,
          Effect: 'Allow',
          Action: 'autoscaling:SetInstanceProtection',
        },
      ],
    },
  };
}

/**
 * Allow sending of SMS, but not sns messages to topics, etc.
 *
 * https://stackoverflow.com/questions/38871201/authorization-when-sending-a-text-message-using-amazonsnsclient
 */
export const snsPostSmsPolicy: NamedPolicy = {
  name: 'snspostsms',
  policy: {
    Version: "2012-10-17",
    Statement: [
        {
            Effect: "Deny",
            Action: [
                "sns:Publish"
            ],
            Resource: "arn:aws:sns:*:*:*"
        },
        {
            Effect: "Allow",
            Action: [
                "sns:Publish"
            ],
            Resource: "*"
        }
    ]
},
};

/**
 * Full access to SNS
 */
export const snsFullAccessPolicy: NamedPolicy = {
  name: 'snsfullaccess',
  policy: {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": [
                "sns:*"
            ],
            "Effect": "Allow",
            "Resource": "*"
        }
    ]
  },
};
