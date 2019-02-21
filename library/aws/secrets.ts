import * as TF from '../../core/core';
import * as AR from '../../providers/aws/resources';
import _ from 'lodash';
import { ArnT } from '../../providers/aws/types';
import { DESTRUCTION } from 'dns';

export type ArnSecret = ArnT<'SecretsmanagerSecret'>;

export interface JsonSecretParams {
  description?: string,
  initial_value?: {}
};

/**
 * Create a JSON secret in the AWS Secrets manager.
 * 
 * An initial value may be provided, which can be manually updated later.
 */
export function createJsonSecret(tfgen: TF.Generator, name: string, params: JsonSecretParams) {
    const secret = AR.createSecretsmanagerSecret(tfgen, name, {
      name: tfgen.scopedName(name).join("_").replace(/-/g,"_"),
      tags: tfgen.tagsContext(),
      description: params.description
    });
    
    AR.createSecretsmanagerSecretVersion( tfgen, name, {
      secret_id: secret.id,
      secret_string: JSON.stringify(params.initial_value || {}, null, 2)
    });

    return secret;
}