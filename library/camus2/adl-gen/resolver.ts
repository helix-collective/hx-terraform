/* @generated from adl */
import { declResolver, ScopedDecl } from "./runtime/adl.ts";
import { _AST_MAP as config } from "./config.ts";
import { _AST_MAP as nginx } from "./nginx.ts";
import { _AST_MAP as release } from "./release.ts";
import { _AST_MAP as state } from "./state.ts";
import { _AST_MAP as sys_annotations } from "./sys/annotations.ts";
import { _AST_MAP as sys_types } from "./sys/types.ts";
import { _AST_MAP as types } from "./types.ts";

export const ADL: { [key: string]: ScopedDecl } = {
  ...config,
  ...nginx,
  ...release,
  ...state,
  ...sys_annotations,
  ...sys_types,
  ...types,
};

export const RESOLVER = declResolver(ADL);
