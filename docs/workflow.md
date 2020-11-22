# Workflow

## Principles

We are working in the "infrastructrure as code" paradigm here and this is
only useful if the published code (ie origin/master) always matches the
live infrastructure. This means that:

 - changes should be pushed to origin/master as soon as the infrastructure
 is updated
 - manual changes to the infrastructure managed by terraform should be avoided

There are two git repositories here:

 - the primary one specifies the infrastructure within a single AWS account.
 Changes to this repo should submitted and reviewed according to the project
  policies.
 - a git submodule of shared library code at typescript/hx-terraform. Changes
 to this repo must be reviewed by helix, either through phabricator or
 bitbucket pull requests.

It is expected that most infrastructure changes will only require changes in
the primary repo.

## Cloning a repo with this submodule

`git clone --recursive`

The above is equivalent to:
```
git clone
git submodule init
git submodule update
```

## Infrastructure changes

Note: The following workflow assumes you're working off the parent repo's
local master branch, tracking origin/master. All changes should be
on top of origin/master

1. [Clone](#Cloning-a-repo-with-this-submodule) the repo. Alternatively,
update an existing repo with the following commands:

```
git pull --rebase
git submodule update
```

This ensures any changes made to the repo are synced with any changes to
hx-terraform.

2. Perform a `doit plan` and ensure that terraform reports no changes to be
applied.

Note: Use `dnit plan` if calling from a repository that has migrated to `dnit`.

This ensures that the current state of the repo reflects the state of the
infrastructure. If it isn't, there's a chance that other developers have
forgotten to perform step 6, or someone has incorrectly made a manual change
to infrastructure via the AWS console.

3. Create a code change in the parent, and if necessary, hx-terraform

    * In submodules, where the contents of the child repo are usually fixed,
    you may have to perform the following before making the change:

    ```
    git fetch
    git checkout origin/master
    ```

4. Run `doit plan` to see the changes Terraform is prepared to make to the
infrastructure.

Note: Use `dnit plan` if calling from a repository that has migrated to `dnit`.

5. When your code is ready to go, submit your code change and `doit plan`
output through your favourite code review process:

    * If you've made changes to hx-terraform, submit a pull request to
    hx-terraform and ensure that your changes are landed on `origin/master`.

    * In the parent repo, ensure changes to ./typescript/hx-terraform are added.

    * Submit the parent repo's code changes and `doit plan` output for review.

    * When you're ready to stand up the changes, do another `doit plan` to ensure
    the output is identical to what you expected, then push to master.

Note: Use `dnit plan` if calling from a repository that has migrated to `dnit`.

6. Immediately after, run `doit apply`.

Note: Use `dnit apply` if calling from a repository that has migrated to `dnit`.

## Additional Resources

Git Submodules Guide:
https://medium.com/@porteneuve/mastering-git-submodules-34c65e940407

Terraform: https://www.terraform.io

doit: http://pydoit.org/

