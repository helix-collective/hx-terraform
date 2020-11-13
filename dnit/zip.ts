// Utils for making zip files

import {fs, jszip, path} from './deps.ts'

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
