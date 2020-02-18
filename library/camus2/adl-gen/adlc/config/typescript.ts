/* @generated from adl module adlc.config.typescript */

import * as ADL from './../../runtime/adl';

/**
 * ADL module or declaration annotation to control
 * whether code is actually generated.
 */
export type TypescriptGenerate = boolean;

const TypescriptGenerate_AST : ADL.ScopedDecl =
  {"moduleName":"adlc.config.typescript","decl":{"annotations":[],"type_":{"kind":"type_","value":{"typeParams":[],"typeExpr":{"typeRef":{"kind":"primitive","value":"Bool"},"parameters":[]}}},"name":"TypescriptGenerate","version":{"kind":"nothing"}}};

export function texprTypescriptGenerate(): ADL.ATypeExpr<TypescriptGenerate> {
  return {value : {typeRef : {kind: "reference", value : {moduleName : "adlc.config.typescript",name : "TypescriptGenerate"}}, parameters : []}};
}

export const _AST_MAP: { [key: string]: ADL.ScopedDecl } = {
  "adlc.config.typescript.TypescriptGenerate" : TypescriptGenerate_AST
};
