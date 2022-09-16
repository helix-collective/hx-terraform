/**
 *   Miscellaneous functions for building AWS infrastructure.
 *
 *   These construct resources or groups of resource consistently within helix,
 *   and should be used in preference to the lower level resource creation functions
 *   in providers
 */

import * as TF from '../../core/core.ts';
import * as AT from '../../providers/aws/types.ts';
import * as AR from '../../providers/aws/resources.ts';
import * as policies from './policies.ts';
import * as shared from "./shared.ts";
import * as amis from "./amis.ts";
import {
  contextTagsWithName,
  Customize,
  ingressOnPort,
  egress_all,
  applyCustomize,
} from '../util.ts';


export interface InstanceParams {
  instance_type: AT.InstanceType;
  ami: amis.AmiSelector;
  security_group: AR.SecurityGroup;
  key_name: AT.KeyName;
  ignoreUserDataChanges?: boolean,
  tags_to_ignore?: string[];
  customize_instance?: Customize<AR.InstanceParams>;
}

/**
 * Construct an EC2 instance with a public elastic IP Address
 */
export function createInstanceWithEip(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  subnet_id: AR.SubnetId,
  params0: InstanceParams
): { eip: AR.Eip; ec2: AR.Instance } {

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

  const ec2 = createInstance(tfgen, name, sr, subnet_id, params0);
  const eip = createElasticIp(ec2);

  return eip;
}

export function createInstance(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  subnet_id: AR.SubnetId,
  params0: InstanceParams
): AR.Instance {
  /**
   * To be able to ignore tags that are modified externally, they have to be created by terraform first, then ignore them
   */
  const tags_to_ignore: Record<string, string> | undefined = {};
  params0.tags_to_ignore?.forEach((tag) => {
    // https://github.com/hashicorp/terraform-provider-aws/issues/21896
    // tags can't be empty, set a dummy value instead
    tags_to_ignore[tag] = "dummy_removeme"
  })
  const instance_params: AR.InstanceParams = {
    ami: params0.ami(sr.region),
    instance_type: params0.instance_type,
    key_name: params0.key_name,
    subnet_id,
    vpc_security_group_ids: [params0.security_group.id],
    root_block_device: {
      volume_size: 20,
    },
    tags: {
      ...contextTagsWithName(tfgen, name),
      ...tags_to_ignore
    }
  };

  if (params0.customize_instance) {
    params0.customize_instance(instance_params);
  }

  // If user data is meant to be ignored, do not replace on change and ignore changes after creation
  const ignoreUserDataChanges = (params0.ignoreUserDataChanges !== undefined) ? params0.ignoreUserDataChanges : false;

  instance_params.user_data_replace_on_change = !ignoreUserDataChanges;

  const ec2 = AR.createInstance(tfgen, name, instance_params);

  // Prevent changes to user_data script tainting the instance, (as
  // a developer convenience)
  if(ignoreUserDataChanges) {
    tfgen.ignoreChanges(ec2, 'user_data');
  }
  // Ignore changes in the following tags
  params0.tags_to_ignore?.forEach((tag) => {
    tfgen.ignoreChanges(ec2, `tags.${tag}`)
  })

  return ec2;
}

/**
 * Create an EC2 Container Registry Repository, for storing docker images.
 */
export function createEcrRepository(tfgen: TF.Generator, name: string, params?: Partial<AR.EcrRepositoryParams>) {
  return AR.createEcrRepository(tfgen, name.replace(/\//g, '_'), {
    name,
    ...params,
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
  const params = {
    ...params0,
    tags: {
      ...tfgen.tagsContext(),
      ...params0.tags,
    }
  }
  return AR.createS3Bucket(tfgen, name, params);
}

export interface CreateS3BucketV2Params {
  versioningEnabled: boolean,
  bucketParams: AR.S3BucketParams,
  corsParams?: AR.S3BucketCorsConfigurationParams,
  acceleratedParams?: AR.S3BucketAccelerateConfigurationParams,
  lifecycleParams?: AR.S3BucketLifecycleConfigurationParams
}
// CreateS3Bucket for newer versions of terraform
export function createS3BucketV2(
  tfgen: TF.Generator,
  name: string,
  params: CreateS3BucketV2Params
  
): AR.S3Bucket {
  const _bucketParams = {
    ...params.bucketParams,
    tags: {
      ...tfgen.tagsContext(),
      ...params.bucketParams.tags,
    }
  }
  const s3Bucket = AR.createS3Bucket(tfgen, name, _bucketParams);
  if (params.versioningEnabled == true) {
    AR.createS3BucketVersioning(tfgen, `${name}-versioning`, {
      bucket: _bucketParams.bucket,
      versioning_configuration: {
        status: 'Enabled'
      }
    })
  }
  if (params.corsParams != undefined) {
    AR.createS3BucketCorsConfiguration(tfgen, `${name}-cors`, params.corsParams)
  }
  if (params.acceleratedParams != undefined) {
    AR.createS3BucketAccelerateConfiguration(tfgen, `${name}-accelerated`, params.acceleratedParams)
  }
  if (params.lifecycleParams != undefined) {
    AR.createS3BucketLifecycleConfiguration(tfgen, `${name}-lifecycle`, params.lifecycleParams)
  }
  return s3Bucket
}

/**
 * Create a security group in the shared VPC
 */

export function createSecurityGroupInVpc(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  params0: AR.SecurityGroupParams
): AR.SecurityGroup {
  const params = {
    ...params0,
    vpc_id: sr.vpc.id,
    tags: {
      ...contextTagsWithName(tfgen, name),
      ...params0.tags,
    }
  }
  return AR.createSecurityGroup(tfgen, name, params);
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

export function s3DeployBucketReadOnlyPolicy(sr: shared.SharedResources) {
  return policies.s3ReadonlyPolicy('reads3deploy', sr.deploy_bucket_name);
}

export function s3DeployBucketModifyPolicy(sr: shared.SharedResources) {
  return policies.s3ModifyPolicy('modifys3deploy', sr.deploy_bucket_name);
}

export function s3BackupBucketModifyPolicy(sr: shared.SharedResources) {
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
  sr: shared.SharedResources,
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
    subnet_ids: shared.internalSubnetIds(sr)
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
  tfgen.createBackendFile(
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

export function setTerraformBackend(
  tfgen: TF.Generator,
  bucket: string,
  region: AT.Region,
  backend: "local"|"s3"
) {
  if(backend === "s3") {
    enableTerraformS3RemoteState(tfgen, bucket, region);
  }
}
