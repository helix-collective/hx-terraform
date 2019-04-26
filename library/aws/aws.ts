/**
 *   Miscellaneous functions for building AWS infrastructure.
 *
 *   These construct resources or groups of resource consistently within helix,
 *   and should be used in preference to the lower level resource creation functions
 *   in providers
 */

import * as _ from 'lodash';
import * as TF from '../../core/core';
import * as AT from '../../providers/aws/types';
import * as AR from '../../providers/aws/resources';
import * as policies from './policies';
import { SharedResources } from './shared';
import {
  contextTagsWithName,
  Customize,
  ingressOnPort,
  egress_all,
  applyCustomize,
} from '../util';

export interface InstanceWithEipParams {
  instance_type: AT.InstanceType;
  ami(region: AT.Region): AT.Ami;
  security_group: AR.SecurityGroup;
  key_name: AT.KeyName;
  customize_instance?: Customize<AR.InstanceParams>;
}

/**
 * Construct an EC2 instance with a public elastic IP Address
 */
export function createInstanceWithEip(
  tfgen: TF.Generator,
  name: string,
  sr: SharedResources,
  params0: InstanceWithEipParams
): { eip: AR.Eip; ec2: AR.Instance } {
  function createInstance() {
    const instance_params: AR.InstanceParams = {
      ami: params0.ami(sr.network.region),
      instance_type: params0.instance_type,
      key_name: params0.key_name,
      subnet_id: firstAzExternalSubnet(sr).id,
      vpc_security_group_ids: [params0.security_group.id],
      root_block_device: {
        volume_size: 20,
      },
      tags: contextTagsWithName(tfgen, name),
    };

    if (params0.customize_instance) {
      params0.customize_instance(instance_params);
    }

    const ec2 = AR.createInstance(tfgen, name, instance_params);

    // Prevent changes to user_data script tainting the instance, (as
    // a developer convenience)
    tfgen.ignoreChanges(ec2, 'user_data');

    return ec2;
  }

  function createElasticIp(ec2: AR.Instance) {
    const params: AR.EipParams = {
      vpc: true,
      instance: ec2.id,
      tags: {
        ...tfgen.tagsContext(),
      },
    };

    const eip = AR.createEip(tfgen, name, params);
    return { eip, ec2 };
  }

  const ec2 = createInstance();
  const eip = createElasticIp(ec2);

  return eip;
}

/**
 * Create an EC2 Container Registry Repository, for storing docker images.
 */
export function createEcrRepository(tfgen: TF.Generator, name: string) {
  return AR.createEcrRepository(tfgen, name.replace(/\//g, '_'), {
    name,
  });
}

/**
 * Create an S3 bucket.
 */
export function createS3Bucket(
  tfgen: TF.Generator,
  name: string,
  params0: AR.S3BucketParams
): AR.S3Bucket {
  const params = _.cloneDeep(params0);
  params.tags = {
    ...tfgen.tagsContext(),
    ...params.tags,
  };
  return AR.createS3Bucket(tfgen, name, params);
}

/**
 * Create a security group in the shared VPC
 */

export function createSecurityGroupInVpc(
  tfgen: TF.Generator,
  name: string,
  sr: SharedResources,
  params0: AR.SecurityGroupParams
): AR.SecurityGroup {
  const params = _.cloneDeep(params0);
  params.vpc_id = sr.network.vpc.id;
  params.tags = {
    ...contextTagsWithName(tfgen, name),
    ...params.tags,
  };
  return AR.createSecurityGroup(tfgen, name, params);
}

export function externalSubnets(sr: SharedResources): AR.Subnet[] {
  return sr.network.azs.map(az => az.external_subnet);
}

/**  Selects the external subnet of the first availability zone */
export function firstAzExternalSubnet(sr: SharedResources): AR.Subnet {
  return sr.network.azs[0].external_subnet;
}

/**  Selects the external subnet of the second availability zone */
export function secondAzExternalSubnet(sr: SharedResources): AR.Subnet {
  return sr.network.azs[1].external_subnet;
}

/**
 * Create an SQS Queue
 */
export function createSqsQueue(
  tfgen: TF.Generator,
  name: string,
  customize: Customize<AR.SqsQueueParams>
): AR.SqsQueue {
  const sname = tfgen.scopedName(name).join('_');
  const params: AR.SqsQueueParams = {
    name: sname,
    tags: tfgen.tagsContext(),
  };
  customize(params);
  return AR.createSqsQueue(tfgen, name, params);
}

