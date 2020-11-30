# Changelog of breaking changes and their remediation where applicable.

## Format Template
### {Change/PR/Commit title} {Date}
[link to Change/PR/Commit]()
- {Details}
#### Remediation
{breadcrumbs for fixing breaking changes}

## Changelog for Breaking Changes

### Drop recent backwards compatibility helpers 19 Oct 2020
[link to Change/PR/Commit](https://github.com/helix-collective/hx-terraform/commit/a3f87bfc19872034e2007d9c64328dc83b7b4815)
- from previous change to update how we use helpers, compatability is being dropped with older patterns

#### Remediation
Projects need to find-replace/fix typescript compile errors as follows:
SharedResourcesNEI -> SharedResources
sr.network.region -> sr.region
tfgen.createOutput("xxx", "string"); -> tfgen.createOutput("xxx", TF.stringValue("string"));