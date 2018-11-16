/**
 * Assemble logging infrastructure based upon AWS elasticsearch and fluentd aggregators
 * running on EC2.
 */

import * as _ from 'lodash';
import * as TF from "../core/core"
import * as AT from "../providers/aws-types";
import * as AR from "../providers/aws-resources";
import * as policies from "./aws-policies";
import * as roles from "./aws-roles";
import * as aws from "./aws";
import * as s3 from "./aws-s3";
import * as bootscript from "./bootscript";
import * as util from "./util";
import {SharedResources} from "./aws-shared";
import * as docker from "./docker"


export interface LoggingInfrastructureParams {
    secrets_s3_ref: s3.S3Ref,
    domain_name: string,
    aggregator_key_name: AT.KeyName,
    customize?: util.Customize<AR.ElasticsearchDomainParams>,
    logging_ip_whitelist?: AT.IpAddress[]
};

export interface LoggingInfrastructure {
    aggregator_ipaddresses: AT.IpAddress[]
};

export function createLoggingInfrastructure(tfgen: TF.Generator, sr: SharedResources, params: LoggingInfrastructureParams): LoggingInfrastructure {

    // An S3 bucket for longer-term storage
    const logs_bucket_name = sr.s3_bucket_prefix + "-shared-logs";
    const logs_bucket = AR.createS3Bucket(tfgen, "logs", {
      bucket: logs_bucket_name,
      tags: tfgen.tagsContext()
    });

    // An iam role
    const iamr = roles.createIamRoleWithPolicies(tfgen, "logging", [
        policies.s3ModifyPolicy("s3modify", logs_bucket_name)
    ])

    // The ES domain itself
    const edparams: AR.ElasticsearchDomainParams= {
        domain_name: params.domain_name,
        elasticsearch_version: "5.5",
        cluster_config: {
            instance_type: AT.m4_large_elasticsearch,
            instance_count: 2,
            dedicated_master_enabled: false
        },
        advanced_options: {
            "rest.action.multi.allow_explicit_index":"true"
        },
        snapshot_options: {
            automated_snapshot_start_hour: 23
        },
        ebs_options: {
            ebs_enabled: true,
            volume_size: 100,
            volume_type: "gp2"
        },
        tags: tfgen.tagsContext()
    };
    if (params.customize) {
        params.customize(edparams);
    }
    const ed = AR.createElasticsearchDomain(tfgen, "logging", edparams);

    const instance_profile = roles.createInstanceProfileWithPolicies(tfgen, "aggregator_policies", [
        policies.s3ReadonlyPolicy("s3readonly", params.secrets_s3_ref.bucket),
        policies.edModifyPolicy("elastic_search_modify_policy", ed)
      ])

    const security_group = aws.createSecurityGroupInVpc(tfgen, "security_group", sr, {
        egress:[util.egress_all],
        ingress:[util.ingressOnPort(22), util.ingressOnPort(80), util.ingressOnPort(443), util.ingressOnPort(24224)]    
    });

    // Create the two fluentd log aggregator instances, on the public
    // subnets in two different AZ.
    const bs = bootscript.newBootscript();
    bs.utf8Locale()
    bs.dockerWithConfig(docker.DEFAULT_CONFIG);
    bs.createUserWithKeypairAccess("app");
    bs.addUserToGroup("app", "docker");
    bs.addAptPackage("jq");
    bs.mkdir("/opt/etc/secrets");
    bs.s3Fetch(params.secrets_s3_ref.extendKey("/fluentd-aggregator.key"), "/opt/etc/secrets/fluentd-aggregator.key", 10);
    bs.s3Fetch(params.secrets_s3_ref.extendKey("/fluentd-sender.crt"), "/opt/etc/secrets/fluentd-sender.crt", 10);
    bs.catToFile("/opt/etc/fluentd.conf", FLUENTD_CONFIG_FILE);
    bs.catToFile("/opt/etc/docker-compose.yml", DOCKER_COMPOSE_FILE);
    bs.sh(dockerLoginCommand(sr.network.region))
    bs.sh("sudo -H -u app docker-compose -f /opt/etc/docker-compose.yml up -d")

    function laparams(subnet: AR.Subnet): aws.InstanceWithEipParams {
        return {
          instance_type: AT.t2_small,
          ami,
          security_group,
          key_name: params.aggregator_key_name,
          customize_instance: p => {
              p.iam_instance_profile = instance_profile.id,
              p.subnet_id = subnet.id,
              p.user_data = bs.compile()
          }
      };
    };
    const la1 = aws.createInstanceWithEip(tfgen, "log_aggregator_one", sr, laparams(aws.firstAzExternalSubnet(sr)));
    const la2 = aws.createInstanceWithEip(tfgen, "log_aggregator_two", sr, laparams(aws.secondAzExternalSubnet(sr)));

    // The whitelist of static ip addresses allowed to write to the ES domain
    let logging_ip_whitelist : AT.IpAddress[] = [
        la1.eip.public_ip,
        la2.eip.public_ip
    ];
    if (params.logging_ip_whitelist) {
        logging_ip_whitelist = logging_ip_whitelist.concat(params.logging_ip_whitelist);
    }

    AR.createElasticsearchDomainPolicy(tfgen, "logging_ed_policy", {
        domain_name: params.domain_name,
        access_policies: JSON.stringify( es_access_policy(ed, logging_ip_whitelist.map(i => i.value), iamr), null, 2)
    });

    return {
        aggregator_ipaddresses:[la1.eip.public_ip,la2.eip.public_ip]
    }
}

