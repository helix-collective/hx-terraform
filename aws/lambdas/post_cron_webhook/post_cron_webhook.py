# AWS lambda function to make periodic calls for scheduled actions.
#
# It retrieves a shared key from the AWS secrets manager, and make a post
# request to a specified endpoint.

import boto3
import json
import logging
import os
import elasticache_auto_discovery
from botocore.vendored import requests
from pymemcache.client.hash import HashClient

secrets = boto3.client("secretsmanager")

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def post_cron_webhook(event, context):
    # We don't want to process duplicate webhook requests from Cloudwatch events
    # So we have a memcached cluster that stores records of previously processed request ids
    memcached_client = setup_memcached()
    if (memcached_client.get(context.function_name) == event['id']):
        return
    memcached_client.set(context.function_name, event['id'])

    secret_arn = event["shared_secret_arn"]
    endpoint = event["endpoint"]
    shared_key = json.loads(secrets.get_secret_value(SecretId=secret_arn)["SecretString"])["secret"]
    headers = {
        "X-Cron-Auth" : shared_key
    }
    logger.info("POST request to " + endpoint)
    r = requests.post(endpoint, headers=headers)
    r.raise_for_status()

def setup_memcached():
    elasticache_config_endpoint = os.environ["ECACHE_ENDPOINT"]
    nodes = elasticache_auto_discovery.discover(elasticache_config_endpoint)
    nodes = map(lambda x: (x[1], int(x[2])), nodes)
    return HashClient(nodes, serializer=json_serializer, deserializer=json_deserializer)

def json_serializer(key, value):
    if type(value) == str:
        return value, 1
    return json.dumps(value), 2

def json_deserializer(key, value, flags):
   if flags == 1:
       return value
   if flags == 2:
       return json.loads(value)
   raise Exception("Unknown serialization format")
