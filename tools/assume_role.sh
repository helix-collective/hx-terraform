#!/bin/bash
# usage is: ./assume_role.sh <flavor> <mfa token>
# e.g: ./assume_role.sh prod 543987
set -euo pipefail

main() {
  local profile=$1
  local mfa_token=$2
  local role_arn=$(aws configure get role_arn --profile "${profile}")
  local mfa_serial=$(aws configure get mfa_serial --profile "${profile}")
  local temp_role=$(aws sts assume-role \
                        --role-arn "${role_arn}" \
                        --role-session-name "$(whoami)" \
                        --serial-number "${mfa_serial}" \
                        --token-code "${mfa_token}" \
                        --profile "canva-identity")
  echo $temp_role

  local aws_access_key_id=$(echo $temp_role | jq .Credentials.AccessKeyId | xargs)
  local aws_secret_access_key=$(echo $temp_role | jq .Credentials.SecretAccessKey | xargs)
  local aws_session_token=$(echo $temp_role | jq .Credentials.SessionToken | xargs)
  echo "export aws_access_key=${aws_access_key_id}"
  echo "export aws_secret_key=${aws_secret_access_key}"
  echo "export aws_session_token=${aws_session_token}"
}

main "$@"
