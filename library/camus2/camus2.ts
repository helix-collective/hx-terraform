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

export interface DeployContext {
  name: string;
  source: C.JsonSource;
}

export function httpProxyEndpoint(
  label: string,
  serverNames: string[]
): C.EndPoint {
  return {
    serverNames,
    etype: { kind: 'httpOnly' },
  };
}

export function httpsProxyEndpoint(
  label: string,
  serverNames: string[]
): C.EndPoint {
  return {
    serverNames,
    etype: {
      kind: 'httpsWithRedirect',
      value: { kind: 'generated' },
    },
  };
}

export type EndPointMap = { [name: string]: C.EndPoint };

export type ProxyConfig =
  | { kind: 'none' }
  | { kind: 'local'; endpoints: EndPointMap; nginxConfTemplatePath?: string }
  | {
      kind: 'remoteSlave';
      endpoints: EndPointMap;
      remoteStateS3: s3.S3Ref;
      nginxConfTemplatePath?: string;
    }
  | {
      kind: 'remoteMaster';
      endpoints: EndPointMap;
      remoteStateS3: s3.S3Ref;
      nginxConfTemplatePath?: string;
    };

export function remoteProxyMaster(
  endpoints: EndPointMap,
  remoteStateS3: s3.S3Ref,
  nginxConfTemplatePath?: string
): ProxyConfig {
  return {
    remoteStateS3,
    endpoints,
    kind: 'remoteMaster',
    nginxConfTemplatePath,
  };
}

export function remoteProxySlave(
  endpoints: EndPointMap,
  remoteStateS3: s3.S3Ref,
  nginxConfTemplatePath?: string
): ProxyConfig {
  return {
    remoteStateS3,
    endpoints,
    kind: 'remoteSlave',
    nginxConfTemplatePath,
  };
}

export function localProxy(
  endpoints: EndPointMap,
  nginxConfTemplatePath?: string
): ProxyConfig {
  return { endpoints, kind: 'local', nginxConfTemplatePath };
}

export function contextFromS3(name: string, s3Ref: s3.S3Ref): DeployContext {
  return { name, source: { kind: 's3', value: s3Ref.url() } };
}

export function contextFromSecret(name: string, arn: ArnSecret): DeployContext {
  return { name, source: { kind: 'awsSecretArn', value: arn.value } };
}

