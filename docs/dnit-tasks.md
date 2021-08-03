# `dnit` tasks

New infrastructure repositories are now using [`dnit`](https://deno.land/x/dnit) to execute tasks for the generation, planning and applying of infrastructure changes.

## Installing dependencies

- Install deno:
    https://deno.land/#installation

    (1.5.2 presently)

- Install dnit:
    ```
    deno install --allow-read --allow-write --allow-run --unstable -f --name dnit https://deno.land/x/dnit@dnit-v1.11.0/main.ts
    ```

## About Deno and Dnit

[Dnit](https://deno.land/x/dnit) is a simple task execution tool written in deno, modelled on python [doit](https://pydoit.org/)

`dnit` is aimed as being a replacement for `doit` that is aimed at better management of large scale task collections and better sharing of common tasks compared to what has been the case with `doit`.
Compared to python and `doit`, `dnit` uses deno.  Deno comes with support for typescript (it uses it's own copy of typescript 4.x) and hence all type safety patterns typically available in typescript.

The deno/typescript implementation of tasks is longer than the python/doit equivalent but much more explicitly typed.

[Deno](https://deno.land/) is a typescript & javascript runtime environment.  It comes with the philosophy that it:
- Compiles and run typescript (or javascript) sources out-of-the-box
- Imports sources from web (https) URLs as well as file relative URLs
  - This means that it doesn't use NPM
  - This means that it avoids a lot of bootstrapping (npm, yarn, node_modules, package.json, tsconfig.json, webpack etc etc) that prevent a typescript node environment from being a suitable "first" tool used to kickstart other build/tooling processes.

Note: Deno takes the approach that it should act more like a browser in terms of importing typescript / ES modules etc than node.js (wierd package.json & index.js import rules, implicit .js suffixes on imports etc).
Practically speaking deno flavoured typescript sources don't mix with node.js flavoured typescript sources - in particular deno typescript imports need to have `.ts` suffix explicitly, whereas node.js (via `tsc`) do not accept the suffix.

Goals for the code structuring of tasks in deno:
- Proper types, functions, modules and imports
- Explicit variables for dependencies between tasks

## Editing Deno sources in vscode

The directory `./dnit` is intended as the root for a vscode workspace.
Eg use:
```
code ./dnit
```
to open vscode with a workspace at that directory.

Use extension `@ext:denoland.vscode-deno` version 1.26.0 (version 2.0+ is broken at the time of writing).

(You want to avoid editing deno sources when the IDE expects node.js typescript and vice-versa.  Therefore use a completely separate mental and IDE context (You're either writing infrastructure or task tooling not both).

## Structure of the file tree for dnit (from a parent infra repo)

|   Path	| Comment  	|
|---	|---	|
| `.`  	|  (Current directory) root of a parent repository 	|
| `./dnit`  	|  Directory for deno sources.  Having it separate keeps it clear which are deno and which are node.js flavoured typescript sources.  The `dnit` tool searches for the `dnit/main.ts` directory and file to execute. |
| `./dnit/hxtd`  	|  Symlink to the `hx-terraform/dnit` directory. |
| `./gen-terraform/hx-terraform` | Location of the git submodule for `hx-terraform` |
| `./gen-terraform/hx-terraform/dnit` | deno typescript shared utils relating to infrastructure. |
| `https://denopkg.com/helix-collective/dnit-utils@v1.1.0/mod.ts` | deno HTTPS import of typescript sources - Helix utils for deno and dnit relating to processes, git, docker etc (not infrastructure specific).  `denopkg.com` redirects this import url from `https://github.com/helix-collective/dnit-utils` |
| `https://deno.land/x/dnit@dnit-vX.X.X/mod.ts` | (deno) HTTPS import of typescript sources.  Non Helix specific task exec tool for deno. `deno.land/x/` pulls sources from `https://github.com/PaulThompson/dnit` |
