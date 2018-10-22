import * as TF from "../core/core"
import * as AT from "../providers/aws-types";
import * as AR from "../providers/aws-resources";

import * as shared from "./aws-shared";

/**
 * Create a load balancer pointing at a single elastic ip address, which
 * terminates https connections using a specified SSL certificate.
 */

export function sslTerminator(tfgen: TF.Generator, name: string, sr: shared.SharedResources, eip: AR.Eip, certificate_arn: AT.Arn) : AR.Lb {
  const lb = AR.createLb(tfgen, name, {});

  const target_group = AR.createLbTargetGroup(tfgen, name, {
    port: 80,
    protocol: 'HTTP',
    vpc_id: sr.network.vpc.id
  });
  AR.createLbTargetGroupAttachment(tfgen, name, {
    target_group_arn: target_group.arn,
    target_id: eip.id.value
  });

  const listener = AR.createLbListener(tfgen, name, {
    load_balancer_arn: lb.arn,
    port: 443,
    protocol: 'HTTPS',
    certificate_arn,
    default_action: {
      target_group_arn:target_group.arn,
      type: 'forward'
    }
  });

  return lb;
}