export function contextFromDb(name: string, db: rds.DbInstance): DeployContext {
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

function remoteDeployMode(
  proxy: ProxyConfig,
  nginxConfTemplatePath: Maybe<string>
): C.DeployMode {
  if (proxy.kind === 'none' || proxy.kind === 'local') {
    throw Error('camus2 not configured with proxy mode');
  }
  const remoteStateS3: Maybe<string> = {
    kind: 'just',
    value: proxy.remoteStateS3.url(),
  };
  return {
    kind: 'proxy',
    value: C.makeProxyModeConfig({
      endPoints: proxy.endpoints,
      remoteStateS3,
      nginxConfTemplatePath: nginxConfTemplatePath,
    }),
  };
}

export function installCamus2(username: string): bootscript.BootScript {
  const bs = bootscript.newBootscript();
  bs.comment('Install camus2');
  bs.mkdir('/opt/etc');
  bs.mkdir('/opt/bin');
  bs.mkdir('/opt/var/log');
  bs.mkdir('/opt/deploys');
  bs.mkdir('/opt/config');
  bs.sh(`chown -R ${username}:${username} /opt/config`);
  bs.sh(`chown -R ${username}:${username} /opt/deploys`);
  bs.sh(`chown -R ${username}:${username} /opt/var/log`);
  bs.sh('wget ' + release_url);
  bs.gunzip(['/opt/bin/camus2.gz']);
  bs.sh('chmod 755 /opt/bin/camus2');
  bs.sh('(cd /opt/bin; ln -s camus2 c2)');
  bs.sh('/opt/bin/camus2 --bash-completion-script /opt/bin/camus2 >/etc/bash_completion.d/camus2');
  bs.sh('/opt/bin/c2 --bash-completion-script /opt/bin/c2 >/etc/bash_completion.d/c2');
  return bs;
}

export function configureCamus2(
  username: string,
  releases: s3.S3Ref,
  deployContexts: DeployContext[],
  proxy: ProxyConfig,
  nginxDockerVersion: string,
  healthCheck?: C.HealthCheckConfig,
  frontendproxy_nginx_conf_tpl?: string,
  ssl_cert_email?: string,
  letsencrypt_challenge_mode?: 'http-01' | 'dns-01',
): bootscript.BootScript {
  const bs = bootscript.newBootscript();
  bs.comment('Configure camus2');

  let nginxConfTemplatePath: Maybe<string> = {
    kind: 'nothing',
  };

  if (frontendproxy_nginx_conf_tpl != undefined) {
    nginxConfTemplatePath = {
      kind: 'just',
      value: '/opt/etc/frontendproxy.nginx.conf.tpl',
    };
    bs.catToFile(nginxConfTemplatePath.value, frontendproxy_nginx_conf_tpl);
  }

  let deployMode: C.DeployMode;

  switch (proxy.kind) {
    case 'none':
      deployMode = { kind: 'noproxy' };
      break;
    case 'local':
      {
        deployMode = {
          kind: 'proxy',
          value: C.makeProxyModeConfig({
            endPoints: proxy.endpoints,
            nginxConfTemplatePath,
          }),
        };
      }
      break;
    case 'remoteSlave':
      deployMode = remoteDeployMode(proxy, nginxConfTemplatePath);
      break;
    case 'remoteMaster':
      deployMode = remoteDeployMode(proxy, nginxConfTemplatePath);
      break;
    default:
      throw Error(`proxy kind is unrecognised`);
  }
  const configSources: { [name: string]: C.JsonSource } = {};
  deployContexts.forEach(dc => {
    configSources[dc.name] = dc.source;
  });

  const jb = createJsonBinding(RESOLVER, C.texprToolConfig());
  const config = C.makeToolConfig({
    configSources,
    deployMode,
    healthCheck: healthCheck
      ? { kind: 'just', value: healthCheck }
      : { kind: 'nothing' },
    releases: {
      kind: 's3',
      value: releases.url(),
    },
    contextCache: '/opt/config',
    autoCertContactEmail: ssl_cert_email,
    nginxDockerVersion,
  });
  bs.catToFile(
    '/opt/etc/camus2.json',
    JSON.stringify(jb.toJson(config), null, 2)
  );

  if (proxy.kind === 'none' || proxy.kind === 'local') {
    // If not in proxy mode, use letsEncrypt SSL
    letsEncryptSSL(config, proxy, bs, letsencrypt_challenge_mode);
    bootscriptProxyNginxReload(bs, username);
  } else if (proxy.kind === 'remoteSlave') {
    // Install tools necessary for the slaves to poll the S3 state file
    bootscriptProxySlaveUpdate(bs, username);
    bootscriptProxyNginxReload(bs, username);
  }
  return bs;
}

/**
 * Construct a bootscript that installs and configures camus2. This
 * bootscript would normally be included into the complete instance bootscript.
 */
export function install(
  username: string,
  releases: s3.S3Ref,
  deployContexts: DeployContext[],
  proxy: ProxyConfig,
  nginxDockerVersion: string,
  healthCheck?: C.HealthCheckConfig,
  frontendproxy_nginx_conf_tpl?: string,
  ssl_cert_email?: string,
  letsencrypt_challenge_mode?: 'http-01' | 'dns-01',
): bootscript.BootScript {
  const bs = bootscript.newBootscript();
  bs.include(installCamus2(username));
  bs.include(configureCamus2(
    username,
    releases,
    deployContexts,
    proxy,
    nginxDockerVersion,
    healthCheck,
    frontendproxy_nginx_conf_tpl,
    ssl_cert_email,
    letsencrypt_challenge_mode,
  ));
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
    for (const epname of Object.keys(proxy.endpoints)) {
      const ep = proxy.endpoints[epname];
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

  if (certdnsnames.length === 0) {
    return;
  }

  switch (challenge_mode) {
    case 'http-01':
      const cmd = '/opt/bin/camus2 generate-ssl-certificate';
      bs.comment('generate an ssl certificate');
      bs.sh('sudo -u app ' + cmd);
      bs.cronJob('ssl-renewal', [
        `MAILTO=""`,
        `PATH=/bin:/usr/bin:/opt/bin:/usr/local/bin`,
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
  bs.systemd('camus2-update', [
    `[Unit]`,
    `Description=Periodically refresh local camus2 proxy state from S3`,
    ``,
    `[Service]`,
    `ExecStart=/opt/bin/camus2 slave-update --repeat 20`,
    `User=${username}`,
    `Restart=on-failure`,
    `WorkingDirectory=~`,
    ``,
    `[Install]`,
    `WantedBy=multi-user.target`,
  ]);
}

function bootscriptProxyNginxReload(
  bs: bootscript.BootScript,
  username: string
): void {
  bs.cronJob('proxy-nginx-reload', [
    `MAILTO=""`,
    `15 0 * * * ${username} docker kill --signal=SIGHUP frontendproxy`,
  ]);
}
