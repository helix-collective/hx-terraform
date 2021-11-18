import * as AT from '../../providers/aws/types.ts';


export type AmiSelector = (region: AT.Region) =>  AT.Ami;

/**
 * legacy amis, for backwards compatibility
 */
 const ec2_ami_1604_legacy = [
  { region: "ap-southeast-2", ami: "ami-47c21a25"},
  { region: "us-east-1", ami: "ami-03a935aafa6b52b97"},
  { region: "us-east-2", ami: "ami-5e8bb23b"},
  { region: "ca-central-1", ami: "ami-01957f6afe4e49edd"},
  { region: "eu-west-2", ami: "ami-0fab23d0250b9a47e"},
  { region: "eu-north-1", ami: "ami-04b331702444679c3"},
  { region: "eu-central-1", ami: "ami-05ed2c1359acd8af6"},
 ];

export const legacy_ubuntu_1604: AmiSelector = makeAmiSelector(ec2_ami_1604_legacy);

/** created from https://cloud-images.ubuntu.com/locator/ec2/
 * filter version and arch, copy-paste and a bit of reformating
 */
const ec2_ami_1604_amd64 = [
  { region: "af-south-1", ami: "ami-0805fe821528cb0ff"},
  { region: "ap-east-1", ami: "ami-01e6a2bfeab33d1c4"},
  { region: "ap-northeast-1", ami: "ami-0e42827f7b2eaa246"},
  { region: "ap-south-1", ami: "ami-01220a0a70c164303"},
  { region: "ap-southeast-1", ami: "ami-0c21f9b6eb55124d4"},
  { region: "ca-central-1", ami: "ami-0baa2760c1decf0c8"},
  { region: "eu-central-1", ami: "ami-01299931803ce83f6"},
  { region: "eu-north-1", ami: "ami-0567085e558e02053"},
  { region: "eu-south-1", ami: "ami-0f5cea12ee799691a"},
  { region: "eu-west-1", ami: "ami-016ee74f2cf016914"},
  { region: "me-south-1", ami: "ami-063e418f8a67c299b"},
  { region: "sa-east-1", ami: "ami-0c9bb0eaa91f06fbc"},
  { region: "us-east-1", ami: "ami-0133407e358cc1af0"},
  { region: "us-west-1", ami: "ami-0fdf8b5989f22a4e0"},
  { region: "cn-north-1", ami: "ami-03bd5b54f08201029"},
  { region: "cn-northwest-1", ami: "ami-01924473944c652d8"},
  { region: "us-gov-east-1", ami: "ami-0fe6a74784a689a73"},
  { region: "us-gov-west-1", ami: "ami-086b498deca4cc63c"},
  { region: "ap-northeast-2", ami: "ami-0daccca4e1fc56e3f"},
  { region: "ap-southeast-2", ami: "ami-0e554a91eb4e7b6d7"},
  { region: "eu-west-2", ami: "ami-0ad9f4c7544ed8cea"},
  { region: "us-east-2", ami: "ami-01685d240b8fbbfeb"},
  { region: "us-west-2", ami: "ami-079e7a3f57cc8e0d0"},
  { region: "ap-northeast-3", ami: "ami-008ddf50457c78d08"},
  { region: "eu-west-3", ami: "ami-062a3f6e040d4c62a"},
]

export const ubuntu_1604: AmiSelector = makeAmiSelector(ec2_ami_1604_amd64);

/** created from https://cloud-images.ubuntu.com/locator/ec2/
 * filter version and arch, copy-paste and a bit of reformating
 */
const ec2_ami_2004_amd64 = [
  {region: "af-south-1", ami: "ami-0982b51b05c9be169"},
  {region: "ap-east-1", ami: "ami-04c4bc345657bf245"},
  {region: "ap-northeast-1", ami: "ami-0b0ccc06abc611fa0"},
  {region: "ap-south-1", ami: "ami-0443fb07ed652c341"},
  {region: "ap-southeast-1", ami: "ami-0f0b17182b1d50c14"},
  {region: "ca-central-1", ami: "ami-04673916e7c7aa985"},
  {region: "eu-central-1", ami: "ami-05e1e66d082e56118"},
  {region: "eu-north-1", ami: "ami-00888f2a5f9be4390"},
  {region: "eu-south-1", ami: "ami-06a3346e9e869f9b1"},
  {region: "eu-west-1", ami: "ami-0298c9e0d2c86b0ed"},
  {region: "me-south-1", ami: "ami-0420827ce9e4a7552"},
  {region: "sa-east-1", ami: "ami-04e56ee48b28650b3"},
  {region: "us-east-1", ami: "ami-019212a8baeffb0fa"},
  {region: "us-west-1", ami: "ami-0b08e71a81ba4200f"},
  {region: "cn-north-1", ami: "ami-0741e7b8b4fb0001c"},
  {region: "cn-northwest-1", ami: "ami-0883e8062ff31f727"},
  {region: "us-gov-east-1", ami: "ami-0fe6338c47e61cd5d"},
  {region: "us-gov-west-1", ami: "ami-087ee83c8de303181"},
  {region: "ap-northeast-2", ami: "ami-0f49ee52a88cc2435"},
  {region: "ap-southeast-2", ami: "ami-04b1878ebf78f7370"},
  {region: "eu-west-2", ami: "ami-0230a6736b38ae83e"},
  {region: "us-east-2", ami: "ami-0117d177e96a8481c"},
  {region: "us-west-2", ami: "ami-02868af3c3df4b3aa"},
  {region: "ap-northeast-3", ami: "ami-01ae085ceefba2dbf"},
  {region: "eu-west-3", ami: "ami-06d3fffafe8d48b35"},
]

export const ubuntu_2004: AmiSelector = makeAmiSelector(ec2_ami_2004_amd64);

export function makeAmiSelector(ec2_ami_data: {region: string, ami: string}[]): AmiSelector {
  return (region: AT.Region) => {
    for (const ec2_ami of ec2_ami_data) {
      if(region.value === ec2_ami.region ) {
        return AT.ami(ec2_ami.ami);
      }
    };
    throw new Error('No AMI specified for region ' + region.value);
  };
}