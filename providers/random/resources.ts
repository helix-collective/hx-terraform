/** Automatically @generated by gen-providers.ts, DO NOT EDIT */

import * as _ from "lodash";
import * as TF from "../../core/core";

/**
 *  The resource random_string generates a random permutation of alphanumeric characters and optionally special characters.
 *
 *  see https://www.terraform.io/docs/providers/random/r/string.html
 */
export function createRandomString(tfgen: TF.Generator, rname: string, params: RandomStringParams): String {
  const fields = fieldsFromRandomStringParams(params);
  const resource = tfgen.createTypedResource('String', 'random_string', rname, fields);
  const result: string =  '${' + TF.resourceName(resource) + '.result}';

  return {
    ...resource,
    result,
  };
}

export interface String extends TF.ResourceT<'String'> {
  result: string;
}

export type StringId = {type:'StringId',value:string};

export interface RandomStringParams {
  length: number;
}

export function fieldsFromRandomStringParams(params: RandomStringParams) : TF.ResourceFieldMap {
  const fields: TF.ResourceFieldMap = [];
  TF.addField(fields, "length", params.length, TF.numberValue);
  return fields;
}
