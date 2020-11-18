/* @generated from adl module adlc.config.rust */

import * as ADL from './../../runtime/adl';

/**
 * ADL module or declaration annotation to control
 * whether code is actually generated.
 */
export type RustGenerate = boolean;

const RustGenerate_AST : ADL.ScopedDecl =
  {"moduleName":"adlc.config.rust","decl":{"annotations":[],"type_":{"kind":"type_","value":{"typeParams":[],"typeExpr":{"typeRef":{"kind":"primitive","value":"Bool"},"parameters":[]}}},"name":"RustGenerate","version":{"kind":"nothing"}}};

export const snRustGenerate: ADL.ScopedName = {moduleName:"adlc.config.rust", name:"RustGenerate"};

export function texprRustGenerate(): ADL.ATypeExpr<RustGenerate> {
  return {value : {typeRef : {kind: "reference", value : snRustGenerate}, parameters : []}};
}

export enum RustStorageModel {
  standard,
  boxed,
}

const RustStorageModel_AST : ADL.ScopedDecl =
  {"moduleName":"adlc.config.rust","decl":{"annotations":[],"type_":{"kind":"union_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"standard","default":{"kind":"nothing"},"name":"standard","typeExpr":{"typeRef":{"kind":"primitive","value":"Void"},"parameters":[]}},{"annotations":[],"serializedName":"boxed","default":{"kind":"nothing"},"name":"boxed","typeExpr":{"typeRef":{"kind":"primitive","value":"Void"},"parameters":[]}}]}},"name":"RustStorageModel","version":{"kind":"nothing"}}};

export const snRustStorageModel: ADL.ScopedName = {moduleName:"adlc.config.rust", name:"RustStorageModel"};

export function texprRustStorageModel(): ADL.ATypeExpr<RustStorageModel> {
  return {value : {typeRef : {kind: "reference", value : snRustStorageModel}, parameters : []}};
}

/**
 * ADL declaration annotation to specify that a custom type
 * should be used
 */
export interface RustCustomType {
  rustname: string;
  helpers: string;
  generateOrigADLType: string;
  stdTraits: string[];
}

export function makeRustCustomType(
  input: {
    rustname: string,
    helpers: string,
    generateOrigADLType?: string,
    stdTraits: string[],
  }
): RustCustomType {
  return {
    rustname: input.rustname,
    helpers: input.helpers,
    generateOrigADLType: input.generateOrigADLType === undefined ? "" : input.generateOrigADLType,
    stdTraits: input.stdTraits,
  };
}

const RustCustomType_AST : ADL.ScopedDecl =
  {"moduleName":"adlc.config.rust","decl":{"annotations":[],"type_":{"kind":"struct_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"rustname","default":{"kind":"nothing"},"name":"rustname","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"helpers","default":{"kind":"nothing"},"name":"helpers","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"generateOrigADLType","default":{"kind":"just","value":""},"name":"generateOrigADLType","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"stdTraits","default":{"kind":"nothing"},"name":"stdTraits","typeExpr":{"typeRef":{"kind":"primitive","value":"Vector"},"parameters":[{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}]}}]}},"name":"RustCustomType","version":{"kind":"nothing"}}};

export const snRustCustomType: ADL.ScopedName = {moduleName:"adlc.config.rust", name:"RustCustomType"};

export function texprRustCustomType(): ADL.ATypeExpr<RustCustomType> {
  return {value : {typeRef : {kind: "reference", value : snRustCustomType}, parameters : []}};
}

export const _AST_MAP: { [key: string]: ADL.ScopedDecl } = {
  "adlc.config.rust.RustGenerate" : RustGenerate_AST,
  "adlc.config.rust.RustStorageModel" : RustStorageModel_AST,
  "adlc.config.rust.RustCustomType" : RustCustomType_AST
};
