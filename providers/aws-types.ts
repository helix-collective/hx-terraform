/**
 *  Types used in the AWS terraform resources
 *
 * Most "stringish" types are wrapped in classes for type safety... even
 * though an aws region and an instance id are both strings, we want to
 * avoid confusing them by giving them different types.
 */

import * as TF from "../core/core";

export type Region = {
  type: 'Region',
  value: string
}

export function region(v: string): Region {
  return {type:'Region', value:v};
};

export const us_east_1 = region("us-east-1");
export const us_east_2 = region("us-east-2");
export const us_west_1 = region("us-west-1");
export const us_west_2 = region("us-west-2");
export const ap_southeast_1 = region("ap-southeast-1");
export const ap_southeast_2 = region("ap-southeast-2");

//----------------------------------------------------------------------

export type StringAttr = TF.Attribute<'string'>;

//----------------------------------------------------------------------

export type Arn = {
  type: 'Arn',
  value: string
}
export type ArnAttr = TF.Attribute<'Arn'>;

export function arn(v: string): Arn {
  return {type:'Arn', value:v};
};

//----------------------------------------------------------------------

export type AvailabilityZone = {
  type: 'AvailabilityZone',
  value: string
}
export type AvailabilityZoneAttr = TF.Attribute<'AvailabilityZone'>;

export function availabilityZone(v: string): AvailabilityZone {
  return {type:'AvailabilityZone', value:v};
};

export const ap_southeast_2a = availabilityZone("ap-southeast-2a");
export const ap_southeast_2b = availabilityZone("ap-southeast-2b");
export const ap_southeast_2c = availabilityZone("ap-southeast-2c");

//----------------------------------------------------------------------

export type CidrBlock = {
  type: 'CidrBlock',
  value: string
}
export type CidrBlockAttr = TF.Attribute<'CidrBlock'>;

export function cidrBlock(v: string): CidrBlock {
  return {type:'CidrBlock', value:v};
};

//----------------------------------------------------------------------

export type Ami = {
  type: 'Ami',
  value: string
}

export function ami(v: string): Ami {
  return {type:'Ami', value:v};
};

//----------------------------------------------------------------------

export type InstanceType = {
  type: 'InstanceType',
  value: string
}

export function instanceType(v: string): InstanceType {
  return {type:'InstanceType', value:v};
};

export const t2_nano = instanceType("t2.nano");
export const t2_micro = instanceType("t2.micro");
export const t2_small = instanceType("t2.small");
export const t2_medium = instanceType("t2.medium");
export const t2_large = instanceType("t2.large");
export const t2_xlarge = instanceType("t2.xlarge");
export const t2_2xlarge = instanceType("t2.2xlarge");

//----------------------------------------------------------------------

export type CannedAcl = {
  type: 'CannedAcl',
  value: string
}

export function cannedAcl(v: string): CannedAcl {
  return {type:'CannedAcl', value:v};
};

export const ca_private = cannedAcl("private");
export const ca_public_read = cannedAcl("public-read");
export const ca_public_read_write = cannedAcl("public-read-write");
export const ca_aws_exec_read = cannedAcl("aws-exec-read");
export const ca_authenticated_read = cannedAcl("authenticated-read");
export const ca_bucket_owner_read = cannedAcl("bucket-owner-read");
export const ca_bucket_owner_full_control = cannedAcl("bucket-owner-full-control");
export const ca_log_delivery_write = cannedAcl("log-delivery-write");

//----------------------------------------------------------------------

export type KeyName = {
  type: 'KeyName',
  value: string
}

export function keyName(v: string): KeyName {
  return {type:'KeyName', value:v};
};

//----------------------------------------------------------------------

export type IpAddress = {
  type: 'IpAddress',
  value: string
}

export function ipAddress(v: string): IpAddress {
  return {type:'IpAddress', value:v};
};

export type IpAddressAttr = TF.Attribute<'IpAddress'>;

//----------------------------------------------------------------------

export type HostedZoneId = {
  type: 'HostedZoneId',
  value: string
}

export function hostedZoneId(v: string): HostedZoneId {
  return {type:'HostedZoneId', value:v};
};

export type HostedZoneIdAttr = TF.Attribute<'HostedZoneId'>;

//----------------------------------------------------------------------

export type DbEngine = {
  type: 'DbEngine',
  value: string
}

export function dbEngine(v: string): DbEngine {
  return {type:'DbEngine', value:v};
};

