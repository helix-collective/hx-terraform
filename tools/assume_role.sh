#!/bin/bash
# usage is: ./aws_assume_role.sh <flavor> <mfa token>
# e.g: ./assume_role.sh plp-admin 543987
set -euo pipefail

display_usage() { 
	echo -e "\nUsage: assume-role PLP_PROFILE_NAME MFA_CODE \n" 
} 

main() {
	if [  $# -le 1 ] 
	then 
		display_usage
		exit 1
	fi

  local profile=$1
  local mfa_token=$2
  local role_arn=$(aws configure get role_arn --profile "${profile}")
  local mfa_serial=$(aws configure get mfa_serial --profile "${profile}")
  local duration_seconds=$(aws configure get duration_seconds --profile "${profile}")
  local source_profile=$(aws configure get source_profile --profile "${profile}")
  local temp_role=$(aws sts assume-role \
                        --role-arn "${role_arn}" \
                        --role-session-name "$(whoami)" \
                        --serial-number "${mfa_serial}" \
                        --token-code "${mfa_token}" \
                        --profile "${source_profile}")

  local aws_access_key_id=$(echo $temp_role | jq .Credentials.AccessKeyId | xargs)
  local aws_secret_access_key=$(echo $temp_role | jq .Credentials.SecretAccessKey | xargs)
  local aws_session_token=$(echo $temp_role | jq .Credentials.SessionToken | xargs)

  if [ -z "$aws_access_key_id" ]
  then
    echo "Failed to assume role"
    exit 1
  fi

  export AWS_ACCESS_KEY_ID=${aws_access_key_id}
  export AWS_SECRET_ACCESS_KEY=${aws_secret_access_key}
  export AWS_SESSION_TOKEN=${aws_session_token}

  echo "Launching subshell with AWS tokens with ${duration_seconds} expiry"
  bash --init-file <(echo "PS1='\[\e[41m\](${profile})\[\e[0m\] \w$ '")
}

main "$@"
