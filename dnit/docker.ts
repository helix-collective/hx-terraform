// Utils for running (adl or terraform) in docker:

import {runConsole, path} from './deps.ts';
import {ROOT} from './workingDir.ts';

export async function runTerraform(cmds: string[]): Promise<void> {
  console.log('running: terraform', cmds.join(' '));
  await runConsole(['terraform', ...cmds], {
    cwd: path.join(ROOT, 'terraform'),
  });
}
