import os
import io
import shutil
import subprocess
from urllib.request import urlopen
import zipfile

def run_dockerized_terraform(terraform_image, args):
    """
    Construct a command string to run terraform in a docker container,
    using the correct version
    """
    using_nix = os.environ.get('NIX_PATH') != None

    cmd =  "docker run -it --rm "
    cmd += "-v `pwd`/terraform:/terraform -w /terraform "
    cmd += "-v {0}:{0} ".format(os.environ['HOME'])
    if using_nix:
        cmd += "-v /nix:/nix "
    cmd += "-e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY "
    cmd += "{} ".format(terraform_image)
    cmd += "terraform "
    cmd += ' '.join(args)
    return cmd

def dockerized_adlc(wdir,rcmd):
    cmd =  "docker run -it --rm "
    cmd += "-v {0}:{0} -w {0} ".format(wdir.absolute())
    cmd += "--user $(id -u):$(id -g) "
    cmd += "helixta/hxadl:0.10 "
    cmd += ' '.join(rcmd)
    return cmd

def update_deploytool(basedir):
    """
    Returns a doit task to update the version of the deploytool in this repo
    This imports the adl and regenerating the typescript:

       => deploytool/adl/...         the deploy tool adl files
       => deploytool/adl-gen/...     typescript generated from the adl
       => deploytool/releaseurl.ts   url of chosen release
    """
    def update_deploytool(version):
        deploytooldir = basedir/'typescript/hx-terraform/library/deploytool'
        if not version:
            raise RuntimeError("A --version argument is required")
        print( "Fetching src...")
        with urlopen('https://github.com/helix-collective/hx-deploy-tool/archive/{}.zip'.format(version)) as zf:
            zip = zipfile.ZipFile(io.BytesIO(zf.read()))
            zip.extractall(deploytooldir)
        print( "Extracting adl...")
        unpackdir = deploytooldir/'hx-deploy-tool-{}'.format(version)
        shutil.rmtree(str(deploytooldir/'adl'), ignore_errors=True)
        shutil.rmtree(str(deploytooldir/'adl-gen'), ignore_errors=True)
        shutil.move(str(unpackdir/'adl'), str(deploytooldir))
        shutil.rmtree(str(unpackdir))
        print( "Generating typescript...")
        out = subprocess.check_output(dockerized_adlc(basedir, [
            "find", "/opt/lib/adl",  "-name", "'*.adl'"
        ]), shell=True);
        adlstdlib = [f.decode('utf-8') for f in out.split()];
        subprocess.check_call(dockerized_adlc(basedir, [
            "adlc", "typescript ",
            "--searchdir", str(deploytooldir/'adl'),
            "--runtime-dir", 'runtime',
            "--outputdir", str(deploytooldir/'adl-gen'),
            "--include-rt",
            str(deploytooldir/'adl/*.adl')
        ] + adlstdlib), shell=True)
        with open(deploytooldir/'adl-gen/adl.ts', 'w') as f:
            f.write('''\
import { declResolver, ScopedDecl } from "./runtime/adl";
import { _AST_MAP as systypes } from "./sys/types";
import { _AST_MAP as config } from "./config";
import { _AST_MAP as types } from "./types";
export const ADL: { [key: string]: ScopedDecl } = {
  ...systypes,
  ...config,
  ...types,
};

export const RESOLVER = declResolver(ADL);
''')

        with open('typescript/hx-terraform/library/deploytool/releaseurl.ts', 'w') as f:
            f.write('export const release_url: string = "https://github.com/helix-collective/hx-deploy-tool/releases/download/{}/hx-deploy-tool.x86_64-linux.gz -O /opt/bin/hx-deploy-tool.gz";\n'.format(version))


    return {
        'doc' : 'Update the referenced version of the deploytool, importing adl and regenerating the typescript',
        'params': [
            {
                'name' : 'version',
                'long' : 'version',
                'type' : str,
                'default': ''
            },
        ],
        'actions': [update_deploytool],
        'verbosity': 2
    }
