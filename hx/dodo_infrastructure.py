import os
import io
import shutil
import subprocess
from urllib.request import urlopen
import zipfile
import tempfile
from pathlib import *
from hx.dodo_helpers import rglobfiles

def run_dockerized_terraform(terraform_image, args):
    """
    Construct a command string to run terraform in a docker container,
    using the correct version
    """
    using_nix = os.environ.get('NIX_PATH') != None

    cmd =  "docker run -it --rm "

    # run as user for writing out the plan
    cmd += "--volume /etc/passwd:/etc/passwd "
    cmd += "--volume /etc/group:/etc/group "
    cmd += "--user $(id -u):$(id -g) "

    cmd += "-v `pwd`:/src -w /src/terraform "
    cmd += "-v {0}:{0} ".format(os.environ['HOME'])
    if using_nix:
        cmd += "-v /nix:/nix "

    envs_whitelist = {
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SHARED_CREDENTIALS_FILE",
        "AWS_PROFILE",
        "AWS_SESSION_TOKEN",
        "TF_LOG",
    }
    cmd += ' '.join(["-e " + e for e in envs_whitelist])
    cmd += ' '

    cmd += "{} ".format(terraform_image)
    cmd += "terraform "
    cmd += ' '.join(args)
    return cmd

def dockerized_adlc(wdir,rcmd):
    cmd =  "docker run -it --rm "
    cmd += "-v {0}:{0} -w {0} ".format(wdir.absolute())
    cmd += "--user $(id -u):$(id -g) "
    cmd += "helixta/hxadl:0.11 "
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
        with urlopen('https://github.com/helix-collective/camus2/archive/{}.zip'.format(version)) as zf:
            zip = zipfile.ZipFile(io.BytesIO(zf.read()))
            zip.extractall(deploytooldir)
        print( "Extracting adl...")
        unpackdir = deploytooldir/'camus2-{}'.format(version)
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
            "--include-resolver",
            str(deploytooldir/'adl/*.adl')
        ] + adlstdlib), shell=True)

        with open('typescript/hx-terraform/library/deploytool/releaseurl.ts', 'w') as f:
            f.write('export const release_url: string = "https://github.com/helix-collective/camus2/releases/download/{}/camus2.x86_64-linux.gz -O /opt/bin/camus2.gz";\n'.format(version))


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

def lambdazip_file_task(zipfile, fromfile):
    "Task to create a lambda zipfile from a single file"
    return {
        'name': fromfile.stem,
        'doc' : 'Build a zip archive from a single file for a lambda function',
        'actions': [generate_zip(zipfile, [fromfile])],
        'file_dep': [fromfile],
        'targets': [zipfile],
    }

def lambdazip_pydir_task(zipfile, frompydir):
    "Task to create a lambda zipfile from python tree with a requirements.txt file"
    depfiles = rglobfiles(frompydir)
    return {
        'name': frompydir.stem,
        'doc' : 'Build a zip archive from a python tree for a lambda function',
        'actions': [generate_pydir_lambda(zipfile, frompydir)],
        'file_dep': depfiles,
        'targets': [zipfile],
    }

def generate_zip(zip,paths):
    def thunk():
        os.makedirs(zip.parent, exist_ok=True)
        with zipfile.ZipFile(str(zip), 'w') as zf:
            for p in paths:
                with open(p) as cf:
                  content = cf.read()
                  # Fix the file create time to make zip files reproduceable
                  zinfo = zipfile.ZipInfo(p.name,(2000,1,1,0,0,0))
                  # Set the file permissions within the zipfile to be 644 - necessary to upload to lambda
                  zinfo.external_attr = 0o0644 << 16
                  zf.writestr(zinfo,content)
    return thunk

def generate_pydir_lambda(zip, pydir):
    def thunk():
        # Create a temporary copy of pydir
        tmpdir = Path(tempfile.mkdtemp())
        subprocess.run( 'cp -r {}/* {}'.format(pydir, tmpdir), check=True, shell=True)

        # Run pip to install the dependencies in it
        # (assumes debian pip3 on path, which requires --system)
        subprocess.run( 'pip3 install -r requirements.txt --system --target .', check=True, shell=True, cwd=tmpdir)

        # Zip up to create the lambda zip
        with zipfile.ZipFile(str(zip), 'w') as zf:
            for p in rglobfiles(tmpdir):
                zf.write(p, arcname=p.relative_to(tmpdir))

        # Remove tempdir
        shutil.rmtree(str(tmpdir))
    return thunk
