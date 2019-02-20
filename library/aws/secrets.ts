import * as TF from '../../core/core';
import * as AR from '../../providers/aws/resources';
import _ from 'lodash';

/**
 * Create an initialy empty secret in the  AWS Secrets manager.
 * 
 * It is expected that the contents will be subsequently updated manually.
 */
export function createEmptyJsonSecret(tfgen: TF.Generator, name: string, params0: AR.SecretsmanagerSecretParams) {
    let params =_.cloneDeep(params0);
    params.tags = {
      ...tfgen.tagsContext(),
      ...params.tags,
    };
    const secret = AR.createSecretsmanagerSecret(tfgen, name, params);
    
    AR.createSecretsmanagerSecretVersion( tfgen, name, {
      secret_id: secret.id,
      secret_string: "{}"
    });
}