// Filesystem utils

import {fs} from "./deps.ts";

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