function es_access_policy(domain: AR.ElasticsearchDomain, static_ip_whitelist: string[], role: AR.IamRole):{} {
    return {
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "AWS": "*"
            },
            "Action": "es:*",
            "Resource": `${domain.arn.value}/*`,
            "Condition": {
              "IpAddress": {
                "aws:SourceIp":static_ip_whitelist
              }
            }
          },
          {
            "Effect": "Allow",
            "Principal": {
              "AWS": role.arn.value
            },
            "Action": "es:*",
            "Resource": `${domain.arn.value}/*`
          }
        ]
      };      
}

// Ubuntu 16.04 AMIS (xenial, hvm:ebs-ssd)
// see https://cloud-images.ubuntu.com/locator/ec2/
function ami(region: AT.Region): AT.Ami {
    if (region == AT.ap_southeast_2) {
      return AT.ami("ami-47c21a25");
    } else if (region == AT.us_east_1) {
      return AT.ami("ami-759bc50a");
    } else if (region == AT.us_east_2) {
      return AT.ami("ami-5e8bb23b");
    }
    throw new Error("No ami for region");
  };

function dockerLoginCommand(region:AT.Region): string {
    return `sudo -H -u app \`(aws ecr get-login --region ${region.value} | sed -e 's/-e none//g')\``;
}

const DOCKER_COMPOSE_FILE: string = `\
version: '2'
services:
  fluentd:
    image: helixta/fluentd:2018-08-06
    ports:
        - 24224:24224
        - 24224/udp
    volumes:
      - /opt/etc:/fluentd/etc
      - /opt/etc/secrets:/etc/secrets
      - /home/app:/fluend/buffer
    environment:
      - FLUENTD_CONF=fluentd.conf
`;

const FLUENTD_CONFIG_FILE = `\
<source>
  @type forward
  port 24224
  <transport tls>
    cert_path /etc/secrets/fluentd-sender.crt
    private_key_path /etc/secrets/fluentd-aggregator.key
  </transport>
</source>
<filter **>
  @type ec2_metadata
  metadata_refresh_seconds 300 # Optional, default 300 seconds
  <record>
    logs_ec2_instance_id   \$\${instance_id}
  </record>
</filter>
<match **>
  @type copy
  <store>
    @type \"aws-elasticsearch-service\"

    # If the record has an @es_index field, use that as the
    # elastic index. Otherwise use unknown-YYYY.MM.DD
    target_index_key @es_index
    logstash_format true
    logstash_prefix unknown

    flush_interval 10s
    buffer_type file
    buffer_path /fluentd/buffer/es/
    buffer_chunk_limit 1m

    reload_connections false
    reload_on_failure false
    <endpoint>
      url https://search-hx-logging-rdkz3jz7fl4xfcgnrz73ycljmm.ap-southeast-2.es.amazonaws.com
      region ap-southeast-2
    </endpoint>
  </store>
  <store>
    @type stdout
  </store>
</match>
`;
