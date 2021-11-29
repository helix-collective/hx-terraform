import * as TF from '../../core/core.ts';

/**
 *  Registers the random provider
 *
 *  see https://www.terraform.io/docs/providers/random/
 */
export function createProvider(tfgen: TF.Generator): Provider {
  const provider = tfgen.createProvider('random', []);
  return provider;
}

export interface Provider extends TF.Provider {}
