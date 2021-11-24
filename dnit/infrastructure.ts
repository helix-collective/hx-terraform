import { makeCamus2Tasks, Camus2Tasks } from './camus2.ts';
import { makeHxTerraformTasks, HxTerraformTasks } from './hx-terraform.ts';
import { makeLambdaTasks, LambdaTasks } from './lamdas.ts';
import { makeTerraformTasks, TerraformTasks } from './terraform.ts';
import type { GroupsTasksObject } from "./types.ts";

export interface InfraTasks extends GroupsTasksObject {
  lambda: LambdaTasks;
  hxTerraform: HxTerraformTasks;
  terraform: TerraformTasks;
  camus2: Camus2Tasks;
};

/** Make tasks needed for operating typescript/terraform infrastructure */
export async function makeInfraTasks(ageThresholdMs: number = 5 * 60 * 1000): Promise<InfraTasks> {
  const lambda = await makeLambdaTasks({});
  const camus2 = await makeCamus2Tasks({});
  const hxTerraform = await makeHxTerraformTasks({})
  const terraform = await makeTerraformTasks({lambda, hxTerraform}, ageThresholdMs);

  return {
    camus2,
    lambda,
    hxTerraform,
    terraform,
  };
}
