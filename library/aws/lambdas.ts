import * as TF from '../../core/core.ts';
import * as AR from '../../providers/aws/resources.ts';
import * as AT from '../../providers/aws/types.ts';
import * as shared from '../aws/shared.ts';
import * as util from '../util.ts';

export interface VpcLambdaFunctionParams {
  handler: string;
  runtime: AT.LambdaRuntime;
  role_arn: AT.ArnT<'IamRole'>;
  invoke_principal: InvokePrincipal;
  customize?: util.Customize<AR.LambdaFunctionParams>;
}

type InvokePrincipal = 'apigateway.amazonaws.com' | 's3.amazonaws.com';

/**
 * Construct a lambda function permissioned to run in the shared VPC
 *
 * Note that the specified role must include the lambda_in_vpc_policy, or equivalent
 */
export function createLambdaFunctionInVpc(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  params: VpcLambdaFunctionParams
): AR.LambdaFunction {
  const lparams = {
    function_name: tfgen.scopedName(name).join('_'),
    role: params.role_arn,
    runtime: params.runtime,
    handler: params.handler,
    vpc_config: {
      subnet_ids: shared.internalSubnetIds(sr),
      security_group_ids: [sr.lambda_security_group.id],
    },
    tags: tfgen.tagsContext(),
  };
  util.applyCustomize(params.customize, lparams);
  const lambda = AR.createLambdaFunction(tfgen, name, lparams);
  AR.createLambdaPermission(tfgen, name, {
    action: AT.lambda_InvokeFunction,
    function_name: lambda.function_name,
    principal: params.invoke_principal,
  });
  return lambda;
}
