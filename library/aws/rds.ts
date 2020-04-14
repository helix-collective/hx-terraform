import * as _ from 'lodash';
import * as TF from '../../core/core';
import * as AT from '../../providers/aws/types';
import * as AR from '../../providers/aws/resources';
import * as s3 from './s3';
import * as bootscript from '../bootscript';
import { SharedResources, GenSharedResources, PublicAzResources, SplitAzResources } from './shared';
import {
  ingressOnPort,
  egress_all,
  contextTagsWithName,
  Customize,
} from '../util';
import { ArnSecret } from './secrets';

export interface DbInstance {
  instance: AR.DbInstance;
  config_json: {};
  password_to: PasswordStore;
}

// We can store the password either in S3 or the AWS secret manager
export type PasswordStore = PasswordStoreS3 | PasswordStoreSecretManager;

interface PasswordStoreS3 {
  kind: 's3';
  s3Ref: s3.S3Ref;
}

interface PasswordStoreSecretManager {
  kind: 'secret';
  arnSecret: ArnSecret;
}


/**
 * Create an RDS postgres database, with suitable defaults for a uat helix environment.
 * The defaults can be overridden via the customize parameter. A randomly master password
 * will be generated, and stored as json in the password_to location.
 */
export function createPostgresInstance(
  tfgen: TF.Generator,
  name: string,
  sr: SharedResources,
  params: {
    db_name: string;
    db_instance_type: AT.DbInstanceType;
    password_to: PasswordStore;
    customize?: Customize<AR.DbInstanceParams>;
    use_external_subnets?: boolean;
  }
): DbInstance { 
  const params2 = {
    ...params,
    select_subnet: 
      (az: SplitAzResources) => 
        params.use_external_subnets
          ? az.external_subnet
          : az.internal_subnet
  }
  return createPostgresInstanceGeneric(tfgen,name, sr, params2)
}

/**
 * Create an RDS postgres database, with suitable defaults for a uat helix environment.
 * The defaults can be overridden via the customize parameter. A randomly master password
 * will be generated, and stored as json in the password_to location.
 */
export function createPostgresInstanceGeneric<AZ>(
  tfgen: TF.Generator,
  name: string,
  sr: GenSharedResources<AZ>,
  params: {
    db_name: string;
    db_instance_type: AT.DbInstanceType;
    password_to: PasswordStore;
    customize?: Customize<AR.DbInstanceParams>;
    select_subnet: (az: AZ) => AR.Subnet;
  }
): DbInstance {
  const sname = tfgen.scopedName(name).join('_');

  const security_group = AR.createSecurityGroup(tfgen, name, {
    vpc_id: sr.network.vpc.id,
    ingress: [ingressOnPort(5432)],
    egress: [egress_all],
    tags: contextTagsWithName(tfgen, name),
  });

  const db_subnet_group = AR.createDbSubnetGroup(tfgen, name, {
    name: sname,
    subnet_ids: sr.network.azs.map(
      az => params.select_subnet(az).id
    ),
  });

  const dbparams: AR.DbInstanceParams = {
    allocated_storage: 5, // The allocated storage size in gibibytes
    engine: AT.postgres,
    instance_class: params.db_instance_type,
    username: 'postgres',
    password: 'REPLACEME',
    identifier: sname.replace(/_/g, '-'),
    name: params.db_name,
    engine_version: '11.5',
    publicly_accessible: false,
    backup_retention_period: 3,
    vpc_security_group_ids: [security_group.id],
    db_subnet_group_name: db_subnet_group.name,
    tags: tfgen.tagsContext(),
    final_snapshot_identifier: sname.replace(/_/g, '-') + '-final',
    skip_final_snapshot: false,
    apply_immediately: false,
    storage_type: AT.gp2,
  };

  if (params.customize) {
    params.customize(dbparams);
  }
  const db = AR.createDbInstance(tfgen, name, dbparams);

  const config_json = {
    name: db.name,
    username: db.username,
    address: db.address,
    port: db.port,
  };

  createPasswordProvisioner(tfgen, sr, db, params.password_to);

  return {
    config_json,
    password_to: params.password_to,
    instance: db,
  };
}

/**
 * Create an RDS mariadb database, with suitable defaults for a uat helix environment.
 * The defaults can be overridden via the customize parameter. A randomly master password
 * will be generated, and stored as json in the password_s3 location.
 */
