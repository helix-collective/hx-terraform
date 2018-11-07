import * as _ from 'lodash';
import * as TF from '../core/core';
import * as AT from '../providers/aws-types';
import * as AR from '../providers/aws-resources';
import { assume_role_policy, NamedPolicy } from './aws-policies';
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

/**
 * Create an IAM Role with the specified policies
 */
export function createIamRoleWithPolicies(
  tfgen: TF.Generator,
  name: string,
  policies: NamedPolicy[]
): AR.IamRole {
  const iamr = createIamRole(
    tfgen,
    name,
    JSON.stringify(assume_role_policy.policy, null, 2)
  );
  TF.withLocalNameScope(tfgen, name, tfgen => {
    for (const policy of policies) {
      createIamRolePolicy(tfgen, iamr, policy);
    }
  });
  return iamr;
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
