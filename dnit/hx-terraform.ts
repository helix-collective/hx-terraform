// Tasks from 'hx-terraform' ie generating providers and generating terraform

import { runAlways, asyncFiles, runConsole, Task, TrackedFile, trackFile, path, task } from './deps.ts'
import type { TasksObject } from "./types.ts";
import { rglobfiles } from './filesystem.ts';

import {ROOT} from './workingDir.ts'
import { YarnTasks } from './yarn.ts';

/// Manifests help dependency tracking
// changes to backend result in re-run of terraform init
// changes to backend and providers result in re-run of terraform init
export type Manifests = {
  adhoc: TrackedFile;
  backend: TrackedFile;
  providers: TrackedFile;
  resources: TrackedFile;
};

export interface HxTerraformTasks extends TasksObject {
  tasks: {
    generateProviders: Task;
    generateTerraform: Task;
    generate: Task;
  },
  generatedProviderSrcs: TrackedFile[];
  manifests: Manifests;
};

export async function makeHxTerraformTasks(params: {yarn: YarnTasks}) : Promise<HxTerraformTasks> {
  const {yarn} = params;

  // typescript terraform providers generated:
  const generatedProviderSrcs = [
    trackFile(
      path.join(ROOT, 'typescript/hx-terraform/providers/aws/resources.ts')),
    trackFile(
      path.join(ROOT, 'typescript/hx-terraform/providers/random/resources.ts')
    ),
  ];

  const generateProviders = task({
    name: 'generateProviders',
    description: 'Generate typescript for providers',
    action: async () => {
      await runConsole(
        ['npx', 'ts-node', 'hx-terraform/tools/gen-providers.ts'],
        {
          cwd: path.join(ROOT, 'typescript'),
        }
      );
    },
    deps: [
      yarn.tasks.local,
      yarn.tasks.hxTerraform,

      trackFile(path.join(ROOT, 'typescript/hx-terraform/tools/gen-helpers.ts')),
      trackFile(path.join(ROOT, 'typescript/hx-terraform/tools/gen-providers.ts')),

      asyncFiles(async ()=>{
        // all provider sources other than (the generated) resources.ts
        const providers = await rglobfiles(path.join(ROOT, 'typescript/hx-terraform/providers'), {
          skip: [/.*resources.ts/],
        });
        return providers.map(trackFile)
      })
    ],
    targets: generatedProviderSrcs
  });

  const manifests : Manifests = {
    adhoc: trackFile(path.join(ROOT, 'terraform/.manifest.adhoc')),
    backend: trackFile(path.join(ROOT, 'terraform/.manifest.backend')),
    providers: trackFile(path.join(ROOT, 'terraform/.manifest.providers')),
    resources: trackFile(path.join(ROOT, 'terraform/.manifest.resources')),
  };

  const generateTerraform = task({
    name: 'generateTerraform',
    description: 'Generate terraform files from the terraform EDSL',
    action: async () => {
      await runConsole(['npx','ts-node', 'main.ts'], {
        cwd: path.join(ROOT, 'typescript'),
      });
    },
    deps: [
      yarn.tasks.local,
      yarn.tasks.hxTerraform,
      generateProviders,
      ...generatedProviderSrcs,
      asyncFiles(async ()=>{
        // all typescript sources excl node_modules
        const sources = await rglobfiles(path.join(ROOT, 'typescript'), {
          skip: [/node_modules/, /typescript\/build/],
        });
        return sources.map(trackFile)
      })
    ],
    targets: Object.values(manifests),
  });

  const generate = task({
    name: 'generate',
    description: 'Alias of generateTerraform',
    action: async () => {
    },
    deps: [
      generateTerraform
    ]
  });

  return {
    tasks: {
      generateProviders,
      generateTerraform,
      generate
    },
    generatedProviderSrcs,
    manifests
  };
}
