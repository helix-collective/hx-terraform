# Using SSL for RDS postgres connections
We generally have considered that connections between application servers and postgres need not be
encrypted when they are restricted to a VPC. However, for compliance or other reasons some projects may
require all data in flight to be encrypted... hence the need to enable SSL for appserver <-> postgres communications.

By default, RDS postgres instances allow both unencrypted and SSL connections. For java application servers
SSL connections can be specified with some [additional jdbc connection parameters][jdbc]. The two of primary
import are `sslmode` and `sslrootcert`. To require SSL for RDS connections, `sslmode` must be `require` and `sslrootcert`
must be the local filesystem path of the AWS RDS root certificate (downloaded from [here][awsrootcert]).

To faciliate this, changes have been made in [helix-core][] so that these parameters are allowed (but optional) in
our standard [postgres connection config type][configadl]. Hence code changes should not be required - only
config files need to be updated.

Note also that the RDS root cert needs to be provisioned so that the appserver can access it. Various approaches
are possible, including downloading the cert and baking it into the appserver docker image. Note this cert will
be updated every 5 years.

SSL connections from the `psql` command line tool need the extra two parameters. For example:

```
 psql "host=XXXX.ap-southeast-2.rds.amazonaws.com dbname=DBNAME user=postgres  sslrootcert=/tmp/rds-ca-2019-root.pem sslmode=verify-full"
```

Finally, if you need to disallow non-ssl connections from the RDS database side you'll need to configure
the db with a parameter group where `rds.force_ssl` to be `1`. In our typescript terraform code the `createPostgresInstance()` helper function has an optional parameter to do this.

[jdbc]:https://jdbc.postgresql.org/documentation/head/connect.html#ssl
[awsrootcert]:https://s3.amazonaws.com/rds-downloads/rds-ca-2019-root.pem
[helix-core]:https://github.com/helix-collective/helix-core
[configadl]:https://github.com/helix-collective/helix-core/blob/master/adl/common/config/db.adl#L5

