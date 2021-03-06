// Tasks for running terraform itself:

import { confirmation, asyncFiles, runAlways, Task, TrackedFile, trackFile, path, task } from './deps.ts'
import { fileAgeMs, removeIfExists, rglobfiles } from './filesystem.ts';
import { runDockerizedTerraform } from './docker.ts';
import { HxTerraformTasks } from './hx-terraform.ts';
import { LambdaTasks } from './lamdas.ts';
import { GroupsTasksObject, TasksObject } from './types.ts';

import { ROOT } from './workingDir.ts';

export interface TerraformTasks extends TasksObject {
  tasks: {
    init: Task;
    plan: Task;
    apply: Task;
    refresh: Task;
    output: Task;
  };

  generatedTerraformPlan: TrackedFile;
};

export interface TerraformDeps extends GroupsTasksObject {
  lambda: LambdaTasks,
  hxTerraform: HxTerraformTasks
};

export async function makeTerraformTasks(deps: TerraformDeps) : Promise<TerraformTasks> {
  const terraformInit = task({
    name: 'init',
    description:
      '(Re)Initialize terraform on initial setup and/or changes to backend/provider',
    action: async () => {
      await runDockerizedTerraform(['init', '--force-copy']);
    },
    deps: [
      deps.hxTerraform.manifests.backend,
      deps.hxTerraform.manifests.providers,
    ],
  });

  const generatedTerraformPlan = trackFile(path.join(ROOT, 'terraform', 'tfplan'));

  const terraformPlan = task({
    name: 'plan',
    description:
      'Execute terraform plan to show pending infrastructure changes and save the plan',
    action: async () => {
      await runDockerizedTerraform(['plan', '-parallelism=20', '-out=tfplan']);
    },
    deps: [
      terraformInit,
      ...Object.values(deps.lambda.tasks),
      ...Object.values(deps.hxTerraform.manifests),

      asyncFiles(async ()=>{
        const terraformFiles = await rglobfiles(path.join(ROOT, 'terraform'), {
          exts: ['.tf'],
        });
        return terraformFiles.map(trackFile);
      })
    ],
    targets: [generatedTerraformPlan],
    uptodate: runAlways,
  });

  const terraformApply = task({
    name: 'apply',
    description:
      'Execute terraform apply to make any pending infrastructure changes according to the plan',
    action: async ctx => {
      try {
        if (!(await generatedTerraformPlan.exists())) {
          throw new Error("No plan file found - Run 'dnit plan' first.");
        }

        // Ensure the plan is not too old - couple of minutes
        const ageThresholdMs = 5 * 60 * 1000;

        const planAgeMs = await fileAgeMs(generatedTerraformPlan.path);
        if (planAgeMs > ageThresholdMs) {
          throw new Error("Plan expired. Run 'dnit plan' again.");
        }

        // get confirmation:
        const ok = await confirmation(
          'You are about to apply changes to live infrastructure\n' +
            'Please confirm you have checked the plan and wish to proceed\n' +
            'by entering y',
          false
        );

        if (!ok) {
          throw new Error('Apply aborted');
        }

        await runDockerizedTerraform(['apply', 'tfplan']);
      }
      finally {
        // remove the former plan after use or error
        await removeIfExists(generatedTerraformPlan.path);
      }
    },
    uptodate: runAlways,
  });

  const terraformRefresh = task({
    name: 'refresh',
    description:
      'Run terraform refresh to update state from current deployed resources',
    action: async () => {
      await runDockerizedTerraform(['refresh']);
    },
    uptodate: runAlways,
  });

  const terraformOutput = task({
    name: 'output',
    description: 'Run terraform to show terraform outputs',
    action: async () => {
      await runDockerizedTerraform(['output']);
    },
    uptodate: runAlways,
  });

  return {
    tasks: {
      init: terraformInit,
      plan: terraformPlan,
      apply: terraformApply,
      refresh: terraformRefresh,
      output: terraformOutput,
    },

    generatedTerraformPlan
  };
}