export const aurora: DbEngine = dbEngine('aurora');
export const aurora_mysql: DbEngine = dbEngine('aurora-mysql');
export const aurora_postgresql: DbEngine = dbEngine('aurora-postgresql');
export const mariadb: DbEngine = dbEngine('mariadb');
export const mysql: DbEngine = dbEngine('mysql');
export const oracle_ee: DbEngine = dbEngine('oracle-ee');
export const oracle_se2: DbEngine = dbEngine('oracle-se2');
export const oracle_se1: DbEngine = dbEngine('oracle-se1');
export const oracle_se: DbEngine = dbEngine('oracle-se');
export const postgres: DbEngine = dbEngine('postgres');
export const sqlserver_ee: DbEngine = dbEngine('sqlserver-ee');
export const sqlserver_se: DbEngine = dbEngine('sqlserver-se');
export const sqlserver_ex: DbEngine = dbEngine('sqlserver-ex');
export const sqlserver_web: DbEngine = dbEngine('sqlserver-web');

//----------------------------------------------------------------------

export type DbInstanceType = {
  type: 'DbInstanceType',
  value: string
}

export function dbInstanceType(v: string): DbInstanceType {
  return {type:'DbInstanceType', value:v};
};


export const db_m4_large: DbInstanceType = dbInstanceType("db.m4.large");
export const db_m4_xlarge: DbInstanceType = dbInstanceType("db.m4.xlarge");
export const db_m4_2xlarge: DbInstanceType = dbInstanceType("db.m4.2xlarge");
export const db_m4_4xlarge: DbInstanceType = dbInstanceType("db.m4.4xlarge");
export const db_m4_10xlarge: DbInstanceType = dbInstanceType("db.m4.10xlarge");
export const db_m4_16xlarge: DbInstanceType = dbInstanceType("db.m4.16xlarge");
export const db_m3_medium: DbInstanceType = dbInstanceType("db.m3.medium");
export const db_m3_large: DbInstanceType = dbInstanceType("db.m3.large");
export const db_m3_xlarge: DbInstanceType = dbInstanceType("db.m3.xlarge");
export const db_m3_2xlarge: DbInstanceType = dbInstanceType("db.m3.2xlarge");
export const db_r4_large: DbInstanceType = dbInstanceType("db.r4.large");
export const db_r4_xlarge: DbInstanceType = dbInstanceType("db.r4.xlarge");
export const db_r4_2xlarge: DbInstanceType = dbInstanceType("db.r4.2xlarge");
export const db_r4_4xlarge: DbInstanceType = dbInstanceType("db.r4.4xlarge");
export const db_r4_8xlarge: DbInstanceType = dbInstanceType("db.r4.8xlarge");
export const db_r4_16xlarge: DbInstanceType = dbInstanceType("db.r4.16xlarge");
export const db_x1e_xlarge: DbInstanceType = dbInstanceType("db.x1e.xlarge");
export const db_x1e_2xlarge: DbInstanceType = dbInstanceType("db.x1e.2xlarge");
export const db_x1e_4xlarge: DbInstanceType = dbInstanceType("db.x1e.4xlarge");
export const db_x1e_8xlarge: DbInstanceType = dbInstanceType("db.x1e.8xlarge");
export const db_x1e_16xlarge: DbInstanceType = dbInstanceType("db.x1e.16xlarge");
export const db_x1e_32xlarge: DbInstanceType = dbInstanceType("db.x1e.32xlarge");
export const db_x1_16xlarge: DbInstanceType = dbInstanceType("db.x1.16xlarge");
export const db_x1_32xlarge: DbInstanceType = dbInstanceType("db.x1.32xlarge");
export const db_r3_large: DbInstanceType = dbInstanceType("db.r3.large");
export const db_r3_xlarge: DbInstanceType = dbInstanceType("db.r3.xlarge");
export const db_r3_2xlarge: DbInstanceType = dbInstanceType("db.r3.2xlarge");
export const db_r3_4xlarge: DbInstanceType = dbInstanceType("db.r3.4xlarge");
export const db_r3_8xlarge: DbInstanceType = dbInstanceType("db.r3.8xlarge");
export const db_t2_micro: DbInstanceType = dbInstanceType("db.t2.micro");
export const db_t2_small: DbInstanceType = dbInstanceType("db.t2.small");
export const db_t2_medium: DbInstanceType = dbInstanceType("db.t2.medium");
export const db_t2_large: DbInstanceType = dbInstanceType("db.t2.large");
export const db_t2_xlarge: DbInstanceType = dbInstanceType("db.t2.xlarge");
export const db_t2_2xlarge: DbInstanceType = dbInstanceType("db.t2.2xlarge");
