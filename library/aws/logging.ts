/**
 * Assemble logging infrastructure based upon AWS elasticsearch and fluentd aggregators
 * running on EC2.
 */

import * as _ from 'lodash';
import * as TF from '../../core/core';
import * as AT from '../../providers/aws/types';
import * as AR from '../../providers/aws/resources';
import * as policies from './policies';
import * as roles from './roles';
import * as aws from './aws';
import * as s3 from './s3';
import * as bootscript from '../bootscript';
import * as util from '../util';
import * as shared from './shared';
import * as docker from '../docker';
import { scheduleExpression } from '../aws/cron-webhooks';

export interface LoggingInfrastructureParams {
  secrets_s3_ref: s3.S3Ref;
  domain_name: string;
  aggregator_key_name: AT.KeyName;
  customize?: util.Customize<AR.ElasticsearchDomainParams>;
  cognito?: LoggingCognitoParams;
  logging_ip_whitelist?: AT.IpAddress[];
  log_cleanup?: LogCleanupMode;
}

export type LogCleanupMode = { kind: 'older_than_months'; months: number; lambdaRuntime?: AT.LambdaRuntime; };

export interface LoggingCognitoParams {
  // The cognito user pool being given access to kibana
  user_pool_id: AR.CognitoUserPoolId;

  // The cognito identity pool being given access to kibana
  identity_pool_id: AR.CognitoIdentityPoolId;

  // The role that needs to be able to access elasticsearch
  auth_role_arn: AR.IamRoleArn;
}

export interface LoggingInfrastructure {
  aggregator_ipaddresses: AT.IpAddress[];
}

/**
 * Create logging infrastructure, including an elasticsearch instance
 * and a pair of EC2 machines running fluentd aggregators.
 *
 * The fluentd aggregators require a self signed SSL certificate,
 * that must be manually created and uploaded to s3. Create the certificate
 * with the command:
 *
 * openssl req -x509 -sha256 -nodes -days 3650 -newkey rsa:2048 -keyout fluentd-aggregator.key -out fluentd-sender.crt -subj "\
 * /O=Helix\
 * /C=AU\
 * /L=Sydney\
 * /OU=Technology\
 * /ST=New South Wales\
 * /CN=LOGGING_FQDN"
 *
 * where LOGGING_FQDN is logging.${main.domain_name} (eg logging.aws.helixta.com.au)
 *
 * Then manually upload the two files to params.secrets_s3_ref.
 *
 * (Ideally this process would be automated via a terraform local provisioner)
 */
