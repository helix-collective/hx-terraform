import * as TF from '../../core/core.ts';
import * as AR from '../../providers/aws/resources.ts';
import { ArnT } from '../../providers/aws/types.ts';
import { SharedResources } from './shared.ts';

export type ArnSecret = ArnT<'SecretsmanagerSecret'>;

export type JsonSecretParams = Partial<AR.SecretsmanagerSecretParams> & {
  description?: string;
  initial_value?: {};
}

/**
 * Create a JSON secret in the AWS Secrets manager.
 *
 * An initial value may be provided, which can be manually updated later.
 */
export function createJsonSecret(
  tfgen: TF.Generator,
  name: string,
  params: JsonSecretParams
) {
  const secret = AR.createSecretsmanagerSecret(tfgen, name, {
    ...params,
    name: tfgen
      .scopedName(name)
      .join('_')
      .replace(/-/g, '_'),
    tags: tfgen.tagsContext(),
    description: params.description,
  });

  AR.createSecretsmanagerSecretVersion(tfgen, name, {
    secret_id: secret.id,
    secret_string: JSON.stringify(params.initial_value || {}, null, 2),
  });

  return secret;
}

/**
 * Create a JSON secret in the AWS Secrets manager, initialized with a random string.
 *
 * The secret will have structure:
 *
 *    { "secret", "XXXXXX" }
 *
 */
export function createRandomJsonSecret(
  tfgen: TF.Generator,
  name: string,
  sr: SharedResources,
  params: JsonSecretParams
) {
  const secret = AR.createSecretsmanagerSecret(tfgen, name, {
    name: tfgen
      .scopedName(name)
      .join('_')
      .replace(/-/g, '_'),
    tags: tfgen.tagsContext(),
    description: params.description,
  });
  const size = 20;

  tfgen.localExecProvisioner(
    secret,
    [
      '# Generate a random password for the secrets initial value',
      `export AWS_REGION=${sr.region.value}`,
      `hx-provisioning-tools generate-password --size ${size} --to-secret ${
        secret.arn.value
      }`,
    ].join('\n')
  );

  return secret;
}
