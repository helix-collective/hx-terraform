// Utils for running (adl or terraform) in docker:

import {runConsole, path} from './deps.ts';
import {ROOT} from './workingDir.ts';

export async function runTerraform(cmds: string[]): Promise<void> {

  // add ROOT/tools to the path so `hx-provisioning-tools` can be found
  // by terraform
  let PATH = Deno.env.get('PATH');
  if (PATH === undefined) {
    throw new Error("PATH not defined");
  }
  PATH = path.join(ROOT,'tools') + ':' + PATH;

  console.log('running: terraform', cmds.join(' '));
  await runConsole(['terraform', ...cmds], {
    cwd: path.join(ROOT, 'terraform'),
    env: {
      ...Deno.env.toObject(),
      PATH,
    }
  });
}