export function createLoggingInfrastructure(
  tfgen: TF.Generator,
  sr: shared.SharedResourcesNEI,
  params: LoggingInfrastructureParams
): LoggingInfrastructure {
  // An S3 bucket for longer-term storage
  const logs_bucket_name = sr.s3_bucket_prefix + '-shared-logs';
  const logs_bucket = AR.createS3Bucket(tfgen, 'logs', {
    bucket: logs_bucket_name,
    tags: tfgen.tagsContext(),
  });

  // An iam role
  const iamr = roles.createIamRoleWithPolicies(tfgen, 'logging', [
    policies.s3ModifyPolicy('s3modify', logs_bucket_name),
  ]);

  // The ES domain itself
  const edparams: AR.ElasticsearchDomainParams = {
    domain_name: params.domain_name,
    elasticsearch_version: '5.5',
    cluster_config: {
      instance_type: AT.m4_large_elasticsearch,
      instance_count: 2,
      dedicated_master_enabled: false,
    },
    advanced_options: {
      'rest.action.multi.allow_explicit_index': 'true',
    },
    snapshot_options: {
      automated_snapshot_start_hour: 23,
    },
    ebs_options: {
      ebs_enabled: true,
      volume_size: 100,
      volume_type: 'gp2',
    },
    tags: tfgen.tagsContext(),
  };
  // See ***
  // if (params.cognito) {
  //  edparams.cognito_options = {
  //    enabled: true,
  //    user_pool_id: params.cognito.user_pool_id,
  //    identity_pool_id: params.cognito.identity_pool_id,
  //    role_arn: params.cognito.role1_arn,
  //  }
  // }

  if (params.customize) {
    params.customize(edparams);
  }
  const ed = AR.createElasticsearchDomain(tfgen, 'logging', edparams);
  tfgen.ignoreChanges(ed, 'cognito_options');

  const instance_profile = roles.createInstanceProfileWithPolicies(
    tfgen,
    'aggregator_policies',
    [
      policies.s3ReadonlyPolicy('s3readonly', params.secrets_s3_ref.bucket),
      policies.edModifyPolicy('elastic_search_modify_policy', ed),
    ]
  );

  const security_group = aws.createSecurityGroupInVpc(
    tfgen,
    'security_group',
    sr,
    {
      egress: [util.egress_all],
      ingress: [
        util.ingressOnPort(22),
        util.ingressOnPort(80),
        util.ingressOnPort(443),
        util.ingressOnPort(24224),
      ],
    }
  );

  // Create the two fluentd log aggregator instances, on the public
  // subnets in two different AZ.
  const bs = bootscript.newBootscript();
  bs.utf8Locale();
  bs.dockerWithConfig(docker.DEFAULT_CONFIG);
  bs.createUserWithKeypairAccess('app');
  bs.addUserToGroup('app', 'docker');
  bs.addAptPackage('jq');
  bs.mkdir('/opt/etc/secrets');
  bs.s3Fetch(
    params.secrets_s3_ref.extendKey('/fluentd-aggregator.key'),
    '/opt/etc/secrets/fluentd-aggregator.key',
    10
  );
  bs.s3Fetch(
    params.secrets_s3_ref.extendKey('/fluentd-sender.crt'),
    '/opt/etc/secrets/fluentd-sender.crt',
    10
  );
  bs.catToFile(
    '/opt/etc/fluentd.conf',
    fluentdConfigFile(ed, sr.network.region)
  );
  bs.catToFile('/opt/etc/docker-compose.yml', DOCKER_COMPOSE_FILE);
  bs.sh('sudo -H -u app docker-compose -f /opt/etc/docker-compose.yml up -d');

  function laparams(): aws.InstanceWithEipParams {
    return {
      ami,
      security_group,
      instance_type: AT.t2_small,
      key_name: params.aggregator_key_name,
      customize_instance: p => {
        (p.iam_instance_profile = instance_profile.id),
        (p.user_data = bs.compile());
      },
    };
  }
  const log_aggregators = [
    aws.createInstanceWithEip(
      tfgen,
      'log_aggregator_one',
      sr,
      shared.externalSubnetIds(sr)[0],
      laparams()
    ),
    aws.createInstanceWithEip(
      tfgen,
      'log_aggregator_two',
      sr,
      shared.externalSubnetIds(sr)[1],
      laparams()
    ),
  ];
  const log_aggregator_ips = log_aggregators.map(la => la.eip.public_ip);

  // The whitelist of static ip addresses allowed to write to the ES domain
  let logging_ip_whitelist: AT.IpAddress[] = log_aggregator_ips;
  if (params.logging_ip_whitelist) {
    logging_ip_whitelist = logging_ip_whitelist.concat(
      params.logging_ip_whitelist
    );
  }

  AR.createElasticsearchDomainPolicy(tfgen, 'logging_ed_policy', {
    domain_name: params.domain_name,
    access_policies: JSON.stringify(
      es_access_policy(
        ed,
        logging_ip_whitelist.map(i => i.value),
        iamr,
        params.cognito && params.cognito.auth_role_arn
      ),
      null,
      2
    ),
  });

  if (params.log_cleanup !== undefined) {
    const lambdaRuntime: AT.LambdaRuntime = params.log_cleanup.lambdaRuntime === undefined
      ? AT.nodejs_12_x : params.log_cleanup.lambdaRuntime;
    createLoggingCleanupLambda(tfgen, sr, {
      ed,
      lambdaRuntime,
      months: params.log_cleanup.months,
    });
  }

  return {
    aggregator_ipaddresses: log_aggregator_ips,
  };
}

