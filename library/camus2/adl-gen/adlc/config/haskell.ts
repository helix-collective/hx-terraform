/* @generated from adl module adlc.config.haskell */

import * as ADL from './../../runtime/adl';

/**
 * Annotation to override the field prefix for structs
 * and unions. It may be applied to the struct or union
 * declaration or to individual fields.
 */
export type HaskellFieldPrefix = string;

const HaskellFieldPrefix_AST : ADL.ScopedDecl =
  {"moduleName":"adlc.config.haskell","decl":{"annotations":[],"type_":{"kind":"type_","value":{"typeParams":[],"typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}}},"name":"HaskellFieldPrefix","version":{"kind":"nothing"}}};

export function texprHaskellFieldPrefix(): ADL.ATypeExpr<HaskellFieldPrefix> {
  return {value : {typeRef : {kind: "reference", value : {moduleName : "adlc.config.haskell",name : "HaskellFieldPrefix"}}, parameters : []}};
}

export interface UnionConstructor {
  fieldName: string;
  constructor: string;
}

export function makeUnionConstructor(
  input: {
    fieldName: string,
    constructor: string,
  }
): UnionConstructor {
  return {
    fieldName: input.fieldName,
    constructor: input.constructor,
  };
}

const UnionConstructor_AST : ADL.ScopedDecl =
  {"moduleName":"adlc.config.haskell","decl":{"annotations":[],"type_":{"kind":"struct_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"fieldName","default":{"kind":"nothing"},"name":"fieldName","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"constructor","default":{"kind":"nothing"},"name":"constructor","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}}]}},"name":"UnionConstructor","version":{"kind":"nothing"}}};

export function texprUnionConstructor(): ADL.ATypeExpr<UnionConstructor> {
  return {value : {typeRef : {kind: "reference", value : {moduleName : "adlc.config.haskell",name : "UnionConstructor"}}, parameters : []}};
}

export interface HaskellCustomType {
  haskellname: string;
  haskellimports: string[];
  insertCode: string[];
  generateOrigADLType: string;
  structConstructor: string;
  unionConstructors: UnionConstructor[];
}

export function makeHaskellCustomType(
  input: {
    haskellname: string,
    haskellimports: string[],
    insertCode: string[],
    generateOrigADLType?: string,
    structConstructor?: string,
    unionConstructors?: UnionConstructor[],
  }
): HaskellCustomType {
  return {
    haskellname: input.haskellname,
    haskellimports: input.haskellimports,
    insertCode: input.insertCode,
    generateOrigADLType: input.generateOrigADLType === undefined ? "" : input.generateOrigADLType,
    structConstructor: input.structConstructor === undefined ? "" : input.structConstructor,
    unionConstructors: input.unionConstructors === undefined ? [] : input.unionConstructors,
  };
}

const HaskellCustomType_AST : ADL.ScopedDecl =
  {"moduleName":"adlc.config.haskell","decl":{"annotations":[],"type_":{"kind":"struct_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"haskellname","default":{"kind":"nothing"},"name":"haskellname","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"haskellimports","default":{"kind":"nothing"},"name":"haskellimports","typeExpr":{"typeRef":{"kind":"primitive","value":"Vector"},"parameters":[{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}]}},{"annotations":[],"serializedName":"insertCode","default":{"kind":"nothing"},"name":"insertCode","typeExpr":{"typeRef":{"kind":"primitive","value":"Vector"},"parameters":[{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}]}},{"annotations":[],"serializedName":"generateOrigADLType","default":{"kind":"just","value":""},"name":"generateOrigADLType","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"structConstructor","default":{"kind":"just","value":""},"name":"structConstructor","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"unionConstructors","default":{"kind":"just","value":[]},"name":"unionConstructors","typeExpr":{"typeRef":{"kind":"primitive","value":"Vector"},"parameters":[{"typeRef":{"kind":"reference","value":{"moduleName":"adlc.config.haskell","name":"UnionConstructor"}},"parameters":[]}]}}]}},"name":"HaskellCustomType","version":{"kind":"nothing"}}};

export function texprHaskellCustomType(): ADL.ATypeExpr<HaskellCustomType> {
  return {value : {typeRef : {kind: "reference", value : {moduleName : "adlc.config.haskell",name : "HaskellCustomType"}}, parameters : []}};
}

export const _AST_MAP: { [key: string]: ADL.ScopedDecl } = {
  "adlc.config.haskell.HaskellFieldPrefix" : HaskellFieldPrefix_AST,
  "adlc.config.haskell.UnionConstructor" : UnionConstructor_AST,
  "adlc.config.haskell.HaskellCustomType" : HaskellCustomType_AST
};
