# AWS lambda function to make periodic calls for scheduled actions.
#
# It retrieves a shared key from the AWS secrets manager, and make a post
# request to a specified endpoint.

import boto3
import json
import logging
from botocore.vendored import requests

secrets = boto3.client("secretsmanager")

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def post_cron_webhook(event, context):
    secret_arn = event["shared_secret_arn"]
    endpoint = event["endpoint"]
    shared_key = json.loads(secrets.get_secret_value(SecretId=secret_arn)["SecretString"])["secret"]
    headers = {
        "X-Cron-Auth" : shared_key
    }
    logger.info("POST request to " + endpoint)
    r = requests.post(endpoint, headers=headers)
    r.raise_for_status()
