import * as AT from './types.ts';
import * as TF from '../../core/core.ts';

/**
 *  Registers the AWS provider
 *
 *  see https://www.terraform.io/docs/providers/aws/
 */
export function createProvider(
  tfgen: TF.Generator,
  params: AwsParams
): Provider {
  const fields = fieldsFromAwsParams(params);
  const provider = tfgen.createProvider('aws', fields);
  return provider;
}

export interface Provider extends TF.Provider {}

export interface AwsParams {
  region?: AT.Region;
  version?: string;
  alias?: string;
}

export function fieldsFromAwsParams(params: AwsParams): TF.ResourceFieldMap {
  const fields: TF.ResourceFieldMap = [];
  TF.addOptionalField(fields, 'region', params.region, TF.stringAliasValue);
  TF.addOptionalField(fields, 'alias', params.alias, TF.stringValue);
  TF.addOptionalField(fields, 'version', params.version, TF.stringValue);
  return fields;
}
