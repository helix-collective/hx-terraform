import { fs, path, hash } from "../deps.ts";

export class Manifest {
  private contents : {file:string, hash:string}[] = [];
  private manifestFile: string;

  constructor(public name: string, public outdir: string) {
    this.manifestFile = path.join(outdir,`.manifest.${name}`);
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.manifestFile)) {
        const content = Deno.readFileSync(this.manifestFile);
        const data : {file:string, hash:string}[] = JSON.parse(new TextDecoder().decode(content));
        this.contents = data;
      }
    }
    catch(err) {
      console.error(`Failer for load manifest file ${err}. Ignoring`);
    }
  }

  clearFiles() {
    for(const c of this.contents) {
      const fpath = path.join(this.outdir,c.file);
      if(fs.existsSync(fpath)) {
        Deno.removeSync(fpath);
      }
    }
    this.contents = [];
  }

  writeFile(fpath: string, content: string) : void {
    const shasum = hash.createHash('sha1');
    shasum.update(content);

    this.contents.push({
      file:fpath,
      hash:shasum.toString('hex')
    });

    if (!fs.existsSync(this.outdir)) {
      Deno.mkdirSync(this.outdir,{recursive:true});
    }
    Deno.writeFileSync(path.join(this.outdir,fpath),new TextEncoder().encode(content));
  }

  save() {
    Deno.writeFileSync(this.manifestFile, new TextEncoder().encode(JSON.stringify(this.contents, null, 2) + '\n'));
  }
};
