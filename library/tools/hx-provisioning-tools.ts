import { runProcess } from "../../dnit/deps.ts";


function newPassword(size:number): string {
  // Generate a random password consisting of upper/lower alphanumerics and digits
  const rvals = new Uint8Array(size);
  crypto.getRandomValues(rvals);
  let password = "";
  rvals.forEach( v => {
    const n = v % 62;
    const c
       = n < 10 ? 48 + n 
       : n < 36 ? 65 + (n-10)
       : 97 + (n-36)
    password += String.fromCharCode(c);
  });
  return password;
}

async function setDbPassword(dbname: string, password: string): Promise<void> {
  // The AWS cli dumps json to stdout which is confusing. So ignore it.
  const result = await runProcess({
    in: "null",
    out: "null",
    err: "inherit",
    inp: null,
    cmd: [
      'aws', 'rds', 'modify-db-instance', 
      '--db-instance-identifier', dbname, 
      '--master-user-password', password,
      '--apply-immediately'
    ],
  });
  if (result.status.success !== true) {
    throw new Error(`aws rds modify-db-instance - ${result.status.code}`);
  }
}
  
async function uploadSecret(secretArn: string, value: string) {
  // The AWS cli dumps json to stdout which is confusing. So ignore it.
  const result = await runProcess({
    in: "null",
    out: "null",
    err: "inherit",
    inp: null,
    cmd: [
      'aws', 'secretsmanager', 'put-secret-value',
      '--secret-id', secretArn, 
      '--secret-string', value,
    ],
  });
  if (result.status.success !== true) {
    throw new Error(`aws rds modify-db-instance - ${result.status.code}`);
  }
}

async function rdsPasswordToSecret(dbname: string, secretArn: string): Promise<void> {
  const password = newPassword(20);
  await setDbPassword(dbname, password);
  await uploadSecret(secretArn, JSON.stringify({'db-password': password}));
}

async function rdsPasswordToS3(dbname: string, s3bucket: string, s3Path: string): Promise<void>  {
  throw new Error("Function not implemented.");
}

async function passwordToSecret(size: string, secretArn: string): Promise<void>  {
  throw new Error("Function not implemented.");
}

async function main() {
  console.log("hx-provisioning-tools", Deno.args);

  const args = Deno.args;
  if (args.length === 4 && args[0] === 'generate-rds-password' && args[1] === '--to-secret') {
    await rdsPasswordToSecret(args[2], args[3]);
  } else if (args.length === 5 && args[0] === 'generate-rds-password' && args[1] === '--to-s3') {
      await rdsPasswordToS3(args[2], args[3], args[4]);
  } else if (args.length === 5 && args[0] === 'generate-password' && args[1] === '--size' && args[3] === '--to-secret') {
      await passwordToSecret(args[2], args[4]);
  } else {
    usage();
  }
}

function usage() {
  console.log("Usage:");
  console.log("  hx-provisioning-tools  generate-rds-password --to-secret DBNAME SECRETARN");
  console.log("  hx-provisioning-tools  generate-rds-password --to-s3 DBNAME S3BUCKET S3PATH");
  console.log("  hx-provisioning-tools  generate-password --size N --to-secret SECRETARN");
  Deno.exit(1);
}

main()
.catch(err=>{
  console.error("error in main", err);
});
