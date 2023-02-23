// Tasks for running terraform itself:

import { confirmation, asyncFiles, runAlways, Task, TrackedFile, trackFile, path, task, TaskContext } from './deps.ts'
import { fileAgeMs, removeIfExists, rglobfiles } from './filesystem.ts';
import { runTerraform } from './docker.ts';
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
}

export interface TerraformDeps extends GroupsTasksObject {
  lambda: LambdaTasks,
  hxTerraform: HxTerraformTasks
}

/**
 * Convert dnit args to terraform args
 *
 * E.g. `dnit plan --refresh=false` will produce `-refresh=false` accepted by terraform
 */
function constructExtraArgs(ctx: TaskContext) : string[] {
  // Convert value args. E.g. --foo=bar
  const extraArgs : string[] = Object.entries(ctx.args)
    .filter(([k]) => k !== '_')
    .map(([k, v]) => `-${k}=${v}`);

  // Convert flag args
  extraArgs.concat(ctx.args._.map(v => `-${v}`));

  return extraArgs;
}

export async function makeTerraformTasks(deps: TerraformDeps) : Promise<TerraformTasks> {
  const terraformInit = task({
    name: 'init',
    description:
      '(Re)Initialize terraform on initial setup and/or changes to backend/provider',
    action: async () => {
      await runTerraform(['init', '--force-copy']);
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
    action: async ctx => {
      const extraArgs = constructExtraArgs(ctx);
      await runTerraform(['plan', '-parallelism=20', '-out=tfplan'].concat(extraArgs));
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

        // Ensure the plan is not too old - 20 minutes should be reasonably enough
        const ageThresholdMs = 20 * 60 * 1000;

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

        const extraArgs = constructExtraArgs(ctx);
        await runTerraform(['apply', 'tfplan'].concat(extraArgs));
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
      await runTerraform(['refresh']);
    },
    uptodate: runAlways,
  });

  const terraformOutput = task({
    name: 'output',
    description: 'Run terraform to show terraform outputs',
    action: async () => {
      await runTerraform(['output']);
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
