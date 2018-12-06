/* @generated from adl module state */

import * as ADL from './runtime/adl';
import * as types from './types';

export interface State {
  deploys: {[key: string]: Deploy};
  connections: {[key: string]: types.DeployLabel};
}

export function makeState(
  input: {
    deploys: {[key: string]: Deploy},
    connections: {[key: string]: types.DeployLabel},
  }
): State {
  return {
    deploys: input.deploys,
    connections: input.connections,
  };
}

const State_AST : ADL.ScopedDecl =
  {"moduleName":"state","decl":{"annotations":[],"type_":{"kind":"struct_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"deploys","default":{"kind":"nothing"},"name":"deploys","typeExpr":{"typeRef":{"kind":"primitive","value":"StringMap"},"parameters":[{"typeRef":{"kind":"reference","value":{"moduleName":"state","name":"Deploy"}},"parameters":[]}]}},{"annotations":[],"serializedName":"connections","default":{"kind":"nothing"},"name":"connections","typeExpr":{"typeRef":{"kind":"primitive","value":"StringMap"},"parameters":[{"typeRef":{"kind":"reference","value":{"moduleName":"types","name":"DeployLabel"}},"parameters":[]}]}}]}},"name":"State","version":{"kind":"nothing"}}};

export function texprState(): ADL.ATypeExpr<State> {
  return {value : {typeRef : {kind: "reference", value : {moduleName : "state",name : "State"}}, parameters : []}};
}

export interface Deploy {
  label: types.DeployLabel;
  release: string;
  port: number;
}

export function makeDeploy(
  input: {
    label: types.DeployLabel,
    release: string,
    port: number,
  }
): Deploy {
  return {
    label: input.label,
    release: input.release,
    port: input.port,
  };
}

const Deploy_AST : ADL.ScopedDecl =
  {"moduleName":"state","decl":{"annotations":[],"type_":{"kind":"struct_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"label","default":{"kind":"nothing"},"name":"label","typeExpr":{"typeRef":{"kind":"reference","value":{"moduleName":"types","name":"DeployLabel"}},"parameters":[]}},{"annotations":[],"serializedName":"release","default":{"kind":"nothing"},"name":"release","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"port","default":{"kind":"nothing"},"name":"port","typeExpr":{"typeRef":{"kind":"primitive","value":"Word32"},"parameters":[]}}]}},"name":"Deploy","version":{"kind":"nothing"}}};

export function texprDeploy(): ADL.ATypeExpr<Deploy> {
  return {value : {typeRef : {kind: "reference", value : {moduleName : "state",name : "Deploy"}}, parameters : []}};
}

export const _AST_MAP: { [key: string]: ADL.ScopedDecl } = {
  "state.State" : State_AST,
  "state.Deploy" : Deploy_AST
};
