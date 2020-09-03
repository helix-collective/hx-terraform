// task execution tool - dnit:
import {
  task,
  exec as dnitExec,
  file as trackFile,
  runAlways,
  path,
  fs,
  Task,
  TrackedFile,
} from 'https://deno.land/x/dnit@dnit-v1.6.0/mod.ts';

// hx dnit-utils:
import {
  runConsole,
  dockerRunConsole,
  dockerRun,
  currentUserOpts,
  confirmation,
} from 'https://denopkg.com/helix-collective/dnit-utils@v1.1.0/mod.ts';

// other deno typescript libs:
import * as jszip from 'https://deno.land/x/jszip@0.7.0/mod.ts';

// re-export for user projects:
export { task, dnitExec, trackFile, runAlways, path, fs, Task, jszip };

/**
 *  With user project dir setup as:
 *  repo/
 *    dnit/
 *      main.ts
 *    typescript/
 *      hx-terraform
 *
 *  dnit tool changes dir before executing main.ts such that Deno.cwd() is at root of the user project repo.
 */
const ROOT = Deno.cwd();

/** Run dockerized terraform image - interactive IO */
export async function runDockerizedTerraform(cmds: string[]): Promise<void> {
  // Use helix's packaged terraform and associated tools
  // from the image helixta/terraform at this version:
  const TERRAFORM_IMAGE = 'helixta/terraform:2019-03-11';

  // run as user for writing out the plan:
  const asUser = await currentUserOpts();

  await dockerRunConsole(TERRAFORM_IMAGE, {
    interactive: false,
    user: asUser.user,
    cmds: ['terraform', ...cmds],
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

/** Run dockerized ADL tools image */
export async function runDockerizedAdlc(
  mountDir: string,
  cmds: string[]
): Promise<string> {
  const IMAGE = 'helixta/hxadl:0.11';

  const asUser = await currentUserOpts();

  return dockerRun(IMAGE, {
    cmds,
    user: asUser.user,
    mounts: [
      ...asUser.mounts,
      {
        type: 'bind',
        source: mountDir,
        target: '/src',
      },
    ],
    workdir: '/src',
    interactive: false,
  });
}

/** Empty and remove a directory */
export async function removeDir(dir: string): Promise<void> {
  await fs.emptyDir(dir);
  await Deno.remove(dir);
}

/** Enumerate all of the files recursively at a path */
export async function rglobfiles(
  path: string,
  callerOpts: fs.WalkOptions = {}
): Promise<string[]> {
  if (!(await fs.exists(path))) {
    return [];
  }

  const opts: fs.WalkOptions = {
    ...callerOpts,
    includeDirs: false,
    includeFiles: true,
  };

  const result: string[] = [];
  for await (const entry of fs.walk(path, opts)) {
    result.push(entry.path);
  }
  return result;
}

/** Make a task to run yarn for node modules in a directory
 * @param dir: The directory containing node_modules, package.json, and yarn.lock
 */
export function makeYarnTask(dir: string) {
  return task({
    name: `yarn-${dir}`,
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

/** Get age of a file in milliseconds */
export async function fileAgeMs(
  path: string,
  now: Date = new Date()
): Promise<number> {
  const stat = await Deno.stat(path);
  if (!stat.mtime) {
    throw new Error('file stat mtime not available');
  }

  const ageMs = now.getTime() - stat.mtime.getTime();
  return ageMs;
}

/** Generate a zip file from files */
export async function generateZip(
  destZip: string,
  paths: string[]
): Promise<void> {
  await fs.ensureDir(path.dirname(destZip));
  const zip = new jszip.JSZip();
  for (const p of paths) {
    const content = await Deno.readFile(p);
    zip.addFile(path.basename(p), content, {
      // Set the file create time to make zip files reproduceable
      date: new Date('2000-01-01T00:00:00Z'),

      // Set the file permissions within the zipfile to be 644 - necessary to upload to lambda
      unixPermissions: '644',
    });
  }
  const b: Uint8Array = await zip.generateAsync({
    type: 'uint8array',
    platform: 'UNIX',
  });
  return await Deno.writeFile(destZip, b);
}

export type LambdaTasks = {
  tasks: {
    typescriptBuild: Task;
    [key:string]: Task;
  },
  trackedFiles: {
    lambda_source_files: TrackedFile[];
    [key:string]: TrackedFile[];
  }
};

/** make tasks for building AWS lambda functions */
export async function makeLambdaTasks(): Promise<LambdaTasks> {
  const es_tool_build_file = trackFile(
    path.join(ROOT, 'typescript/build/hx-terraform/tools/es-tool.js')
  );

  const typescriptBuild = task({
    name: 'yarn-build',
    description: 'yarn build',
    action: async () => {
      await runConsole(['yarn', 'build'], {
        cwd: path.join(ROOT, 'typescript'),
      });
    },
    deps: [trackFile(path.join(ROOT, 'typescript/hx-terraform/tools/es-tool.ts'))],
    targets: [es_tool_build_file],
  });

  const local_lambda_zip_sources = path.join(ROOT, 'lambdas');
  const lambda_zip_sources = path.join(
    ROOT,
    'typescript/hx-terraform/aws/lambdas'
  );

  const lambda_source_files = [
    ...(await rglobfiles(local_lambda_zip_sources)).map(trackFile),
    ...(await rglobfiles(lambda_zip_sources)).map(trackFile),
    es_tool_build_file,
  ];

  const lambdaTasks = lambda_source_files.map(src => {
    const ext = path.extname(src.path);
    const basename = path.basename(src.path, ext);
    const destZipFile = path.join(ROOT, 'build/lambdas', basename + '.zip');
    return task({
      name: `zipLambda-${basename}`,
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
      typescriptBuild,
    },
    trackedFiles: {
      lambda_source_files
    }
  };
}

export type InfraTasks = {
  tasks: {
    generateProviders: Task;
    generateTerraform: Task;
    terraformInit: Task;
    terraformPlan: Task;
    terraformApply: Task;
    terraformRefresh: Task;
    terraformOutput: Task;
    updateCamus2: Task;
    typescriptBuild: Task;
    yarnLocal: Task;
    yarnHxTerraform: Task;
    [key:string]: Task;
  },
  trackedFiles: {
    lambda_source_files: TrackedFile[];
    generatedProviderSrcs: TrackedFile[];
    generatedTerraformManifests: TrackedFile[];
    generatedTfFiles: TrackedFile[];
    generatedTerraformPlan: TrackedFile[];
    [key:string]: TrackedFile[];
  }
};

/** Make tasks needed for operating typescript/terraform infrastructure */
export async function makeInfraTasks(): Promise<InfraTasks> {
  const lambdaTasks = await makeLambdaTasks();

  // Tasks for yarn:
  // These are actually symlinked so they share package.json
  const yarnLocal = makeYarnTask(path.join(ROOT, 'typescript'));
  const yarnHxTerraform = makeYarnTask(
    path.join(ROOT, 'typescript', 'hx-terraform')
  );

  const generatedProviderSrcs = [
    trackFile(path.join(ROOT, 'typescript/hx-terraform/providers/aws/resources.ts')),
    trackFile(
      path.join(ROOT, 'typescript/hx-terraform/providers/random/resources.ts')
    ),
  ];

  const generateProviders = task({
    name: 'generate_providers',
    description: 'Generate typescript for providers',
    action: async () => {
      await runConsole(
        ['./node_modules/.bin/ts-node', 'hx-terraform/tools/gen-providers.ts'],
        {
          cwd: path.join(ROOT, 'typescript'),
        }
      );
    },
    deps: [
      yarnLocal,
      yarnHxTerraform,

      trackFile(path.join(ROOT, 'typescript/hx-terraform/tools/gen-helpers.ts')),
      trackFile(path.join(ROOT, 'typescript/hx-terraform/tools/gen-providers.ts')),

      ...// all provider sources other than (the generated) resources.ts
      (await rglobfiles(path.join(ROOT, 'typescript/hx-terraform/providers'), {
        skip: [/.*resources.ts/],
      })).map(trackFile),
    ],
    targets: generatedProviderSrcs,
    uptodate: runAlways,
  });

  const generatedTerraformManifests = {
    adhoc: trackFile(path.join(ROOT, 'terraform/.manifest.adhoc')),
    backend: trackFile(path.join(ROOT, 'terraform/.manifest.backend')),
    providers: trackFile(path.join(ROOT, 'terraform/.manifest.providers')),
    resources: trackFile(path.join(ROOT, 'terraform/.manifest.resources')),
  };

  const generateTerraform = task({
    name: 'generate_terraform',
    description: 'Generate terraform files from the terraform EDSL',
    action: async () => {
      await runConsole(['./node_modules/.bin/ts-node', 'main.ts'], {
        cwd: path.join(ROOT, 'typescript'),
      });
    },
    deps: [
      yarnLocal,
      yarnHxTerraform,
      generateProviders,
      ...generatedProviderSrcs,
      ...// all typescript sources excl node_modules
      (await rglobfiles(path.join(ROOT, 'typescript'), {
        skip: [/node_modules/, /typescript\/build/],
      })).map(trackFile),
    ],
    targets: Object.values(generatedTerraformManifests),
    uptodate: runAlways,
  });

  const terraformInit = task({
    name: 'terraform_init',
    description:
      '(Re)Initialize terraform on initial setup and/or changes to backend/provider',
    action: async () => {
      await runDockerizedTerraform(['init', '--force-copy']);
    },
    deps: [
      generatedTerraformManifests.backend,
      generatedTerraformManifests.providers,
    ],
  });

  const generatedTerraformPlan = trackFile(path.join(ROOT, 'terraform', 'tfplan'));

  const generatedTfFiles = (await rglobfiles(path.join(ROOT, 'terraform'), {
    exts: ['.tf'],
  })).map(trackFile);

  const terraformPlan = task({
    name: 'plan',
    description:
      'Execute terraform plan to show pending infrastructure changes and save the plan',
    action: async () => {
      await runDockerizedTerraform(['plan', '-parallelism=20', '-out=tfplan']);
    },
    deps: [
      terraformInit,
      ...Object.values(lambdaTasks.tasks),
      ...Object.values(generatedTerraformManifests),
      ...generatedTfFiles,
    ],
    targets: [generatedTerraformPlan],
    uptodate: runAlways,
  });

  const terraformApply = task({
    name: 'apply',
    description:
      'Execute terraform apply to make any pending infrastructure changes according to the plan',
    action: async ctx => {
      if (!(await generatedTerraformPlan.exists(ctx))) {
        throw new Error("No plan file found - Run 'dnit plan' first.");
      }

      // Ensure the plan is not too old - couple of minutes
      const ageThresholdMs = 5 * 60 * 1000;

      const planAgeMs = await fileAgeMs(generatedTerraformPlan.path);
      if (planAgeMs > ageThresholdMs) {
        await Deno.remove(generatedTerraformPlan.path);
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

      // remove the plan after using it
      await Deno.remove(generatedTerraformPlan.path);
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

  const update_camus2 = task({
    name: 'update_camus2',
    description:
      'Update the referenced version of the camus2, importing adl and regenerating the typescript',
    action: async ctx => {
      const camus2dir = path.join(
        ROOT,
        'typescript/hx-terraform/library/camus2'
      );

      type Args = {
        version?: string;
      };
      const args: Args = ctx.args as Args;
      const version: string | undefined = args.version;
      if (version === undefined) {
        throw new Error('A --version argument is required');
      }

      const sourceUrl = `https://github.com/helix-collective/camus2/archive/${version}.zip`;
      const releaseUrl = `https://github.com/helix-collective/camus2/releases/download/${version}/camus2.x86_64-linux.gz`;

      ctx.logger.info('Fetching src...');
      const getZipResp = await fetch(sourceUrl);
      const zipData = await getZipResp.arrayBuffer();
      ctx.logger.info('Unpacking c2 zip');
      const zip = new jszip.JSZip();
      await zip.loadAsync(new Uint8Array(zipData));
      await zip.unzip(camus2dir);

      const unpackdir = path.join(camus2dir, `camus2-${version}`);

      await fs.emptyDir(path.join(camus2dir, 'adl'));
      await fs.emptyDir(path.join(camus2dir, 'adl-gen'));
      await Deno.rename(
        path.join(unpackdir, 'adl'),
        path.join(camus2dir, 'adl')
      );
      await removeDir(unpackdir);

      ctx.logger.info('Generating typescript...');

      const findOutput = await runDockerizedAdlc(ROOT, [
        'find',
        '/opt/lib/adl',
        '-name',
        '*.adl',
      ]);
      const adlstdlib = findOutput.trim().split('\n');

      const adlSrcs = await rglobfiles(path.join(camus2dir, 'adl'), {
        match: [/.*\.adl$/],
      });

      await runDockerizedAdlc(ROOT, [
        '/opt/bin/adlc',
        'typescript',
        '--searchdir',
        path.join(camus2dir, 'adl'),
        '--runtime-dir',
        'runtime',
        '--outputdir',
        path.join(camus2dir, 'adl-gen'),
        '--include-rt',
        '--include-resolver',
        ...adlSrcs,
        ...adlstdlib,
      ]);

      await Deno.writeTextFile(
        path.join(ROOT, 'typescript/hx-terraform/library/camus2/releaseurl.ts'),
        `export const release_url: string = "${releaseUrl} -O /opt/bin/camus2.gz";\n`
      );
    },
    uptodate: runAlways,
  });

  const res : InfraTasks = {
    tasks: {
      ...lambdaTasks.tasks,
      yarnLocal,
      yarnHxTerraform,
      generateProviders,
      generateTerraform,
      terraformInit,
      terraformPlan,
      terraformApply,
      terraformRefresh,
      terraformOutput,
      updateCamus2: update_camus2,
    },
    trackedFiles: {
      ...lambdaTasks.trackedFiles,
      generatedProviderSrcs,
      generatedTerraformManifests: Object.values(generatedTerraformManifests),
      generatedTfFiles,
      generatedTerraformPlan: [generatedTerraformPlan],
    }
  };
  return res;
}
