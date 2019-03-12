import * as _ from 'lodash';
import * as TF from '../../core/core';
import * as AT from '../../providers/aws/types';
import * as AR from '../../providers/aws/resources';
import { assume_role_policy, NamedPolicy, assume_role_rds_monitoring_policy } from './policies';
import { watchFile } from 'fs';

/**
 * Create an IAM Role Policy.
 */
export function createIamRolePolicy(
  tfgen: TF.Generator,
  role: AR.IamRole,
  policy: NamedPolicy
): AR.IamRolePolicy {
  const sname = tfgen.scopedName(policy.name).join('_');
  return AR.createIamRolePolicy(tfgen, policy.name, {
    name: sname,
    policy: JSON.stringify(policy.policy, null, 2),
    role: role.id,
  });
}

/**
 * Create an IAM Role.
 */
export function createIamRole(
  tfgen: TF.Generator,
  rname: string,
  assume_role_policy: string
): AR.IamRole {
  const sname = tfgen.scopedName(rname).join('_');
  return AR.createIamRole(tfgen, rname, {
    assume_role_policy,
    name: sname,
  });
}

function createIamRolePolicywithPolicies(
  tfgen: TF.Generator,
  name: string,
  role_policy: NamedPolicy,
  policies: NamedPolicy[]
): AR.IamRole {
  const iamr = createIamRole(
    tfgen,
    name,
    JSON.stringify(role_policy.policy, null, 2)
  );
  TF.withLocalNameScope(tfgen, name, tfgen => {
    for (const policy of policies) {
      createIamRolePolicy(tfgen, iamr, policy);
    }
  });
  return iamr;
}

// Specifically used for Enhanced Monitoring
export function createIamRdsRoleWithPolicies(
    tfgen: TF.Generator,
    name: string,
    policies: NamedPolicy[]
): AR.IamRole {
  return createIamRolePolicywithPolicies(tfgen, name, assume_role_rds_monitoring_policy, policies);
}

/**
 * Create an IAM Role with the specified policies
 */
export function createIamRoleWithPolicies(
  tfgen: TF.Generator,
  name: string,
  policies: NamedPolicy[]
): AR.IamRole {
  return createIamRolePolicywithPolicies(tfgen, name, assume_role_policy, policies);
}

/**
 * Create an IAM instance profile with the specified policies
 */
export function createInstanceProfileWithPolicies(
  tfgen: TF.Generator,
  name: string,
  policies: NamedPolicy[]
): AR.IamInstanceProfile {
  const iamr = createIamRoleWithPolicies(tfgen, name, policies);
  return TF.withLocalNameScope(tfgen, name, tfgen => {
    return AR.createIamInstanceProfile(tfgen, name, {
      role: iamr.name,
    });
  });
}
