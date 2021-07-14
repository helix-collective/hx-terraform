import * as AT from '../../providers/aws/types.ts';
import * as AR from '../../providers/aws/resources.ts';

/**
 * A configuration for an entire VPN within a VPC.
 * Only has a private subnet potentially in multiple availability zone.
 * NOTE: Multiple subnets with multiple vpn (tunnels) is reported to cause issues.
 */
 export interface VpnConfig {
  azs: VpnAzConfig[];
  vpns: VpnNetworkConfig[];
};

export interface VpnNetworkConfig {
  name: string;
  ip_address: AT.IpAddress;
  destinations: VpnRouteConfig[];
};

export interface VpnRouteConfig {
  cidr_block: AT.CidrBlock;
  rname: string;
};

/**
 * The configuration for a network availability zone, containing a
 * a public (external) and a private (internal) subnet.
 */
export interface VpnAzConfig {
  azname: string;
  availability_zone: AT.AvailabilityZone;
  internal_cidr_block: AT.CidrBlock;
  external_az_by_name: string;
};

export interface VpnAz {
  internal_subnet: AR.Subnet;
  rtinternal: AR.RouteTable;
  azname: string;
};

export interface VpnConn {
  customer_gw: AR.CustomerGateway;
  vpn_connection: AR.VpnConnection;
};

export interface Vpn {
  azs: VpnAz[];
  vpns: VpnConn[];
}