interface LoggingCleanupLambdaParams {
  months: number;
  ed: AR.ElasticsearchDomain;
  lambdaRuntime: AT.LambdaRuntime;
}

function createLoggingCleanupLambda(
  tfgen: TF.Generator,
  sr: shared.SharedResourcesNEI,
  params: LoggingCleanupLambdaParams
) {
  const name = 'logging_cleanup';

  // Construct a lambda function that will be called at each periodic event.
  // All lambdas need a role to be able to write logs to Cloudwatch.
  // This lambda needs read/write access to the elastisearch instance
  const role = roles.createIamRoleWithPolicies(tfgen, name, [
    policies.putAnyLogsPolicy('lambdalogs'),
    policies.edModifyPolicy('lambdaelasticsearch', params.ed),
  ]);

  // The lambda function will have already been packed (by doit) into
  // the zipfile before terraform is run. (The lambda function will be updated
  // whenever the hash of the zipfile changes).
  const handler: string = 'es-tool.cronDelete';
  const zipfile: string = '../build/lambdas/es-tool.zip';
  const lambda = AR.createLambdaFunction(tfgen, name, {
    handler,
    runtime: params.lambdaRuntime,
    function_name: tfgen.scopedName(name).join('_'),
    timeout: 60 * 15,
    role: role.arn,
    filename: zipfile,
    source_code_hash: TF.rawExpr(`"\${base64sha256(file("${zipfile}"))}"`),
    tags: tfgen.tagsContext(),
    environment: {
      variables: {
        ES_ENDPOINT: params.ed.endpoint,
      },
    },
  });

  // Setup cloudwatch to call the lambda function
  const event_rule = AR.createCloudwatchEventRule(tfgen, name, {
    name: tfgen.scopedName(name).join('_'),
    schedule_expression: scheduleExpression({
      kind: 'rate',
      period: 1,
      period_units: 'days',
    }),
  });

  AR.createCloudwatchEventTarget(tfgen, name, {
    rule: event_rule.name,
    arn: lambda.arn,
    input: JSON.stringify({
      months: params.months,
    }),
  });

  AR.createLambdaPermission(tfgen, name, {
    action: AT.lambda_InvokeFunction,
    function_name: lambda.function_name,
    principal: 'events.amazonaws.com',
    source_arn: event_rule.arn,
  });
}

interface CognitoResourceParams {
  user_pool_name: string;
  user_pool_domain: string;
  identity_pool_name: string;
  auth_role_name: string;
}

/**
 * Create the AWS cognito resources to support user login for elasticsearch's
 * kibana user interface
 *
 * Currently this function can only be called once within an account
 * (TODO: fix this)
 */
