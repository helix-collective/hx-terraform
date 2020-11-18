/* @generated from adl module adlc.config.cpp */

import * as ADL from './../../runtime/adl';

export interface CppCustomType {
  cppname: string;
  cppincludes: Include[];
  declarationCode: string[];
  serialisationCode: string[];
  generateOrigADLType: string;
}

export function makeCppCustomType(
  input: {
    cppname: string,
    cppincludes?: Include[],
    declarationCode?: string[],
    serialisationCode?: string[],
    generateOrigADLType?: string,
  }
): CppCustomType {
  return {
    cppname: input.cppname,
    cppincludes: input.cppincludes === undefined ? [] : input.cppincludes,
    declarationCode: input.declarationCode === undefined ? [] : input.declarationCode,
    serialisationCode: input.serialisationCode === undefined ? [] : input.serialisationCode,
    generateOrigADLType: input.generateOrigADLType === undefined ? "" : input.generateOrigADLType,
  };
}

const CppCustomType_AST : ADL.ScopedDecl =
  {"moduleName":"adlc.config.cpp","decl":{"annotations":[],"type_":{"kind":"struct_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"cppname","default":{"kind":"nothing"},"name":"cppname","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"cppincludes","default":{"kind":"just","value":[]},"name":"cppincludes","typeExpr":{"typeRef":{"kind":"primitive","value":"Vector"},"parameters":[{"typeRef":{"kind":"reference","value":{"moduleName":"adlc.config.cpp","name":"Include"}},"parameters":[]}]}},{"annotations":[],"serializedName":"declarationCode","default":{"kind":"just","value":[]},"name":"declarationCode","typeExpr":{"typeRef":{"kind":"primitive","value":"Vector"},"parameters":[{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}]}},{"annotations":[],"serializedName":"serialisationCode","default":{"kind":"just","value":[]},"name":"serialisationCode","typeExpr":{"typeRef":{"kind":"primitive","value":"Vector"},"parameters":[{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}]}},{"annotations":[],"serializedName":"generateOrigADLType","default":{"kind":"just","value":""},"name":"generateOrigADLType","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}}]}},"name":"CppCustomType","version":{"kind":"nothing"}}};

export const snCppCustomType: ADL.ScopedName = {moduleName:"adlc.config.cpp", name:"CppCustomType"};

export function texprCppCustomType(): ADL.ATypeExpr<CppCustomType> {
  return {value : {typeRef : {kind: "reference", value : snCppCustomType}, parameters : []}};
}

export interface Include {
  name: string;
  system: boolean;
}

export function makeInclude(
  input: {
    name: string,
    system: boolean,
  }
): Include {
  return {
    name: input.name,
    system: input.system,
  };
}

const Include_AST : ADL.ScopedDecl =
  {"moduleName":"adlc.config.cpp","decl":{"annotations":[],"type_":{"kind":"struct_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"name","default":{"kind":"nothing"},"name":"name","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"system","default":{"kind":"nothing"},"name":"system","typeExpr":{"typeRef":{"kind":"primitive","value":"Bool"},"parameters":[]}}]}},"name":"Include","version":{"kind":"nothing"}}};

export const snInclude: ADL.ScopedName = {moduleName:"adlc.config.cpp", name:"Include"};

export function texprInclude(): ADL.ATypeExpr<Include> {
  return {value : {typeRef : {kind: "reference", value : snInclude}, parameters : []}};
}

export const _AST_MAP: { [key: string]: ADL.ScopedDecl } = {
  "adlc.config.cpp.CppCustomType" : CppCustomType_AST,
  "adlc.config.cpp.Include" : Include_AST
};
