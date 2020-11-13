// Tasks for nodejs yarn dependencies:

import {task, runConsole, trackFile, path, Task} from './deps.ts'
import type { TasksObject } from './types.ts';

import {ROOT} from './workingDir.ts'

export interface YarnTasks extends TasksObject {
  tasks: {
    local : Task;
    hxTerraform: Task;
  },
};

export async function makeYarnTasks({}) : Promise<YarnTasks> {

  /** Make a task to run yarn for node modules in a directory
   * @param dir: The directory containing node_modules, package.json, and yarn.lock
   */
  function makeYarnTask(name: string, dir: string) {
    return task({
      name,
      description: `Run yarn for node modules in ${dir}`,
      action: async () => {
        await runConsole(['yarn'], {
          cwd: dir,
        });
      },
      deps: [
        trackFile(path.join(dir, 'package.json')),
        trackFile(path.join(dir, 'yarn.lock')),
      ],
    });
  }

  // Tasks for yarn:
  // These are actually symlinked so they share package.json
  const yarnLocal = makeYarnTask("yarnLocal", path.join(ROOT, 'typescript'));
  const yarnHxTerraform = makeYarnTask("yarnHxTerraform", path.join(ROOT, 'typescript', 'hx-terraform'));

  return {
    tasks: {
      local: yarnLocal,
      hxTerraform: yarnHxTerraform,
    }
  };
}



