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
    cmd += "helixta/hxadl:0.11 "
    cmd += ' '.join(rcmd)
    return cmd

def generate_logging_certs(todir):

    def cmd(cmd):
        subprocess.check_call(cmd, shell=True, cwd=todir)

    def generate_certs():
        # Based upon logic here:
        # https://banzaicloud.com/blog/k8s-logging-tls/
        for dir in ['ca', 'client', 'server']:
            (todir/dir).mkdir(parents=True,exist_ok=True)
        with open(todir/'index.txt', 'w') as f:
            f.write('')
        with open(todir/'serial', 'w') as f:
            f.write('1000')
        with open(todir/'openssl.cnf', 'w') as f:
            f.write( OPENSSL_CNF)

        def subject(cn):
            return ' -subj "/O=Helix/C=AU/L=Sydney/OU=Technology/ST=New South Wales/CN={}"'.format(cn)

        # create CA private key
        cmd('openssl genrsa -out ca/ca.key.pem 4096')

        # create CA certificate
        ca_subject = subject('ca')
        cmd('openssl req -config openssl.cnf -key ca/ca.key.pem -new -x509 -days 365 -sha256 -extensions v3_ca -out ca/ca.crt.pem' + ca_subject)

        # create server private key
        cmd('openssl genrsa -out server/server.key.pem 4096')

        # create server csr
        server_subject = subject('logging-server')
        cmd('openssl req -config openssl.cnf -key server/server.key.pem  -new -sha256 -out server/server.csr.pem' + server_subject)

        # create server certificate
        cmd('openssl ca -batch -config openssl.cnf -outdir server -cert ca/ca.crt.pem -keyfile ca/ca.key.pem -extensions server_cert -days 365 -notext -md sha256 -in server/server.csr.pem -out server/server.crt.pem');

        # create client private key
        cmd('openssl genrsa -out client/client.key.pem 4096')

        # create client csr
        client_subject = subject('logging-client')
        cmd('openssl req -config openssl.cnf -key client/client.key.pem  -new -sha256 -out client/client.csr.pem' + client_subject)

        # create client certificate
        cmd('openssl ca -batch -config openssl.cnf -outdir client -cert ca/ca.crt.pem -keyfile ca/ca.key.pem -extensions client_cert -days 365 -notext -md sha256 -in client/client.csr.pem -out client/client.crt.pem');

    return {
        'doc' : 'Generate self signed certificates for the logging system',
        'actions': [generate_certs],
    }



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
            "--include-resolver",
            str(deploytooldir/'adl/*.adl')
        ] + adlstdlib), shell=True)

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

OPENSSL_CNF = '''\
[ ca ]
# `man ca`
default_ca = CA_default

[ CA_default ]
# Directory and file locations.
dir               = .
certs             = $dir/certs
crl_dir           = $dir/crl
new_certs_dir     = $dir/newcerts
database          = $dir/index.txt
serial            = $dir/serial
RANDFILE          = $dir/private/.rand

# The root key and root certificate.
private_key       = $dir/private/ca.key.pem
certificate       = $dir/certs/ca.crt.pem

# SHA-1 is deprecated, so use SHA-2 instead.
default_md        = sha256

name_opt          = ca_default
cert_opt          = ca_default
default_days      = 365
preserve          = no
policy            = policy_strict

[ req ]
# Options for the `req` tool (`man req`).
default_bits        = 4096
distinguished_name  = req_distinguished_name
string_mask         = utf8only

# SHA-1 is deprecated, so use SHA-2 instead.
default_md          = sha256

# Extension to add when the -x509 option is used.
x509_extensions     = v3_ca

[ req_distinguished_name ]
# See <https://en.wikipedia.org/wiki/Certificate_signing_request>.
countryName                     = Country Name (2 letter code)
stateOrProvinceName             = State or Province Name
localityName                    = Locality Name
0.organizationName              = Organization Name
organizationalUnitName          = Organizational Unit Name
commonName                      = Common Name (required)
emailAddress                    = Email Address

# Optionally, specify some defaults.
countryName_default             = US
stateOrProvinceName_default     = CA
#localityName_default           = Mountain View
0.organizationName_default      = Your company name
#organizationalUnitName_default =
emailAddress_default            = foo@example.com

[v3_ca]
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always, issuer
basicConstraints = critical,CA:true
keyUsage = critical, cRLSign, digitalSignature, keyCertSign

[ client_cert ]
# Extensions for client certificates (`man x509v3_config`).
basicConstraints = CA:FALSE
nsCertType = client, email
nsComment = "OpenSSL Generated Client Certificate"
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
keyUsage = critical, nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth, emailProtection

[ server_cert ]
# Extensions for server certificates (`man x509v3_config`).
basicConstraints = CA:FALSE
nsCertType = server
nsComment = "OpenSSL Generated Server Certificate"
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer:always
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[ policy_strict ]
# The root CA should only sign intermediate certificates that match.
# See the POLICY FORMAT section of `man ca`.
countryName             = match
stateOrProvinceName     = match
organizationName        = match
organizationalUnitName  = optional
commonName              = supplied
emailAddress            = optional
'''
