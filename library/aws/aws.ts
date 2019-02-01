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


export function createMemcacheCluster(
  tfgen: TF.Generator,
  name: string,
  customize?: Customize<AR.ElasticacheClusterParams>
): AR.ElasticacheCluster {

  const params: AR.ElasticacheClusterParams = {
    cluster_id: name,
    engine: "memcached",
    node_type: AT.cache_t2_micro,
    num_cache_nodes: 1,
    parameter_group_name: name + '-group'
  };
  if (customize) {
    customize(params);
  }
  AR.createElasticacheParameterGroup(tfgen, params.parameter_group_name, {
    name: params.parameter_group_name,
    family: "memcached1.5"
  });
  return AR.createElasticacheCluster(tfgen, name, params);
}
