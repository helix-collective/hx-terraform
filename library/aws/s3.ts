import * as TF from '../../core/core';
import * as AR from '../../providers/aws/resources';

/**
 * Represents an object reference in a specified S3 bucket
 */
export class S3Ref {
  constructor(public readonly bucket: string, public readonly key: string) {}

  url() {
    return 's3://' + this.bucket + this.normalizeKey(this.key);
  }

  extendKey(extra: string): S3Ref {
    return new S3Ref(this.bucket, this.key + this.normalizeKey(extra));
  }

  private normalizeKey(key: string): string {
    return (key.startsWith('/') ? '' : '/') + key;
  }
}

/**
 * Create an S3 json object inside the given bucket.
 */
export function createObjectFromJson(
  tfgen: TF.Generator,
  name: string,
  ref: S3Ref,
  json: {}
): AR.S3BucketObject {
  return AR.createS3BucketObject(tfgen, name, {
    bucket: ref.bucket,
    key: ref.key,
    content: JSON.stringify(json, null, 2),
  });
}

/**
 * Create an S3 text object inside the given bucket.
 */
export function createObjectFromText(
  tfgen: TF.Generator,
  name: string,
  ref: S3Ref,
  content: string
): AR.S3BucketObject {
  return AR.createS3BucketObject(tfgen, name, {
    content,
    bucket: ref.bucket,
    key: ref.key,
  });
}

/**
 * Create an S3 text object inside the given bucke, with content from a file.
 */
export function createObjectFromFile(
  tfgen: TF.Generator,
  name: string,
  ref: S3Ref,
  sourcePath: string
): AR.S3BucketObject {
  return AR.createS3BucketObject(tfgen, name, {
    bucket: ref.bucket,
    key: ref.key,
    source: sourcePath,
  });
}

/**
 * Block all public access for a bucket
 */
export function blockPublicAccess(
  tfgen: TF.Generator,
  tfname: string,
  bucket: string
) {
  AR.createS3BucketPublicAccessBlock(tfgen, tfname, {
    bucket,
    block_public_acls: true,
    block_public_policy: true,
    restrict_public_buckets: true,
    ignore_public_acls: true,
  });
}