export function s3DeployBucketReadOnlyPolicy(sr: SharedResources) {
  return policies.s3ReadonlyPolicy('reads3deploy', sr.deploy_bucket_name);
}

export function s3DeployBucketModifyPolicy(sr: SharedResources) {
  return policies.s3ModifyPolicy('modifys3deploy', sr.deploy_bucket_name);
}

export function s3BackupBucketModifyPolicy(sr: SharedResources) {
  return policies.s3ModifyPolicy('modifys3backup', sr.backup_bucket_name);
}

/**
 *  Setup S3 event notifications from a bucket to a specified SQS queue
 */
export function s3BucketNotificationsToSqsQueue(
  tfgen: TF.Generator,
  name: string,
  params: {
    bucket: AR.S3Bucket;
    queue: AR.SqsQueue;
    events: string[];
  }
) {
  const qp = AR.createSqsQueuePolicy(tfgen, name, {
    queue_url: params.queue.id.value,
    policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: 'sqs:SendMessage',
          Resource: params.queue.arn.value,
          Condition: {
            ArnEquals: { 'aws:SourceArn': params.bucket.arn.value },
          },
        },
      ],
    }),
  });
  const bn = AR.createS3BucketNotification(tfgen, name, {
    bucket: params.bucket.id,
    queue: {
      id: 'params.queue',
      queue_arn: params.queue.arn,
      events: params.events,
    },
  });
  tfgen.dependsOn(bn, qp);
}

/**
 *  Setup S3 event notifications from a bucket to a specified lambda function
 */
export function s3BucketNotificationsToLambda(
  tfgen: TF.Generator,
  name: string,
  params: {
    bucket: AR.S3Bucket;
    lambda: AR.LambdaFunction;
    events: string[];
  }
) {
  AR.createS3BucketNotification(tfgen, name, {
    bucket: params.bucket.id,
    lambda_function: {
      lambda_function_arn: params.lambda.arn,
      events: params.events,
    },
  });
}

/** Create Memcached service */
export function createMemcachedCluster(
  tfgen: TF.Generator,
  name: string,
  sr: SharedResources,
  params: {
    node_type: AT.CacheNodeType;
    num_cache_nodes: number;
    customize_memcached_cluster?: Customize<AR.ElasticacheClusterParams>;
  }
): AR.ElasticacheCluster {
  const scopedName = tfgen.scopedName(name).join('-');

  // memcached parameter group
  // TODO(jeeva): Understand why this is better/worse than simply calling
  // parameter_group_name: AT.elasticacheParameterGroupName("default.memcached1.5"),
  const elasticache_parameter_group = AR.createElasticacheParameterGroup(
    tfgen,
    name,
    {
      name: scopedName,
      family: AT.memcached_1_5.value,
    }
  );

  // default memcached port
  const port = 11211;

  // default security group (ingress on specified port, egress all)
  const sg = createSecurityGroupInVpc(tfgen, 'ec', sr, {
    ingress: [ingressOnPort(port)],
    egress: [egress_all],
  });

  // limit access to internal subnets
  const subnets = AR.createElasticacheSubnetGroup(tfgen, 'ec', {
    name: scopedName,
    subnet_ids: sr.network.azs.map(az => az.internal_subnet.id),
  });

  const elasticache_params: AR.ElasticacheClusterParams = {
    port,
    cluster_id: scopedName,
    engine: 'memcached',
    node_type: params.node_type,
    num_cache_nodes: params.num_cache_nodes,
    parameter_group_name: elasticache_parameter_group.name,
    security_group_ids: [sg.id],
    subnet_group_name: subnets.name,
    tags: tfgen.tagsContext(),
  };

  return AR.createElasticacheCluster(
    tfgen,
    name,
    applyCustomize(params.customize_memcached_cluster, elasticache_params)
  );
}

/**
 * Include in the generated terraform configuration to store the terraform state in the
 * specified S3 bucket.
 */
export function enableTerraformS3RemoteState(
  tfgen: TF.Generator,
  bucket: string,
  region: AT.Region
) {
  tfgen.createAdhocFile(
    'state-backend.tf',
    `\
terraform {
   backend "s3" {
     bucket = "${bucket}"
     key    = "terraform/state"
     region = "${region.value}"
   }
}`
  );
}
