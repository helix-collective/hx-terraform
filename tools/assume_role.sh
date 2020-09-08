#!/bin/bash
# usage is: ./aws_assume_role.sh <profile> <mfa token>
# e.g: ./assume_role.sh helix 12345
set -euo pipefail

display_usage() {
	echo -e "\nUsage: assume-role PROFILE_NAME MFA_CODE \n"
}

main() {
  if [  $# -le 1 ]
    then
      display_usage
      exit 1
  fi
  local profile=$1
  local mfa_token=$2

  local mfa_serial=$(aws configure get mfa_serial --profile "${profile}")
  local duration_seconds=$(aws configure get duration_seconds --profile "${profile}" || echo 7200)

  if aws configure get role_arn --profile "${profile}"
  then
    # Using MFA to assume-role into the requested profile via the profile's source_profile:

    # Assumes .aws/credentials sections eg as follows:
    #[plp]
    #region = ap-southeast-2
    #aws_access_key_id = AKIAIXXXXXXXXXXXXXXQ
    #aws_secret_access_key = rkXXXXXXXXXXXXXXXXXXxxxxxxxxxxxxxxxxxxxx

    #[plp-readonly]
    #region = ap-southeast-2
    #source_profile = plp
    #mfa_serial = arn:aws:iam::311111111176:mfa/user
    #role_arn = arn:aws:iam::311111111176:role/xx_readonly_role
    #role_session_name = user
    #duration_seconds = 7200

    local source_profile=$(aws configure get source_profile --profile "${profile}")
    local role_session_name=$(aws configure get role_session_name --profile "${profile}")
    local role_arn=$(aws configure get role_arn --profile "${profile}")
    local temp_role=$(aws sts assume-role \
                        --role-arn "${role_arn}" \
                        --role-session-name "${role_session_name}" \
                        --serial-number "${mfa_serial}" \
                        --token-code "${mfa_token}" \
                        --profile "${source_profile}")
  else
    # Uses MFA to signin to the given profile directly

    # Assumes .aws/credentials eg as follows:
    #[helix]
    #region = ap-southeast-2
    #aws_access_key_id = AAAAAAAAAAAAAAAAAAAG
    #aws_secret_access_key = exxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxn
    #mfa_serial = arn:aws:iam::111111111111:mfa/user

    local temp_role=$(aws sts get-session-token --profile "${profile}" --serial-number "${mfa_serial}" --token-code "${mfa_token}")
  fi

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
