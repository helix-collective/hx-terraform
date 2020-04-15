import * as TF from '../../core/core';
import * as AT from '../../providers/aws/types';
import * as AR from '../../providers/aws/resources';
import * as util from '../util';
import * as shared from './shared';

/**
 * Construct an AWS EKS cluster.
 *
 * This creates all necessary resources for an AWS kubernetes cluster. However,
 * some additional configuration is required in the kubernets layer. See
 * `docs/eks.md` for details.
 *
 * This configuration is based upon this tutorial:
 *      https://learn.hashicorp.com/terraform/aws/eks-intro
 */
export function createEksCluster(
  tfgen0: TF.Generator,
  tfname: string,
  sr: shared.SharedResourcesNEI,
  params: EksClusterParams
): EksCluster {
  return TF.withLocalNameScope(tfgen0, tfname, tfgen => {
    // Create the master cluster iam role
    const cluster_role = AR.createIamRole(tfgen, 'cluster', {
      name: tfgen.scopedName('cluster').join('-'),
      assume_role_policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'eks.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      }),
    });
    AR.createIamRolePolicyAttachment(tfgen, 'clusterpolicy', {
      role: cluster_role.name,
      policy_arn: AT.arnT(
        'arn:aws:iam::aws:policy/AmazonEKSClusterPolicy',
        'IamPolicy'
      ),
    });
    AR.createIamRolePolicyAttachment(tfgen, 'servicepolicy', {
      role: cluster_role.name,
      policy_arn: AT.arnT(
        'arn:aws:iam::aws:policy/AmazonEKSServicePolicy',
        'IamPolicy'
      ),
    });

    // Create the master cluster security group
    const master_security_group = AR.createSecurityGroup(tfgen, 'cluster', {
      vpc_id: sr.network.vpc.id,
      egress: [util.egress_all],
      tags: util.contextTagsWithName(tfgen, 'cluster'),
    });

    // Create the cluster itself
    const subnet_ids: AR.SubnetId[] = [];
    sr.network.azs.forEach(az => {
      subnet_ids.push(az.external_subnet.id);
      subnet_ids.push(az.internal_subnet.id);
    });

    const cluster = AR.createEksCluster(tfgen, 'cluster', {
      name: params.cluster_name,
      role_arn: cluster_role.arn,
      vpc_config: {
        security_group_ids: [master_security_group.id],
        subnet_ids,
      },
    });

    // Worker node IAM Role
    const worker_role = AR.createIamRole(tfgen, 'worker', {
      name: tfgen.scopedName('worker').join('-'),
      assume_role_policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'ec2.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      }),
    });
    AR.createIamRolePolicyAttachment(tfgen, 'workernode', {
      role: worker_role.name,
      policy_arn: AT.arnT(
        'arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy',
        'IamPolicy'
      ),
    });
    AR.createIamRolePolicyAttachment(tfgen, 'workercni', {
      role: worker_role.name,
      policy_arn: AT.arnT(
        'arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy',
        'IamPolicy'
      ),
    });
    AR.createIamRolePolicyAttachment(tfgen, 'workercontaineregistryread', {
      role: worker_role.name,
      policy_arn: AT.arnT(
        'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly',
        'IamPolicy'
      ),
    });

    const worker_profile = AR.createIamInstanceProfile(tfgen, 'worker', {
      name: tfgen.scopedName('worker').join('_'),
      role: worker_role.name,
    });

    // Create the worker node security group

    const tags = util.contextTagsWithName(tfgen, 'worker');
    tags[`kubernetes.io/cluster/${params.cluster_name}`] = 'owned';

    const worker_security_group = AR.createSecurityGroup(tfgen, 'worker', {
      vpc_id: sr.network.vpc.id,
      egress: [util.egress_all],
      tags,
    });

    AR.createSecurityGroupRule(tfgen, 'workerssh', {
      description: 'ssh for debugging',
      from_port: 22,
      protocol: 'tcp',
      cidr_blocks: [AT.cidrBlock('0.0.0.0/0')],
      security_group_id: worker_security_group.id,
      to_port: 22,
      type: 'ingress',
    });

    AR.createSecurityGroupRule(tfgen, 'workeringressself', {
      description: 'Allow node to communicate with each other',
      from_port: 0,
      protocol: '-1',
      security_group_id: worker_security_group.id,
      source_security_group_id: worker_security_group.id,
      to_port: 65535,
      type: 'ingress',
    });

    AR.createSecurityGroupRule(tfgen, 'workeringresscluster', {
      description:
        'Allow worker Kubelets and pods to receive communication from the cluster control plane',
      from_port: 1025,
      protocol: 'tcp',
      security_group_id: worker_security_group.id,
      source_security_group_id: master_security_group.id,
      to_port: 65535,
      type: 'ingress',
    });

    AR.createSecurityGroupRule(tfgen, 'ingressnodehttps', {
      description: 'Allow pods to communicate with the cluster API server',
      from_port: 443,
      protocol: 'tcp',
      security_group_id: master_security_group.id,
      source_security_group_id: worker_security_group.id,
      to_port: 443,
      type: 'ingress',
    });

    // And finally, the autoscaling group for the worker nodes

    // Hack as we dont yet support structured attributes
    const certificate_authority_data = cluster.certificate_authority.replace(
      /certificate_authority/,
      'certificate_authority.0.data'
    );
    const user_data = `\
#!/bin/bash
set -o xtrace
/etc/eks/bootstrap.sh --apiserver-endpoint '${
      cluster.endpoint
    }' --b64-cluster-ca '${certificate_authority_data}' '${params.cluster_name}'
`;
    const image_id = eksAmiDataSource(tfgen, cluster);

    const launch_configuration_params: AR.LaunchConfigurationParams = {
      associate_public_ip_address: true,
      iam_instance_profile: worker_profile.id,
      image_id,
      instance_type: params.node_instance_type,
      name_prefix: tfgen.scopedName('worker').join('-'),
      security_groups: [worker_security_group.id],
      user_data,
    };
    if (params.node_launch_configuration_customize) {
      params.node_launch_configuration_customize(launch_configuration_params);
    }
    const launch_configuration = AR.createLaunchConfiguration(
      tfgen,
      'worker',
      launch_configuration_params
    );
    tfgen.createBeforeDestroy(launch_configuration, true);

    const asg_name = tfgen.scopedName('asg').join('_');
    const asg_tags: AR.AutoscalingGroupTagParams[] = Object.entries(
      util.contextTagsWithName(tfgen, 'asg')
    ).map(([key, value]) => {
      return {
        key,
        value,
        propagate_at_launch: true,
      };
    });
    asg_tags.push({
      key: `kubernetes.io/cluster/${params.cluster_name}`,
      value: 'owned',
      propagate_at_launch: true,
    });

    const asg_params: AR.AutoscalingGroupParams = {
      launch_configuration: launch_configuration.name,
      min_size: 1,
      max_size: 4,
      name: asg_name,
      vpc_zone_identifier: sr.network.azs.map(az => az.external_subnet.id),
      tags: asg_tags,
    };
    if (params.asg_customize) {
      params.asg_customize(asg_params);
    }

    const asg = AR.createAutoscalingGroup(tfgen, 'asg', asg_params);

    // Generate a terraform output with the k8s configmap
    // required to allow the worker to join the cluster
    authConfigMapOutput(tfgen, worker_role);

    return {
      master_security_group,
      cluster,
      asg,
    };
  });
}

