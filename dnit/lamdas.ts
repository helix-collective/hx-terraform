// Tasks for wrangling sources for lambda functions.

import { runConsole, Task, changeCase } from './deps.ts'

import { TrackedFile, trackFile, path, task } from './deps.ts'
import { rglobfiles } from './filesystem.ts';
import { generateZip } from './zip.ts';

import { ROOT } from './workingDir.ts'
import { TasksObject } from './types.ts';

export interface LambdaTasks extends TasksObject {
  tasks: {
    // typescriptBuild: Task;
  },
  trackedFiles: {
    lambdaSourceFiles: TrackedFile[];
  }
};

/** make tasks for building AWS lambda functions */
export async function makeLambdaTasks({}): Promise<LambdaTasks> {
 // // elastisearch cleaning tool:
 // const esToolBuildFile = trackFile(
 //   path.join(ROOT, 'gen-terraform/build/hx-terraform/tools/es-tool.js')
 // );

 // /// Builds entire typescript tree in order to get es-tool.js built.  TODO: refactor es-tool to different typescript tree.
 // const typescriptBuild = task({
 //   name: 'typescriptBuild',
 //   description: 'yarn build typescript tree',
 //   action: async () => {
 //     await runConsole(['yarn', 'build'], {
 //       cwd: path.join(ROOT, 'gen-terraform'),
 //     });
 //   },
 //   deps: [trackFile(path.join(ROOT, 'gen-terraform/hx-terraform/tools/es-tool.ts'))],
 //   targets: [esToolBuildFile],
 // });

  // other (python) source lambdas that only need copy and zip (no build step):
  // any possible lamdas in projects' repos:
  const local_lambda_zip_sources = path.join(ROOT, 'lambdas');

  // lamdas in hx-terraform aws lambdas:
  const lambda_zip_sources = path.join(
    ROOT,
    'gen-terraform/hx-terraform/aws/lambdas'
  );

  const localLambdaZipSources = (await rglobfiles(local_lambda_zip_sources)).map(trackFile);
  const hxtAwsLambdaZipSources = (await rglobfiles(lambda_zip_sources)).map(trackFile);

  const lambdaSourceFiles = [
    ...localLambdaZipSources,
    ...hxtAwsLambdaZipSources,
 //   esToolBuildFile,
  ];

  const lambdaTasks = lambdaSourceFiles.map(src => {
    const ext = path.extname(src.path);
    const basename = path.basename(src.path, ext);
    const destZipFile = path.join(ROOT, 'build/lambdas', basename + '.zip');
    return task({
      name: changeCase.camelCase(`zipLambda-${basename}`),
      description: `zip for lambda function from ${basename}`,
      action: async () => {
        await generateZip(destZipFile, [src.path]);
      },
      deps: [src],
      targets: [trackFile(destZipFile)],
    });

    // not supported yet:
    // elif f.is_dir() and (f/'requirements.txt').is_file():
    // yield lambdazip_pydir_task(zipfile, f)
  });

  const tasksByName : {[key:string]:Task} = {};
  for(const t of lambdaTasks) {
    tasksByName[t.name] = t;
  }

  return {
    tasks: {
      ...tasksByName,
 //     typescriptBuild,
    },
    trackedFiles: {
      lambdaSourceFiles
    }
  };
}
