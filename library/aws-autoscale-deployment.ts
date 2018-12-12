
import * as TF from '../core/core';

import * as AT from '../providers/aws-types';
import * as shared from './aws-shared';
import * as s3 from './aws-s3';

/**
 *  Creates a logical deployment on an aws EC2 autoscaling group, including:
 *
 *      - the autoscale group itelf
 *      - AWS generated SSL certificates
 *      - DNS entries for the endpoints
 *
 * hx-deploy-tool is configured onto the group, running in remote proxy mode.
 */
export function createAutoscaleDeployment(
  tfgen: TF.Generator,
  name: string,
  sr: shared.SharedResources,
  params: AutoscaleDeploymentParams
): AutoscaleDeployment {

    // TODO(dong): implement!!
    return {};
}

interface AutoscaleDeploymentParams {
  /**
   * The AWS keyname used for the EC2 instance.
   */
  key_name: AT.KeyName;

  /**
   * The DNS name of the machine. This is a prefix to the shared primary DNS zone.
   * (ie if the value is aaa and the primary dns zone is helix.com, then the final DNS entry
   * will be aaa.helix.com).
   */
  dns_name: string;

  /**
   * The S3 location where hx-deploy-tool releases are stored.
   */
  releases_s3: s3.S3Ref;

  /**
   * The S3 location where hx-deploy-tool context files are stored.
   */
  config_s3: s3.S3Ref;

  // TODO(dong): extend with all of the option fields in the 
  // haskell type AutoScaleDeploymentConfig
}

interface AutoscaleDeployment {
}