// Utils for running (adl or terraform) in docker:

import {currentUserOpts, dockerRun, dockerRunConsole} from './deps.ts'

/** Run dockerized terraform image - interactive IO */
export async function runDockerizedTerraform(cmds: string[]): Promise<void> {
  // Use helix's packaged terraform and associated tools
  // from the image helixta/terraform at this version:
  // const TERRAFORM_IMAGE = 'helixta/terraform:2019-03-11';
  const TERRAFORM_IMAGE = 'hashicorp/terraform:0.15.3';

  // run as user for writing out the plan:
  const asUser = await currentUserOpts();

  await dockerRunConsole(TERRAFORM_IMAGE, {
    interactive: true,
    user: asUser.user,
    cmds: [...cmds],
    mounts: [
      ...asUser.mounts,
      {
        // mount the terraform sources:
        type: 'bind',
        source: Deno.cwd(),
        target: '/src',
      },
    ],
    workdir: '/src/terraform',

    envvars: [
      // pass-through listed environment variables
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SHARED_CREDENTIALS_FILE',
      'AWS_PROFILE',
      'AWS_SESSION_TOKEN',
      'TF_LOG',
      'HOME',
    ],
  });
}