export function createMariaDbInstance(
  tfgen: TF.Generator,
  name: string,
  sr: SharedResources,
  params: {
    db_name: string;
    db_instance_type: AT.DbInstanceType;
    password_to: PasswordStore;
    customize?: Customize<AR.DbInstanceParams>;
    use_external_subnets?: boolean;
  }
): DbInstance {
  const sname = tfgen.scopedName(name).join('_');

  const security_group = AR.createSecurityGroup(tfgen, name, {
    vpc_id: sr.network.vpc.id,
    ingress: [ingressOnPort(3306)],
    egress: [egress_all],
    tags: contextTagsWithName(tfgen, name),
  });

  const db_subnet_group = AR.createDbSubnetGroup(tfgen, name, {
    name: sname,
    subnet_ids: sr.network.azs.map(
      az =>
        params.use_external_subnets
          ? az.external_subnet.id
          : az.internal_subnet.id
    ),
  });

  const dbparams: AR.DbInstanceParams = {
    allocated_storage: 5,
    engine: AT.mariadb,
    instance_class: params.db_instance_type,
    username: 'mariadb',
    password: 'REPLACEME',
    identifier: sname.replace(/_/g, '-'),
    name: params.db_name,
    engine_version: '10.2.15',
    publicly_accessible: false,
    backup_retention_period: 3,
    vpc_security_group_ids: [security_group.id],
    db_subnet_group_name: db_subnet_group.name,
    tags: tfgen.tagsContext(),
    final_snapshot_identifier: sname.replace(/_/g, '-') + '-final',
    skip_final_snapshot: false,
    apply_immediately: false,
    storage_type: AT.gp2,
  };

  if (params.customize) {
    params.customize(dbparams);
  }
  const db = AR.createDbInstance(tfgen, name, dbparams);

  const config_json = {
    name: db.name,
    username: db.username,
    address: db.address,
    port: db.port,
  };

  createPasswordProvisioner(tfgen, sr, db, params.password_to);

  return {
    config_json,
    password_to: params.password_to,
    instance: db,
  };
}

/**
 * Create an mssql database, with suitable defaults for a uat helix environment.
 * The defaults can be overridden via the customize parameter. A random master password
 * will be generated, and stored as json in the password_s3 location.
 */
export function createMssqlInstance(
  tfgen: TF.Generator,
  name: string,
  sr: SharedResources,
  params: {
    db_name: string;
    db_instance_type: AT.DbInstanceType;
    password_to: PasswordStore;
    customize?: Customize<AR.DbInstanceParams>;
    use_external_subnets?: boolean;
  }
): DbInstance {
  const sname = tfgen.scopedName(name).join('_');

  const security_group = AR.createSecurityGroup(tfgen, name, {
    vpc_id: sr.network.vpc.id,
    ingress: [ingressOnPort(1433)],
    egress: [egress_all],
    tags: contextTagsWithName(tfgen, name),
  });

  const db_subnet_group = AR.createDbSubnetGroup(tfgen, name, {
    name: sname,
    subnet_ids: sr.network.azs.map(
      az =>
        params.use_external_subnets
          ? az.external_subnet.id
          : az.internal_subnet.id
    ),
  });

  const dbparams: AR.DbInstanceParams = {
    allocated_storage: 20,
    engine: AT.sqlserver_ex,
    instance_class: params.db_instance_type,
    username: 'sa',
    password: 'REPLACEME',
    identifier: sname.replace(/_/g, '-'),
    engine_version: '14.00.3035.2.v1',
    publicly_accessible: false,
    backup_retention_period: 3,
    vpc_security_group_ids: [security_group.id],
    db_subnet_group_name: db_subnet_group.name,
    tags: tfgen.tagsContext(),
    final_snapshot_identifier: sname.replace(/_/g, '-') + '-final',
    skip_final_snapshot: false,
    license_model: 'license-included',
  };

  if (params.customize) {
    params.customize(dbparams);
  }
  const db = AR.createDbInstance(tfgen, name, dbparams);

  const config_json = {
    name: params.db_name,
    username: db.username,
    address: db.address,
    port: db.port,
  };

  createPasswordProvisioner(tfgen, sr, db, params.password_to);

  return {
    config_json,
    password_to: params.password_to,
    instance: db,
  };
}

function createPasswordProvisioner<AZ>(
  tfgen: TF.Generator,
  sr: GenSharedResources<AZ>,
  db: AR.DbInstance,
  passwordStore: PasswordStore
) {
  switch (passwordStore.kind) {
    case 's3':
      tfgen.localExecProvisioner(
        db,
        [
          '# Generate a random password for the instance, and upload it to S3',
          `export AWS_REGION=${sr.network.region.value}`,
          `hx-provisioning-tools generate-rds-password --to-s3 ${db.id.value} ${
            sr.deploy_bucket.id
          } ${passwordStore.s3Ref.key}`,
        ].join('\n')
      );
      break;
    case 'secret':
      tfgen.localExecProvisioner(
        db,
        [
          '# Generate a random password for the instance, and upload it to AWS Secret Manager',
          `export AWS_REGION=${sr.network.region.value}`,
          `hx-provisioning-tools generate-rds-password --to-secret ${
            db.id.value
          } ${passwordStore.arnSecret.value}`,
        ].join('\n')
      );
      break;
  }
}

/**
 * Bootscript for an ubuntu machine that installs the mssql command lines tools
 */
export function installMssqlTools(): bootscript.BootScript {
  const bs = bootscript.newBootscript();
  bs.comment('install msql command line tools');
  bs.addAptKeyUrl('https://packages.microsoft.com/keys/microsoft.asc');
  bs.addAptRepository(
    'deb [arch=amd64] https://packages.microsoft.com/ubuntu/16.04/prod xenial main'
  );
  bs.sh('ACCEPT_EULA=Y apt-get install -y mssql-tools unixodbc-dev');
  return bs;
}

/**
 * Construct a db parameter group for RDS customization
 */
export function createDbParameterGroup(
  tfgen: TF.Generator,
  rname: string,
  params: AR.DbParameterGroupParams
): AR.DbParameterGroup {
  return AR.createDbParameterGroup(tfgen, rname, {
    name: tfgen
      .scopedName(rname)
      .join('-')
      .replace(/_/g, '-'),
    tags: tfgen.tagsContext(),
    ...params,
  });
}
