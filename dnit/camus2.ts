import { fs, jszip, path, runAlways, Task, task } from "./deps.ts";
import { removeDir, rglobfiles } from "./filesystem.ts";
import { getAdlStdlib, runAdlc } from './adl.ts';
import type { TasksObject } from "./types.ts";

import {ROOT} from './workingDir.ts';

export interface Camus2Tasks extends TasksObject {
  tasks: {
    update: Task
  },
};

export async function makeCamus2Tasks({}) : Promise<Camus2Tasks> {
  const updateCamus2 = task({
    name: 'updateCamus2',
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

      const adlStdlibSrcs = await getAdlStdlib();

      const adlSrcs = await rglobfiles(path.join(camus2dir, 'adl'), {
        exts:['.adl']
      });

      await runAdlc([
        'typescript',
        '--searchdir', path.join(camus2dir, 'adl'),
        '--runtime-dir', 'runtime',
        '--outputdir', path.join(camus2dir, 'adl-gen'),
        '--include-rt',
        '--include-resolver',
        '--manifest', path.join(camus2dir, 'adl-gen', '.manifest'),
        ...adlSrcs,
        ...adlStdlibSrcs,
      ]);

      await Deno.writeTextFile(
        path.join(ROOT, 'typescript/hx-terraform/library/camus2/releaseurl.ts'),
        `export const release_url: string = "${releaseUrl} -O /opt/bin/camus2.gz";\n`
      );
    },
    uptodate: runAlways,
  });

  return {
    tasks: {
      update: updateCamus2
    }
  };
}

