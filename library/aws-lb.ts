import * as TF from "../core/core"
import * as AT from "../providers/aws-types";
import * as AR from "../providers/aws-resources";

import * as shared from "./aws-shared";

/**
 * Create a load balancer pointing at a single elastic ip address, which
 * terminates https connections using a specified SSL certificate.
 */

export function sslTerminator(tfgen: TF.Generator, name: string, sr: shared.SharedResources, ec2: AR.Instance, certificate_arns: AT.Arn[]) : AR.Lb {
  const tags = tfgen.tagsContext();

  const lb = AR.createLb(tfgen, name, {
    subnets: sr.network.azs.map( az => az.external_subnet.id),
    security_groups: [sr.appserver_security_group.id],
    tags
  });

  const target_group = AR.createLbTargetGroup(tfgen, name, {
    port: 80,
    protocol: 'HTTP',
    vpc_id: sr.network.vpc.id,
    tags
  });

  AR.createLbTargetGroupAttachment(tfgen, name, {
    target_group_arn: target_group.arn,
    target_id: ec2.id.value
  });

  certificate_arns.map( (arn,i) => 
    AR.createLbListener(tfgen, name + "_" + (i+1), {
    load_balancer_arn: lb.arn,
    port: 443,
    protocol: 'HTTPS',
    certificate_arn: arn,
    default_action: {
      target_group_arn:target_group.arn,
      type: 'forward'
    }
  })
  );

  return lb;
}
