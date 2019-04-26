import * as s3 from '../aws/s3';
import * as bootscript from '../bootscript';
import * as rds from '../aws/rds';
import { release_url } from './releaseurl';
import * as C from './adl-gen/config';
import { createJsonBinding } from './adl-gen/runtime/json';
import { RESOLVER } from './adl-gen/resolver';
import { Maybe } from './adl-gen/runtime/sys/types';
import { ArnSecret } from '../aws/secrets';

export interface ContextFile {
  name: string;
  source_name: string;
}

export function httpProxyEndpoint(
  label: string,
  serverNames: string[]
): C.EndPoint {
  return {
    label,
    serverNames,
    etype: { kind: 'httpOnly' },
  };
}

export function httpsProxyEndpoint(
  label: string,
  serverNames: string[]
): C.EndPoint {
  return {
    label,
    serverNames,
    etype: {
      kind: 'httpsWithRedirect',
      value: { kind: 'generated' },
    },
  };
}

export type ProxyConfig =
  | { kind: 'none' }
  | { kind: 'local'; endpoints: C.EndPoint[] }
  | { kind: 'remoteSlave'; endpoints: C.EndPoint[]; remoteStateS3: s3.S3Ref }
  | { kind: 'remoteMaster'; endpoints: C.EndPoint[]; remoteStateS3: s3.S3Ref };

export function remoteProxyMaster(
  endpoints: C.EndPoint[],
  remoteStateS3: s3.S3Ref
): ProxyConfig {
  return { endpoints, kind: 'remoteMaster', remoteStateS3 };
}

export function remoteProxySlave(
  endpoints: C.EndPoint[],
  remoteStateS3: s3.S3Ref
): ProxyConfig {
  return { endpoints, kind: 'remoteSlave', remoteStateS3 };
}

export function localProxy(endpoints: C.EndPoint[]): ProxyConfig {
  return { endpoints, kind: 'local' };
}

export function contextFromS3(name: string, s3Ref: s3.S3Ref): C.DeployContext {
  return { name, source: { kind: 's3', value: s3Ref.url() } };
}

export function contextFromSecret(
  name: string,
  arn: ArnSecret
): C.DeployContext {
  return { name, source: { kind: 'awsSecretArn', value: arn.value } };
}

export function contextFromDb(
  name: string,
  db: rds.DbInstance
): C.DeployContext {
  switch (db.password_to.kind) {
    case 's3':
      return {
        name,
        source: { kind: 's3', value: db.password_to.s3Ref.url() },
      };
    case 'secret':
      return {
        name,
        source: { kind: 'awsSecretArn', value: db.password_to.arnSecret.value },
      };
  }
}

function remoteDeployMode(proxy: ProxyConfig): C.DeployMode {
  if (proxy.kind == 'none' || proxy.kind == 'local') {
    throw Error('hx-deploy-tool not configured with proxy mode');
  }
  const endPoints: { [key: string]: C.EndPoint } = {};
  const remoteStateS3: Maybe<string> = {
    kind: 'just',
    value: proxy.remoteStateS3.url(),
  };
  proxy.endpoints.forEach(ep => {
    endPoints[ep.label] = ep;
  });
  return {
    kind: 'proxy',
    value: C.makeProxyModeConfig({ endPoints, remoteStateS3 }),
  };
}

/**
 * Construct a bootscript that installs and configures the hx-deploy-tool. This
 * bootscript would normally be included into the complete instance bootscript.
 */
export function install(
  username: string,
  releases: s3.S3Ref,
  deployContexts: C.DeployContext[],
  proxy: ProxyConfig,
  ssl_cert_email?: string,
  letsencrypt_challenge_mode?: 'http-01' | 'dns-01'
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
  bs.sh('wget ' + release_url);
  bs.gunzip(['/opt/bin/hx-deploy-tool.gz']);
  bs.sh('chmod 755 /opt/bin/hx-deploy-tool');

  let deployMode: C.DeployMode;

  switch (proxy.kind) {
    case 'none':
      deployMode = { kind: 'select' };
      break;
    case 'local':
      {
        const endPoints: { [key: string]: C.EndPoint } = {};
        proxy.endpoints.forEach(ep => {
          endPoints[ep.label] = ep;
        });
        deployMode = {
          kind: 'proxy',
          value: C.makeProxyModeConfig({ endPoints }),
        };
      }
      break;
    case 'remoteSlave':
      deployMode = remoteDeployMode(proxy);
      break;
    case 'remoteMaster':
      deployMode = remoteDeployMode(proxy);
      break;
    default:
      throw Error(`proxy kind is unrecognised`);
  }

  const jb = createJsonBinding(RESOLVER, C.texprToolConfig());
  const config = C.makeToolConfig({
    deployMode,
    releases: {
      kind: 's3',
      value: releases.url(),
    },
    deployContexts: deployContexts,
    contextCache: '/opt/config',
    autoCertContactEmail: ssl_cert_email,
  });
  const deployContextFiles = bs.catToFile(
    '/opt/etc/hx-deploy-tool.json',
    JSON.stringify(jb.toJson(config), null, 2)
  );

  if (proxy.kind == 'none' || proxy.kind == 'local') {
    // If not in proxy mode, use letsEncrypt SSL
    letsEncryptSSL(config, proxy, bs, letsencrypt_challenge_mode);
  } else if (proxy.kind == 'remoteSlave') {
    // Install tools necessary for the slaves to poll the S3 state file
    bootscriptProxySlaveUpdate(bs, username);
  }
  return bs;
}

function letsEncryptSSL(
  config: C.ToolConfig,
  proxy: ProxyConfig,
  bs: bootscript.BootScript,
  letsencrypt_challenge_mode?: 'http-01' | 'dns-01'
) {
  const certdnsnames: string[] = [];

  if (proxy.kind === 'local') {
    for (const ep of proxy.endpoints) {
      if (
        ep.etype.kind === 'httpsWithRedirect' &&
        ep.etype.value.kind === 'generated'
      ) {
        ep.serverNames.forEach(dnsname => {
          certdnsnames.push(dnsname);
        });
      }
    }
  }
  const challenge_mode = letsencrypt_challenge_mode || 'http-01';

  if (certdnsnames.length == 0) {
    return;
  }

  switch (challenge_mode) {
    case 'http-01':
      const cmd = '/opt/bin/hx-deploy-tool proxy-generate-ssl-certificate';
      bs.comment('generate an ssl certificate');
      bs.sh('sudo -u app ' + cmd);
      bs.cronJob('ssl-renewal', [
        `MAILTO=""`,
        `0 0 * * * app ${cmd} 2>&1 | systemd-cat`,
      ]);
      break;
    case 'dns-01':
      bs.letsencyptAwsRoute53(
        config.autoCertContactEmail,
        certdnsnames,
        '/opt',
        config.autoCertName
      );
      break;
  }
}

function bootscriptProxySlaveUpdate(
  bs: bootscript.BootScript,
  username: string
): void {
  bs.cronJob('proxy-nginx-reload', [
    `MAILTO=""`,
    `15 0 * * * ${username} docker kill --signal=SIGHUP frontendproxy`,
  ]);
  bs.systemd('proxy-slave-update', [
    `[Unit]`,
    `Description=Periodically refresh local hx-deploy-tool proxy state from S3`,
    ``,
    `[Service]`,
    `ExecStart=/opt/bin/hx-deploy-tool proxy-slave-update --repeat 20`,
    `User=${username}`,
    `Restart=on-failure`,
    `WorkingDirectory=~`,
    ``,
    `[Install]`,
    `WantedBy=multi-user.target`,
  ]);
}
