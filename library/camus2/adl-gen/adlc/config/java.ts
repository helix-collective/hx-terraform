/* @generated from adl module adlc.config.java */

import * as ADL from './../../runtime/adl';

/**
 * ADL module annotation to specify a target java package.
 */
export type JavaPackage = string;

const JavaPackage_AST : ADL.ScopedDecl =
  {"moduleName":"adlc.config.java","decl":{"annotations":[],"type_":{"kind":"type_","value":{"typeParams":[],"typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}}},"name":"JavaPackage","version":{"kind":"nothing"}}};

export function texprJavaPackage(): ADL.ATypeExpr<JavaPackage> {
  return {value : {typeRef : {kind: "reference", value : {moduleName : "adlc.config.java",name : "JavaPackage"}}, parameters : []}};
}

/**
 * ADL module or declaration annotation to control
 * whether code is actually generated.
 */
export type JavaGenerate = boolean;

const JavaGenerate_AST : ADL.ScopedDecl =
  {"moduleName":"adlc.config.java","decl":{"annotations":[],"type_":{"kind":"type_","value":{"typeParams":[],"typeExpr":{"typeRef":{"kind":"primitive","value":"Bool"},"parameters":[]}}},"name":"JavaGenerate","version":{"kind":"nothing"}}};

export function texprJavaGenerate(): ADL.ATypeExpr<JavaGenerate> {
  return {value : {typeRef : {kind: "reference", value : {moduleName : "adlc.config.java",name : "JavaGenerate"}}, parameters : []}};
}

/**
 * ADL declaration annotation to specify that a custom type
 * should be used
 */
export interface JavaCustomType {
  javaname: string;
  helpers: string;
  generateType: boolean;
}

export function makeJavaCustomType(
  input: {
    javaname: string,
    helpers: string,
    generateType?: boolean,
  }
): JavaCustomType {
  return {
    javaname: input.javaname,
    helpers: input.helpers,
    generateType: input.generateType === undefined ? false : input.generateType,
  };
}

const JavaCustomType_AST : ADL.ScopedDecl =
  {"moduleName":"adlc.config.java","decl":{"annotations":[],"type_":{"kind":"struct_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"javaname","default":{"kind":"nothing"},"name":"javaname","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"helpers","default":{"kind":"nothing"},"name":"helpers","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"generateType","default":{"kind":"just","value":false},"name":"generateType","typeExpr":{"typeRef":{"kind":"primitive","value":"Bool"},"parameters":[]}}]}},"name":"JavaCustomType","version":{"kind":"nothing"}}};

export function texprJavaCustomType(): ADL.ATypeExpr<JavaCustomType> {
  return {value : {typeRef : {kind: "reference", value : {moduleName : "adlc.config.java",name : "JavaCustomType"}}, parameters : []}};
}

export const _AST_MAP: { [key: string]: ADL.ScopedDecl } = {
  "adlc.config.java.JavaPackage" : JavaPackage_AST,
  "adlc.config.java.JavaGenerate" : JavaGenerate_AST,
  "adlc.config.java.JavaCustomType" : JavaCustomType_AST
};