export function createCognitoResources(
  tfgen: TF.Generator,
  sr: shared.SharedResourcesNEI,
  params: CognitoResourceParams
): LoggingCognitoParams {
  // Manual imports of a user_pool resource hit this bug, and required the workaround described:
  //
  //  https://github.com/terraform-providers/terraform-provider-aws/pull/8845

  const user_pool = AR.createCognitoUserPool(tfgen, 'kibana_users', {
    name: params.user_pool_name,
    admin_create_user_config: {
      allow_admin_create_user_only: true,
      invite_message_template: {
        email_message: `Your username for ${
          params.user_pool_name
        } access is {username} and temporary password is {####}. `,
        email_subject: `Your temporary password for ${params.user_pool_name}`,
        sms_message: `Your username for ${
          params.user_pool_name
        } access is {username} and temporary password is {####}. `,
      },
    },
    schema: [
      {
        name: 'email',
        attribute_data_type: 'String',
        mutable: true,
        developer_only_attribute: false,
        required: true,
        string_attribute_constraints: { min_length: 0, max_length: 2048 },
      },
    ],
    sms_authentication_message: 'Your authentication code is {####}. ',
    sms_verification_message: 'Your verification code is {####}. ',
    auto_verified_attributes: ['email'],
    username_attributes: ['email'],
  });

  const client1 = AR.createCognitoUserPoolClient(tfgen, 'client1', {
    name: 'Kibana',
    user_pool_id: user_pool.id,
    read_attributes: [
      'given_name',
      'email_verified',
      'zoneinfo',
      'website',
      'preferred_username',
      'name',
      'locale',
      'phone_number',
      'family_name',
      'birthdate',
      'middle_name',
      'phone_number_verified',
      'profile',
      'picture',
      'address',
      'gender',
      'updated_at',
      'nickname',
      'email',
    ],
    write_attributes: [
      'given_name',
      'zoneinfo',
      'website',
      'preferred_username',
      'name',
      'locale',
      'phone_number',
      'family_name',
      'birthdate',
      'middle_name',
      'profile',
      'picture',
      'address',
      'gender',
      'updated_at',
      'nickname',
      'email',
    ],
  });

  AR.createCognitoUserPoolDomain(tfgen, 'domain', {
    domain: params.user_pool_domain,
    user_pool_id: user_pool.id,
  });

  // *** Automatically created by AWS when Elasticearch is connected to cognito
  //
  // see: https://github.com/terraform-providers/terraform-provider-aws/issues/5557
  //
  // const client2 = AR.createCognitoUserPoolClient(tfgen, 'client2', {
  //       name: 'AWSElasticsearch-es-logging-ap-southeast-2-qkcbwp4nzagr6qieeryenbhvpy',
  //       user_pool_id: user_pool.id,
  //       allowed_oauth_flows: ['code'],
  //       allowed_oauth_flows_user_pool_client: true,
  //       allowed_oauth_scopes: ['openid', 'phone', 'profile', 'email'],
  //       callback_urls: [
  //         "https://search-es-logging-qkcbwp4nzagr6qieeryenbhvpy.ap-southeast-2.es.amazonaws.com/_plugin/kibana/app/kibana"
  //       ],
  //       logout_urls: [
  //         "https://search-es-logging-qkcbwp4nzagr6qieeryenbhvpy.ap-southeast-2.es.amazonaws.com/_plugin/kibana/app/kibana"
  //       ],
  //       supported_identity_providers: ['COGNITO'],
  //     });

  const identity_pool = AR.createCognitoIdentityPool(
    tfgen,
    'kibana_identities',
    {
      identity_pool_name: params.identity_pool_name,
      allow_unauthenticated_identities: false,
      cognito_identity_providers: [
        {
          client_id: client1.id,
          provider_name: user_pool.endpoint,
          server_side_token_check: false,
        },
        //    see *** above
        //
        //        {
        //          client_id: client2.id,
        //          provider_name: user_pool.endpoint,
        //          server_side_token_check: true,
        //        }
      ],
    }
  );

  // see *** above
  tfgen.ignoreChanges(identity_pool, 'cognito_identity_providers');

  //    const role1 = AR.createIamRole(tfgen, 'role1', {
  //      name: "CognitoAccessForAmazonES",
  //      path: "/service-role/",
  //      assume_role_policy: JSON.stringify({
  //        "Version": "2012-10-17",
  //        "Statement": [
  //          {
  //            "Effect": "Allow",
  //            "Principal": {
  //              "Service": "es.amazonaws.com"
  //            },
  //            "Action": "sts:AssumeRole"
  //          }
  //        ]
  //      }),
  //      description: "Amazon Elasticsearch role for Kibana authentication."
  //    });

  const kibana_auth_role = AR.createIamRole(tfgen, 'kibana_auth', {
    name: params.auth_role_name,
    assume_role_policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            Federated: 'cognito-identity.amazonaws.com',
          },
          Action: 'sts:AssumeRoleWithWebIdentity',
          Condition: {
            StringEquals: {
              'cognito-identity.amazonaws.com:aud': identity_pool.id.value,
            },
            'ForAnyValue:StringLike': {
              'cognito-identity.amazonaws.com:amr': 'authenticated',
            },
          },
        },
      ],
    }),
  });

  AR.createCognitoIdentityPoolRolesAttachment(tfgen, 'kibana_identities', {
    identity_pool_id: identity_pool.id,
    roles: {
      authenticated: kibana_auth_role.arn,
    },
  });

  return {
    user_pool_id: user_pool.id,
    identity_pool_id: identity_pool.id,
    auth_role_arn: kibana_auth_role.arn,
  };
}