function eksAmiDataSource(tfgen: TF.Generator, cluster: AR.EksCluster): AT.Ami {
  const scoped_name = tfgen.scopedName('ami').join('_');

  // Our terraform codegen doesn't yet support terraform data sources,
  // so generate this as an adhoc terraform file
  const datav = `\
data "aws_ami" "${scoped_name}" {
  filter {
    name   = "name"
    values = ["amazon-eks-node-${cluster.version}-v*"]
  }

  most_recent = true
  owners      = ["602401143452"] # Amazon EKS AMI Account ID
}
`;

  tfgen.createAdhocFile(scoped_name + '.tf', datav);
  return AT.ami('${data.aws_ami.' + scoped_name + '.id}');
}

function authConfigMapOutput(tfgen: TF.Generator, worker_role: AR.IamRole) {
  const scoped_name = tfgen.scopedName('authoutput').join('_');
  const datav = `\
locals {
  config_map_aws_auth = <<CONFIGMAPAWSAUTH


apiVersion: v1
kind: ConfigMap
metadata:
  name: aws-auth
  namespace: kube-system
data:
  mapRoles: |
    - rolearn: ${worker_role.arn.value}
      username: system:node:{{EC2PrivateDNSName}}
      groups:
        - system:bootstrappers
        - system:nodes
CONFIGMAPAWSAUTH
}

output "${scoped_name}" {
  value = "\${local.config_map_aws_auth}"
}
`;
  tfgen.createAdhocFile(scoped_name + '.tf', datav);
}

interface EksClusterParams {
  /** the published name of the cluster */
  cluster_name: string;

  /** the instance type of the worker nodes */
  node_instance_type: AT.InstanceType;

  /** customizer for the worker node configuration */
  node_launch_configuration_customize?: util.Customize<
    AR.LaunchConfigurationParams
  >;

  /** customerize for the worker node auto scaling group */
  asg_customize?: util.Customize<AR.AutoscalingGroupParams>;
}

interface EksCluster {
  master_security_group: AR.SecurityGroup;
  cluster: AR.EksCluster;
  asg: AR.AutoscalingGroup;
}
