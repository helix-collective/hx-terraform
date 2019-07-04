# Overview

The EFK ([elasticsearch],[fluentd],[kibana]) logging system consists of the following AWS deployed infrastructure:

- A managed elasticsearch instance
- The kibana UI for log search and visualization
- A pair of aggregator EC2 instances that receive fluentd log records and write them to elasticsearch
- Various AWS cognito resources to support managed login to kibana

This is mostly managed via terraform, except that a few manual steps are required due to some AWS/terraform
idiosyncracies.

The aggregator instances are published on a well known URL. Applications wanting to log to the system use
fluentd to send log records to the agregators (along with appropriate credentials).

# Setup

1) Use the typescript/terraform [flow] to setup the shared infrastructure first (ie VPC, networking, standard
   S3 buckets, etc)

2) Decide on what your logging aggregator DNS name will be. Typically this is `logging` in the shared dns zone,
   (eg `logging.hx-myclient.com`).
   
3) Create a private key and self signed certificates to secure the logging system: 

```
openssl req -x509 -sha256 -nodes -days 3650 -newkey rsa:2048 -keyout fluentd-aggregator.key -out fluentd-sender.crt -subj "\
/O=Helix\
/C=AU\
/L=Sydney\
/OU=Technology\
/ST=New South Wales\
/CN=LOGGING_AGGREGATOR_DNSNAME"   
```

(substituting appropriate details and your chosen DNS name for LOGGING_AGGREGATOR_DNSNAME).

4) Upload the generated key file and certificate to S3. This is typically to the projects deploy bucket,
at the following paths:

```
s3://DEPLOY_BUCKET/shared/logging/fluentd-sender.crt
s3://DEPLOY_BUCKET/shared/logging/fluentd-aggregator.key 
```

5) Write the typescript code to create the infrastructure. This is typically a small module with
calls to `logging.createCognitoResources()` and `logging.createLoggingInfrastructure()`. See `logging.ts`
in the [proto-infrastructure] repository.

6) Plan and apply infrastructure changes to deploy the resources

7) Manually connect elasticsearch instance to the cognito resources, using the AWS console.

Unfortunately terraform can't automate this step (see [this issue] for details). You need
to modify the elasticsearch cluster as follows:

- Select "Enable Amazon Cognito for authentication"
- Choose the created user pool
- Choose the created identity pool
- Press Submit

8) Finally, use the AWS console to view the user pool, and invite users who require kibana
access.

[elasticsearch]:https://www.elastic.co/
[fluentd]:https://www.fluentd.org/
[kibana]:https://www.elastic.co/products/kibana
[flow]:./workflow.md
[proto-infrastructure]:https://bitbucket.org/helix-collective/proto-infrastructure/src/master/
[this issue]:https://github.com/terraform-providers/terraform-provider-aws/issues/5557
