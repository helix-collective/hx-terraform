typescript EDSL for terraform
=============================

This repository contains library code implementing a [typescript][]
embedded domain specific language (EDSL) for the generation of
[terraform][].

The directory structure is as follows:

```
core/
providers/
tools/
library/
```

`core/` contains the EDSL core, and is independent of the terraform
providers.

`providers/` contains a typescript constructor function for each
terraform resource type, for each terraform provider. Currently only
the aws provider is supported. This code contains much boilerplate,
which is tedious to write by hand. Hence we autogenerate it with the
scripts in `tools/`. To add new resources (or complete existing ones)
update the `gen-providers.` script in tools and then use it to regenerate the
`providers/` directory.

`library/` implements common higher level helix infrastructure
patterns in terms of the resources in `providers/'. These patterns
codify helix patterns for:

  * network architecture
  * tagging resources
  * support for green/blue deploys
  * roles and policies

etc

See the [documentation directory](./docs) for more information

If you are upgrading and are encountering breaking changes, you can find useful information in the commit messages by running:

$ git log --grep breaking adf4b3636d..HEAD

Ie if my previous version before upgrading was adf4b3636d then this should show all the necessary information.

To ensure this works, please note the standard of including "breaking" in your commit title/summary.

[typescript]:https://www.typescriptlang.org/
[terraform]:https://www.terraform.io/
