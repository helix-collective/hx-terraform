import * as AT from './types.ts';
import * as TF from '../../core/core.ts';
import * as hcl2 from "../../core/hcl2.ts";

/**
 *  Registers the AWS provider
 *
 *  see https://www.terraform.io/docs/providers/aws/
 */
export function createProvider(
  tfgen: TF.Generator,
  params: AwsParams
): Provider {
  const items = fieldsFromAwsParams(params);
  const provider = tfgen.createProvider('aws', items);
  return provider;
}

export function createProviderVersion(
  tfgen: TF.Generator,
  params: TF.ProviderVersion
): void {
  tfgen.createProviderVersion('aws', params);
}

export interface Provider extends TF.Provider {}

export interface AwsParams {
  region?: AT.Region;
  version?: string;
  alias?: string;
  profile?: string;
  // https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/resource-tagging#ignoring-changes-in-all-resources
  // mapped to
  // ignore_tags {
  //   key_prefixes = ...
  // }
  ignoreTagPrefixes?: string[];
}

export function fieldsFromAwsParams(params: AwsParams): hcl2.BodyItem[] {
  const fields:  hcl2.BodyItem[]  = [];
  if (params.region) {
    fields.push(hcl2.attribute('region', hcl2.stringLit(params.region.value)));
  }
  if (params.version) {
    fields.push(hcl2.attribute('version', hcl2.stringLit(params.version)));
  }
  if (params.alias) {
    fields.push(hcl2.attribute('alias', hcl2.stringLit(params.alias)));
  }
  if (params.profile) {
    fields.push(hcl2.attribute('profile', hcl2.stringLit(params.profile)));
  }
  if (params.ignoreTagPrefixes) {
    const prefixes = params.ignoreTagPrefixes.map((p) => hcl2.stringLit(p));
    fields.push(hcl2.block('ignore_tags', [], [hcl2.attribute('key_prefixes', hcl2.tupleExpr(prefixes))]));
  }
  return fields;
}
