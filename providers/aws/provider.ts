import * as _ from 'lodash';
import * as AT from './types';
import * as TF from '../../core/core';

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
}

export function fieldsFromAwsParams(params: AwsParams): TF.ResourceFieldMap {
  const fields: TF.ResourceFieldMap = [];
  TF.addOptionalField(fields, 'region', params.region, TF.stringAliasValue);
  TF.addOptionalField(fields, 'version', params.version, TF.stringValue);
  return fields;
}
