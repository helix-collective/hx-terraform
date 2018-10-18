import * as docker from "./docker";
import * as s3 from "./aws-s3";
import * as deploytool from "./deploytool";
import { listeners } from "cluster";
import { listType } from "../tools/gen-helpers";

/**
 * Generator for boot scripts which are intended to be passed to an ubuntu AMI
 * via the user_data parameter.
 */
export class BootScript {
    private apt_repositories: Set<string> = new Set();
    private apt_packages: Set<string> = new Set();
    private script_lines: string[] = [];

    addAptRepository(deb_repository: string) {
        this.apt_repositories.add(deb_repository);
    }

    addAptPackage(deb_package: string) {
        this.apt_packages.add(deb_package);
    }

    sh(line: string) {
        this.script_lines.push(line);
    }

    catToFile(path:string, content: string) {
        this.script_lines.push("cat >" + path + " <<'EOF'");
        this.script_lines = this.script_lines.concat(content.split("\n"));
        this.script_lines.push("EOF");
    }

    comment(text: string) {
        this.script_lines.push("");
        this.script_lines.push("# " + text);
    }
 
    mkdir(path: string) {
        this.sh(`mkdir -p ${path}`)
    }
    utf8Locale() {
        this.comment("Set local to UTF8");
        this.sh("echo 'LC_ALL=en_US.UTF-8' >> /etc/environment");
    }

    dockerWithConfig(cfg: docker.DockerConfig) {
        this.comment("Install docker and docker-compose");
        this.sh("wget -qO- https://get.docker.com/ | sh");
        this.addUserToGroup("ubuntu","docker");
        this.addAptPackage("curl");
        this.sh("curl -L https://github.com/docker/compose/releases/download/1.14.0/docker-compose-`uname -s`-`uname -m` > /usr/local/bin/docker-compose");
        this.sh("chmod +x /usr/local/bin/docker-compose");
        this.catToFile("/etc/docker/daemon.json", docker.daemonConfig(cfg))
        this.sh("systemctl restart docker");
    }

    createUser(username: string) {
        this.comment("Creating a new user")
        this.sh(`useradd ${username} -m -s /bin/bash`)
        this.sh(`passwd -d ${username}`)
        this.sh(`mkdir /home/${username}/.ssh`)
        this.sh(`chown -R ${username}:${username} /home/${username}/.ssh`)
        this.sh(`chmod 700 /home/${username}/.ssh`)
    }

    createUserWithKeypairAccess(username: string) {
        this.createUser(username)
        this.sh(`cp /home/ubuntu/.ssh/authorized_keys ~${username}/.ssh`);
        this.sh(`chown -R ${username}:${username} /home/${username}/.ssh`);
    }

    addUserToGroup(username: string, groupname: string) {
        this.sh(`usermod -aG ${groupname} ${username}`)
    }

    cloudwatchMetrics(username: string, params0?: CloudwatchMetricsParams) {
        this.addAptPackage("libwww-perl");
        this.addAptPackage("libdatetime-perl");
        this.comment("Download and unpack the amazon scripts to record cloudwatch metrics")
        this.sh(`cd /home/${username}`);
        this.curl(["http://aws-cloudwatch.s3.amazonaws.com/downloads/CloudWatchMonitoringScripts-1.2.1.zip","-O"])
        this.unzip(["CloudWatchMonitoringScripts-1.2.1.zip"])
        this.sh(`chown -R ${username}:${username} aws-scripts-mon`)
        this.sh("rm CloudWatchMonitoringScripts-1.2.1.zip")

        const params = params0 || DEFAULT_CLOUDWATCH_METRICS_PARAMS;
        this.cronJob("cloudwatch-metrics", [
            'MAILTO=""',
            `*/5 * * * * ${username} /home/$1/aws-scripts-mon/mon-put-instance-data.pl ${params.script_args}`
             ]
        ) 
    }

    letsencyptAwsRoute53(contact_email: string, dns_domains:string[]){
        const script_path = "/opt/bin/get-ssl-certificates";
        const script = [
        `#!/bin/bash`,
        `# Request SSL certificates for ${dns_domains.join(", ")}`,
        `docker run --rm \\`,
        `  -v /etc/letsencrypt:/etc/letsencrypt \\`,
        `  -v /var/lib/letsencrypt:/var/lib/letsencrypt \\`,
        `  certbot/dns-route53 \\`,
        `  certonly --dns-route53 \\`,
        `  -m ${contact_email} -n --agree-tos \\`,
        `  ${dns_domains.map( d => '-d ' + d).join(' ')}`,
        `chmod -R ag+rX /etc/letsencrypt`,
        ]

        this.comment("Install and run certbot/dns-route53 to get SSL certificates")
        this.catToFile( script_path, script.join('\n'));
        this.sh("chmod +x " + script_path);
        this.mkdir("/etc/letsencrypt");
        this.mkdir("/var/lib/letsencrypt");
        this.sh(script_path);
        this.cronJob( "certbot-renewal", [
            `MAILTO=""`,
            `0 0 * * * root ${script_path} 2>&1 | systemd-cat`
        ])
    }

    curl(args:string[]) {
        this.addAptPackage("curl");
        this.sh( "curl " + args.join(' '));
    }

    unzip(args:string[]) {
        this.addAptPackage("unzip");
        this.sh( "unzip " + args.join(' '));
    }

    gunzip(args:string[]) {
        this.addAptPackage("gzip");
        this.sh( "gunzip " + args.join(' '));
    }

    cronJob(jobname: string, crontext:string[]) {
        const cronfile = '/etc/cron.d/' + jobname;
        this.comment(`Add a cron job for ${jobname}`);
        this.sh("mkdir -p /etc/cron.d");
        this.catToFile(cronfile, crontext.join('\n'));
        this.sh(`chmod 444 ${cronfile}`)
    }

    include(other: BootScript) {
        other.apt_repositories.forEach( pkg => {
            this.apt_repositories.add(pkg);
        });
        other.apt_packages.forEach( pkg => {
            this.apt_packages.add(pkg);
        });
        this.script_lines = this.script_lines.concat(other.script_lines);
    }

    compile(): string {
        let lines : string[] = [];
        lines.push('#!/bin/sh');
        lines.push('# Machine generated by bootscript.ts');
        if (this.apt_repositories.size > 0) {
            lines.push("apt-get update -y");
            lines.push("apt-get install -y software-properties-common");
            this.apt_repositories.forEach( ppa => {
                lines.push(`add-apt-repository -y '${ppa}'`);
            });
        }
        if (this.apt_packages.size > 0) {
            lines.push("apt-get update -y");
            this.apt_packages.forEach( pkg => {
                lines.push(`apt-get install -y '${pkg}'`);
            });            
        }
        lines.push("");
        lines = lines.concat(this.script_lines);
        return lines.join('\n');
    }
};


interface CloudwatchMetricsParams {
    script_args: string
};

const DEFAULT_CLOUDWATCH_METRICS_PARAMS :CloudwatchMetricsParams = {
    script_args: "--mem-util --mem-used --mem-avail  --disk-path=/ --disk-space-util --disk-space-avail --disk-space-used"
}

/** 
 * Create a new bootscript 
 */
export function newBootscript(): BootScript {
    return new BootScript();
}