function es_access_policy(
  domain: AR.ElasticsearchDomain,
  static_ip_whitelist: string[],
  logging_role: AR.IamRole,
  cognito_role: AR.IamRoleArn | undefined
): {} {
  const Statement = [
    {
      Effect: 'Allow',
      Principal: {
        AWS: '*',
      },
      Action: 'es:*',
      Resource: `${domain.arn.value}/*`,
      Condition: {
        IpAddress: {
          'aws:SourceIp': static_ip_whitelist,
        },
      },
    },
    {
      Effect: 'Allow',
      Principal: {
        AWS: logging_role.arn.value,
      },
      Action: 'es:*',
      Resource: `${domain.arn.value}/*`,
    },
  ];
  if (cognito_role) {
    Statement.push({
      Effect: 'Allow',
      Principal: {
        AWS: cognito_role.value,
      },
      Action: 'es:ESHttp*',
      Resource: `${domain.arn.value}/*`,
    });
  }
  return {
    Version: '2012-10-17',
    Statement,
  };
}

// Ubuntu 16.04 AMIS (xenial, hvm:ebs-ssd)
// see https://cloud-images.ubuntu.com/locator/ec2/
function ami(region: AT.Region): AT.Ami {
  if (region === AT.ap_southeast_2) {
    return AT.ami('ami-47c21a25');
  }
  if (region === AT.us_east_1) {
    return AT.ami('ami-759bc50a');
  }
  if (region === AT.us_east_2) {
    return AT.ami('ami-5e8bb23b');
  }
  throw new Error('No ami for region');
}

const DOCKER_COMPOSE_FILE: string = `\
version: '2'
services:
  fluentd:
    image: helixta/fluentd:2018-08-06
    ports:
        - 24224:24224
        - 24224/udp
    volumes:
      - /opt/etc:/fluentd/etc
      - /opt/etc/secrets:/etc/secrets
      - /home/app:/fluend/buffer
    environment:
      - FLUENTD_CONF=fluentd.conf
    restart: always
`;

function fluentdConfigFile(ed: AR.ElasticsearchDomain, region: AT.Region) {
  return `\
<source>
  @type forward
  port 24224
  <transport tls>
    cert_path /etc/secrets/fluentd-sender.crt
    private_key_path /etc/secrets/fluentd-aggregator.key
  </transport>
</source>
<filter **>
  @type ec2_metadata
  metadata_refresh_seconds 300 # Optional, default 300 seconds
  <record>
    logs_ec2_instance_id   \$\${instance_id}
  </record>
</filter>
<match **>
  @type copy
  <store>
    @type \"aws-elasticsearch-service\"

    # If the record has an @es_index field, use that as the
    # elastic index. Otherwise use unknown-YYYY.MM.DD
    target_index_key @es_index
    logstash_format true
    logstash_prefix unknown

    flush_interval 10s
    buffer_type file
    buffer_path /fluentd/buffer/es/
    buffer_chunk_limit 1m

    reload_connections false
    reload_on_failure false
    <endpoint>
      url https://${ed.endpoint}
      region ${region.value}
    </endpoint>
  </store>
  <store>
    @type stdout
  </store>
</match>
`;
}
