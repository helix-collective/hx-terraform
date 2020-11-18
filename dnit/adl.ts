import { run, path, getLogger } from "./deps.ts"
import { directoryExists, rglobfiles } from "./filesystem.ts";

import { fromStreamReader } from "https://deno.land/std@0.77.0/io/streams.ts";

export function getHomeCacheDir(uname: "Darwin"|"Linux") {
  const HOME = Deno.env.get("HOME");
  if(HOME === undefined) {
    throw new Error("Expected valid HOME environment variable");
  }
  switch(uname) {
    case 'Darwin':
      return `${HOME}/Library/Caches`
    case 'Linux':
      return `${HOME}/.cache`
  }
}

export async function getUname() : Promise<"Darwin"|"Linux"> {
  const uname :string = await run(["uname","-s"]);
  if(uname.startsWith("Darwin")) {
    return "Darwin";
  }
  if(uname.startsWith("Linux")) {
    return "Linux";
  }
  throw new Error("Unrecognised platform uname: " + uname);
}

export async function downloadFile(url:string, path:string) {
  const getdata = await fetch(url);
  const file = await Deno.open(path, { create: true, write: true });
  const reader = fromStreamReader(getdata.body!.getReader());
  await Deno.copy(reader, file);
}

export async function getCachedAdlDir(version: string) {
  const log = getLogger();

  const uname = await getUname();
  const platform = uname === 'Darwin' ? 'osx' : 'linux';
  const cachedir = getHomeCacheDir(uname);

  const downloads=`${cachedir}/hxadl/downloads`;

  const name = `hxadl-bindist-${version}-${platform}.zip`;
  const release=`https://github.com/helix-collective/helix-adl-tools/releases/download/v${version}/${name}`;
  const versiondir=`${cachedir}/hxadl/${version}`;

  if (! await directoryExists(versiondir)) {
    log.info('Fetching ADL version ' + version);
    const downloadPath=path.join(downloads,name);

    await Deno.mkdir(downloads,{recursive:true});
    await downloadFile(release, downloadPath);
    await Deno.mkdir(versiondir,{recursive:true});

    run(["unzip","-q",downloadPath],{cwd:versiondir});
  }

  return versiondir;
}

const adlReleaseVersion = "0.37";

/// Get ADL stdlib *.adl files
export async function getAdlStdlib() : Promise<string[]> {
  const adlBaseDir = await getCachedAdlDir(adlReleaseVersion);
  return rglobfiles(`${adlBaseDir}/lib/adl`,{exts:['.adl']});
}

/// Run ADL compiler
export async function runAdlc(cmds: string[]) : Promise<string> {
  const adlBaseDir = await getCachedAdlDir(adlReleaseVersion);
  const adlc=`${adlBaseDir}/bin/adlc`;
  return await run([adlc,...cmds]);
}
