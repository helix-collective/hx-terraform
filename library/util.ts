import * as TF from '../core/core.ts';
import * as AT from '../providers/aws/types.ts';
import * as AR from '../providers/aws/resources.ts';

/**
 * Create resource for a subsystem in their own scope
 */
export function inLocalSubSystem<T>(
  tfgen0: TF.Generator,
  system: string,
  createResources: (tfgen: TF.Generator) => T
): T {
  const tfgen = tfgen0
    .localNameScope(system)
    .localTags({ 'tf-subsystem': system, 'cost-center': system });
  return createResources(tfgen);
}

export function ingressOnPort(port: number): AR.IngressRuleParams {
  return {
    from_port: port,
    to_port: port,
    protocol: 'tcp',
    cidr_blocks: [AT.cidrBlock('0.0.0.0/0')],
  };
}

export function ingressIcmpPing(): AR.IngressRuleParams {
  return {
    from_port: 8,
    to_port: 0,
    protocol: 'icmp',
    cidr_blocks: [AT.cidrBlock('0.0.0.0/0')],
  };
}

export function ingressIcmpAll(): AR.IngressRuleParams {
  return {
    from_port: -1,
    to_port: -1,
    protocol: 'icmp',
    cidr_blocks: [AT.cidrBlock('0.0.0.0/0')],
  };
}


export function ingressByIpWhitelist(port: number, rules: {ip:string, description: string}[]) : AR.IngressRuleParams[] {
  return rules.map(r => {
    const ingressRule : AR.IngressRuleParams = {
      description: r.description,
      cidr_blocks: [AT.cidrBlock(r.ip)],
      from_port: port,
      to_port: port,
      protocol: 'tcp',
    };
    return ingressRule;
  });
}


export const egress_all: AR.EgressRuleParams = {
  from_port: 0,
  to_port: 0,
  protocol: '-1',
  cidr_blocks: [AT.cidrBlock('0.0.0.0/0')],
};

export function contextTagsWithName(
  tfgen: TF.Generator,
  name: string
): TF.TagsMap {
  return {
    ...tfgen.tagsContext(),
    Name: tfgen.scopedName(name).join('_'),
  };
}

/**
 *   A function to customise a value via mutation.
 */
export type Customize<T> = (v: T) => void;

export function noCustomize<T>(v: T) {}

export function applyCustomize<T>(
  customize: Customize<T> | undefined,
  v: T
): T {
  if (customize) {
    customize(v);
  }
  return v;
}
