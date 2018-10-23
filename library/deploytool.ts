import * as s3 from "./aws-s3";
import * as bootscript  from "./bootscript";


export interface ContextFile {
    name:string, 
    source_name:string
};

export function contextFile(base_s3: s3.S3Ref, file_s3: s3.S3Ref): ContextFile {
    if (base_s3.bucket != file_s3.bucket || !file_s3.key.startsWith(base_s3.key)) {
        throw new Error("contextFile: base_s3 must be a prefix of file_s3");
    }
    let source_name: string = file_s3.key.substr(base_s3.key.length);
    if (source_name.startsWith("/")) {
        source_name = source_name.substr(1);
    }
    // The name is the characters after the last slash
    const name = /[^/]*$/.exec(source_name);
    if (!name) {
        throw new Error("Invalid context file path");
    }
    return {name:name[0], source_name};
}

export interface ProxyEndPoint {
    label: string,
    details: {};

};

export function httpProxyEndpoint(label: string, serverName: string): ProxyEndPoint {
    return {
        label,
        details: {
            label,
            serverName,
            sslCertDir: "",
            etype: "httpOnly"
        }   
    };
};

export function httpsProxyEndpoint(label: string, serverName: string, sslCertDir: string): ProxyEndPoint {
    return {
        label,
        details: {
            label,
            serverName,
            sslCertDir,
            etype: "httpsWithRedirect"
        }   
    };
}

export type ProxyConfig
   = {kind: 'none'}
   | {kind: 'local', endpoints:ProxyEndPoint[]}

export function localProxy(endpoints: ProxyEndPoint[]): ProxyConfig {
    return {kind:'local', endpoints};
}

/**
 * Construct a bootscript that installs and configures the hx-deploy-tool. This
 * bootscript would normally be included into the complete instance bootscript.
 */
export function install(username: string, releases: s3.S3Ref, deploy_context: s3.S3Ref, contextFiles: ContextFile[], proxy: ProxyConfig ) : bootscript.BootScript {
    const bs = bootscript.newBootscript();
    bs.comment("Install and configure hx-deploy-tool")
    bs.mkdir("/opt/etc");
    bs.mkdir("/opt/bin");
    bs.mkdir("/opt/var/log");
    bs.mkdir("/opt/releases");
    bs.mkdir("/opt/config");
    bs.sh(`chown -R ${username}:${username} /opt/config`);
    bs.sh(`chown -R ${username}:${username} /opt/releases`);
    bs.sh(`chown -R ${username}:${username} /opt/var/log`);
    bs.sh("wget https://github.com/helix-collective/hx-deploy-tool/releases/download/0.8.2/hx-deploy-tool.x86_64-linux.gz -O /opt/bin/hx-deploy-tool.gz");
    bs.gunzip(["/opt/bin/hx-deploy-tool.gz"])
    bs.sh("chmod 755 /opt/bin/hx-deploy-tool");

    let deployMode;
    if(proxy.kind === 'none') {
        deployMode = "select";
    } else if(proxy.kind == 'local') {
        let endPoints : {[key: string]: {}} = {};
        proxy.endpoints.forEach( ep => {
            endPoints[ep.label] = ep.details;
        })
        deployMode = {
            proxy: {
                endPoints
            }
        }
    }

    const deployContextFiles = 
    bs.catToFile("/opt/etc/hx-deploy-tool.json", JSON.stringify({
        contextCache: "/opt/config",
        releases: { s3: releases.url() },
        deployContext: { s3: deploy_context.url()},
        deployContextFiles: contextFiles.map( cf => {return {
            name: cf.name,
            sourceName: cf.source_name
        }}),
        deployMode
    }, null, 2))
    return bs;
}
