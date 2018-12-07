import * as s3 from '../aws/s3';
import * as bootscript from '../bootscript';
import { release_url } from './releaseurl';
import * as C from "./adl-gen/config";
import * as T from "./adl-gen/types";
import { createJsonBinding } from "./adl-gen/runtime/json";
import { RESOLVER } from "./adl-gen/resolver";
import { TcpNetConnectOpts } from 'net';

export interface ContextFile {
  name: string;
  source_name: string;
}

export function contextFile(base_s3: s3.S3Ref, file_s3: s3.S3Ref): ContextFile {
  if (
    base_s3.bucket !== file_s3.bucket ||
    !file_s3.key.startsWith(base_s3.key)
  ) {
    throw new Error('contextFile: base_s3 must be a prefix of file_s3');
  }
  let source_name: string = file_s3.key.substr(base_s3.key.length);
  if (source_name.startsWith('/')) {
    source_name = source_name.substr(1);
  }
  // The name is the characters after the last slash
  const name = /[^/]*$/.exec(source_name);
  if (!name) {
    throw new Error('Invalid context file path');
  }
  return { source_name, name: name[0] };
}


export function httpProxyEndpoint(
  label: string,
  serverName: string
): C.EndPoint {
  return  {
      label,
      serverName,
      etype: {kind:'httpOnly'},
    };
}

export function httpsProxyEndpoint(
  label: string,
  serverName: string,
): C.EndPoint {
  return  {
      label,
      serverName,
      etype: {
        kind:'httpsWithRedirect',
        value: {kind: 'generated'}
      },
  };
}

export type ProxyConfig =
  | { kind: 'none' }
  | { kind: 'local'; endpoints: C.EndPoint[] };

export function localProxy(endpoints: C.EndPoint[]): ProxyConfig {
  return { endpoints, kind: 'local' };
}

/**
 * Construct a bootscript that installs and configures the hx-deploy-tool. This
 * bootscript would normally be included into the complete instance bootscript.
 */
export function install(
  username: string,
  releases: s3.S3Ref,
  deploy_context: s3.S3Ref,
  contextFiles: ContextFile[],
  proxy: ProxyConfig,
  ssl_cert_email?: string
): bootscript.BootScript {
  const bs = bootscript.newBootscript();
  bs.comment('Install and configure hx-deploy-tool');
  bs.mkdir('/opt/etc');
  bs.mkdir('/opt/bin');
  bs.mkdir('/opt/var/log');
  bs.mkdir('/opt/releases');
  bs.mkdir('/opt/config');
  bs.sh(`chown -R ${username}:${username} /opt/config`);
  bs.sh(`chown -R ${username}:${username} /opt/releases`);
  bs.sh(`chown -R ${username}:${username} /opt/var/log`);
  bs.sh(
    'wget ' + release_url
  );
  bs.gunzip(['/opt/bin/hx-deploy-tool.gz']);
  bs.sh('chmod 755 /opt/bin/hx-deploy-tool');

  let deployMode : C.DeployMode;
  if (proxy.kind === 'none') {
    deployMode = {kind:'select'};
  } else { //  (proxy.kind === 'local')
    const endPoints: { [key: string]: C.EndPoint } = {};
    proxy.endpoints.forEach(ep => {
      endPoints[ep.label] = ep;
    });
    deployMode = {
      kind: "proxy",
      value: C.makeProxyModeConfig({endPoints}),
    };
  }

  const jb = createJsonBinding(RESOLVER, C.texprToolConfig());
  const config = C.makeToolConfig({
    deployMode: deployMode,
    releases: {
      kind: 's3',
      value: releases.url(),
    },
    deployContext: {
      kind: 's3',
      value: deploy_context.url()
    },
    deployContextFiles: contextFiles.map( cf => {return {
      name: cf.name,
      sourceName: cf.source_name
    }} ),
    contextCache: "/opt/config",
    autoCertContactEmail: ssl_cert_email
  });
  const deployContextFiles = bs.catToFile(
    '/opt/etc/hx-deploy-tool.json',
    
    JSON.stringify(jb.toJson(config), null, 2)
  );


  const generate_ssl_cert: boolean = (() => {
    if (proxy.kind == "local") {
      for(const ep of proxy.endpoints) {
        if (ep.etype.kind == 'httpsWithRedirect' && ep.etype.value.kind == 'generated') {
          return true;
        }
      };
    }
    return false;
  })();

  if (generate_ssl_cert) {
    const cmd = "/opt/bin/hx-deploy-tool proxy-generate-ssl-certificate";
    bs.comment("generate an ssl certificate")
    bs.sh("sudo -u app " + cmd);
    bs.cronJob('ssl-renewal', [
      `MAILTO=""`,
      `0 0 * * * app ${cmd} 2>&1 | systemd-cat`,
    ]);
  }
  return bs;
}