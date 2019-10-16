# hx-deploy-tool

This repository is commonly used with camus2, a deployment automation tool

## Releasing a build

A release is a packaged set of application code, ready to be deployed. It includes
application configuration but not secrets.

The application repo should contain a doit script `dodo.py` that describes the
release task `task_release` - which should build an application, package it,
and upload it as a docker image to some remote.

## Deploying a release

A deploy takes a release and stands it up on infrastructure that serves it up to the
world.

Normally projects making use of this repo will also make use of Helix's deploy tool.

Login to the machine of interest (usually an Amazon EC2 instance), and run the following:

```
/opt/bin/camus2 list-releases
```

Then take the release name of choice (including `.zip`), and perform the following command.

```
/opt/bin/camus2 start <release name>
```

This process unpackages the application and injects secrets into the config files from the release.
It then stands up docker containers using the docker images uploaded from [Releasing a build](#Releasing-a-build)

Then find out which endpoints exist with
```
/opt/bin/camus2 status
```

Finally, point an endpoint to your deploy

```
/opt/bin/camus2 connect <endpoint> <release name>
```

If a previous deploy exists, take down that deploy

```
/opt/bin/camus2 stop <old release>
```
