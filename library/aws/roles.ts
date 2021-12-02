import * as TF from '../../core/core.ts';
import * as AT from '../../providers/aws/types.ts';
import * as AR from '../../providers/aws/resources.ts';
import { assume_role_policy, NamedPolicy } from './policies.ts';

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
  // > If you use this resource's managed_policy_arns argument or inline_policy
  // > configuration blocks, this resource will take over exclusive management of
  // > the role's respective policy types (e.g., both policy types if both
  // > arguments are used). These arguments are incompatible with other ways of
  // > managing a role's policies, such as aws_iam_policy_attachment,
  // > aws_iam_role_policy_attachment, and aws_iam_role_policy. If you attempt to
  // > manage a role's policies by multiple means, you will get resource cycling
  // > and/or errors.
  tfgen.ignoreChanges(iamr, 'inline_policy');
  tfgen.ignoreChanges(iamr, 'managed_policy_arns');

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

/**
 *  Create an IAM user with the specified polices
 */
export function createIamUserWithPolicies(
  tfgen: TF.Generator,
  name: string,
  policies: NamedPolicy[]
): AR.IamUser {
  const u = AR.createIamUser(tfgen, name, {
    name: tfgen.scopedName(name).join('_'),
  });
  policies.forEach(p => {
    const pname = name + '_' + p.name;
    AR.createIamUserPolicy(tfgen, pname, {
      name: tfgen.scopedName(pname).join('_'),
      policy: JSON.stringify(p.policy, null, 2),
      user: u.name,
    });
  });
  return u;
}
