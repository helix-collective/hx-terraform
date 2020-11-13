import { makeCamus2Tasks, Camus2Tasks } from './camus2.ts';
import { makeYarnTasks, YarnTasks } from './yarn.ts';
import { makeHxTerraformTasks, HxTerraformTasks } from './hx-terraform.ts';
import { makeLambdaTasks, LambdaTasks } from './lamdas.ts';
import { makeTerraformTasks, TerraformTasks } from './terraform.ts';
import type { GroupsTasksObject } from "./types.ts";

export interface InfraTasks extends GroupsTasksObject {
  yarn: YarnTasks;
  lambda: LambdaTasks;
  hxTerraform: HxTerraformTasks;
  terraform: TerraformTasks;
  camus2: Camus2Tasks;
};

/** Make tasks needed for operating typescript/terraform infrastructure */
export async function makeInfraTasks(): Promise<InfraTasks> {
  const lambda = await makeLambdaTasks({});
  const camus2 = await makeCamus2Tasks({});
  const yarn = await makeYarnTasks({});
  const hxTerraform = await makeHxTerraformTasks({yarn})
  const terraform = await makeTerraformTasks({lambda, hxTerraform});

  return {
    yarn,
    camus2,
    lambda,
    hxTerraform,
    terraform,
  };
}
