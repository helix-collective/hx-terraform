import { declResolver, ScopedDecl } from "./runtime/adl";
import { _AST_MAP as systypes } from "./sys/types";
import { _AST_MAP as config } from "./config";
import { _AST_MAP as types } from "./types";
export const ADL: { [key: string]: ScopedDecl } = {
  ...systypes,
  ...config,
  ...types,
};

export const RESOLVER = declResolver(ADL);
