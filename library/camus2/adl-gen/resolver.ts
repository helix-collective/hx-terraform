import { declResolver, ScopedDecl } from "./runtime/adl";
import { _AST_MAP as state } from "./state";
import { _AST_MAP as types } from "./types";
import { _AST_MAP as config } from "./config";
import { _AST_MAP as release } from "./release";
import { _AST_MAP as nginx } from "./nginx";
import { _AST_MAP as adlc_config_cpp } from "./adlc/config/cpp";
import { _AST_MAP as adlc_config_java } from "./adlc/config/java";
import { _AST_MAP as adlc_config_haskell } from "./adlc/config/haskell";
import { _AST_MAP as adlc_config_typescript } from "./adlc/config/typescript";
import { _AST_MAP as sys_adlast } from "./sys/adlast";
import { _AST_MAP as sys_annotations } from "./sys/annotations";
import { _AST_MAP as sys_dynamic } from "./sys/dynamic";
import { _AST_MAP as sys_types } from "./sys/types";

export const ADL: { [key: string]: ScopedDecl } = {
  ...state,
  ...types,
  ...config,
  ...release,
  ...nginx,
  ...adlc_config_cpp,
  ...adlc_config_java,
  ...adlc_config_haskell,
  ...adlc_config_typescript,
  ...sys_adlast,
  ...sys_annotations,
  ...sys_dynamic,
  ...sys_types,
};

export const RESOLVER = declResolver(ADL);
