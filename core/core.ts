/**
 *  Core types and logic for TSTF, Helix's EDSL for terraform generation
 */
import { fs, path, hash } from "../deps.ts";

import * as hcl2 from "./hcl2.ts";
import { Manifest } from "./manifest.ts";


/**a
 * The interface for generating terraform
 */
export interface Generator {
  /** Construct a terraform provider */
  createProvider(type: string, fields: hcl2.BodyItem[]): Provider;

  /** Construct a terraform resource */
  createResource(
    type: string,
    name: string,
    fields: ResourceFieldMap
  ): Resource;

  createTypedResource<T extends string>(
    type: T,
    tftype: string,
    tfname: string,
    fields: ResourceFieldMap
  ): ResourceT<T>;

  /** Create a backend config file */
  createBackendFile(path: string, content: string): void;

  /** Construct a terraform data source */
  createDataSource(
    type: string,
    name: string,
    fields: ResourceFieldMap
  ): Resource;

  createTypedDataSource<T extends string>(
    type: T,
    tftype: string,
    tfname: string,
    fields: ResourceFieldMap
  ): ResourceT<T>;

  /** Create an ad-hoc output file */
  createAdhocFile(path: string, content: string): void;

  /** Construct a terraform output */
  createOutput(name: string, value: hcl2.Expression): void;

  /** Mark a field of a resource to indicate that changes to that field should not
   cause the resource to be updated */
  ignoreChanges(resource: Resource, fieldname: string): void;

  /** Mark the resource to ensure a new resource is created before the original is destroyed */
  createBeforeDestroy(resource: Resource, value: boolean): void;

  /** Mark that resource1  depends on the existance of resource2, and hence implies a
   creation ordering */
  dependsOn(resource1: Resource, resource2: Resource): void;

  /** Add a local shell script provisioner */
  localExecProvisioner(resource: Resource, script: string): void;

  /** Generate a name for this resource based upon the current name scope */
  scopedName(name: string): ResourceName;

  /** Returns the current name scope */
  nameContext(): ResourceName;

  /** Returns the tags for the current scope */
  tagsContext(): TagsMap;

  /** Return a generator with the given name pushed onto the name scope */
  localNameScope(name: string): Generator;

  /** Return a generator with the given provider alias configured */
  providerAlias(provider: string, alias: string): Generator;

  /** Return a generator with the specified tags pushhed onto the name scope */
  localTags(map: TagsMap): Generator;
}

/**
 *  A terraform generator that writes tf files to a given directory
 */
interface FileGenerator extends Generator {
  writeFiles(outdir: string): void;
}

export type ResourceType = string;
export type ResourceName = string[];
export type Resource = { tftype: ResourceType; tfname: ResourceName };
export type ResourceT<T extends string> = Resource & { type: T };

export type DataSource = Resource;
export type DataSourceT<T extends string> = DataSource & { type: T };

export type StringAlias<T> = {
  type: T;
  value: string;
};

export type ResourceFieldMap = hcl2.BodyItem[];

export type Provider = hcl2.Block;

export type TagsMap = { [key: string]: string };

export function booleanValue(value: boolean): hcl2.Expression {
  return hcl2.booleanLit(value);
}

export function stringValue(value: string): hcl2.Expression {
  return hcl2ExprFromString(value);
}

export function numberStringValue(value: number): hcl2.Expression {
  return  hcl2.stringLit(JSON.stringify(value));
}

export function stringAliasValue(value: { value: string }): hcl2.Expression {
  return hcl2ExprFromString(value.value);
}

export function numberValue(value: number): hcl2.Expression {
  return hcl2.numericLit(value);
}

export function resourceIdValue(value: { value: string }): hcl2.Expression {
  return hcl2ExprFromString(value.value);
}

export function resourceArnValue(value: { value: string }): hcl2.Expression {
  return hcl2ExprFromString(value.value);
}

export function listValue<T>(
  conv: (t: T) =>  hcl2.Expression
): (values: T[]) =>  hcl2.Expression {
  function convList(values: T[]):  hcl2.Expression {
    return hcl2.tupleExpr(values.map(conv));
  }
  return convList;
}

export function repeatedBlockValue<T>(
  conv: (t: T) =>  hcl2.Expression
): (values: T[]) =>  hcl2.Expression {
  function convList(values: T[]):  hcl2.Expression {
    return hcl2.tupleExpr(values.map(conv));
  }
  return convList;
}

export function tagsValue(tags: TagsMap): hcl2.Expression {
  const map: {key: string, value: hcl2.ExprTerm}[] = [];
  for (const key in tags) {
    map.push({ key, value: hcl2.stringLit(tags[key])});
  }
  return hcl2.objectExpr(map);
}


export function addAttribute<T>(
  fields: ResourceFieldMap,
  key: string,
  value: T,
  valuefn: (t: T) => hcl2.Expression
) {
  fields.push(hcl2.attribute(key, valuefn(value)));
}

export function addOptionalAttribute<T>(
  fields: ResourceFieldMap,
  key: string,
  value: T | undefined,
  valuefn: (t: T) => hcl2.Expression
) {
  if (value !== undefined) {
    addAttribute(fields, key, value, valuefn);
  }
}

export function addBlock<T>(
  fields: ResourceFieldMap,
  key: string,
  value: T,
  valuefn: (t: T) => hcl2.BodyItem[]
) {
  fields.push(hcl2.block(key, [], valuefn(value)));
}

export function addOptionalBlock<T>(
  fields: ResourceFieldMap,
  key: string,
  value: T | undefined,
  valuefn: (t: T) => hcl2.BodyItem[]
) {
  if (value !== undefined) {
    addBlock(fields, key, value, valuefn);
  }
}

export function addRepeatedBlock<T>(
  fields: ResourceFieldMap,
  key: string,
  value: T[] | undefined,
  valuefn: (t: T) => hcl2.BodyItem[]
) {
  if (value === undefined) {
    return;
  }
  for (const v of value) {
    addBlock(fields, key, v, valuefn);
  }
}

export function resourceName<T>(r: Resource): string {
  return r.tftype + '.' + r.tfname.join('_');
}

export function resourceAttribute(r: Resource, attr: string): string {
  return  '${' + resourceName(r) + "." + attr + "}";
}


export function dataSourceName<T>(d: DataSource): string {
  return "data." + d.tftype + '.' + d.tfname.join('_');
}

export function withLocalNameScope<T>(
  tfgen0: Generator,
  name: string,
  createfn: (tfgen: Generator) => T
): T {
  return createfn(tfgen0.localNameScope(name));
}

/**
 *  Ensure that all resources created by createfn for the given provider
 *  type reference the specified provider alias
 */
export function withProviderAlias<T>(
  tfgen0: Generator,
  providerType: string,
  alias: string,
  createfn: (tfgen: Generator) => T
): T {
  return createfn(tfgen0.providerAlias(providerType, alias));
}

export function fileGenerator(): FileGenerator {

  interface ResourceDetails extends Resource {
    fields: ResourceFieldMap;
    ignoreChanges: string[];
    dependsOn: ResourceDetails[];
    provisioners: Provisioner[];
    provider: string;
    createBeforeDestroy: boolean;
  }
  type Provisioner = { kind: 'local-exec'; script: string };

  /** https://www.terraform.io/docs/configuration-0-11/data-sources.html */
  interface DataSourceDetails extends DataSource {
    fields: ResourceFieldMap;
    provider: string;
  }

  interface OutputDetails {
    tfname: ResourceName;
    value: hcl2.Expression;
  }

  interface Generated {
    providers: hcl2.Block[];
    resources: ResourceDetails[];
    resourcesByName: { [tname: string]: ResourceDetails };
    adhocFiles: { [path: string]: string };
    backendFile: {path: string, content: string}|null;
    outputs: OutputDetails[];
    datasources: DataSourceDetails[];
  }

  const generated: Generated = emptyGenerated();

  type ProviderAliasMap = { [providerType: string]: string };

  function generator(
    nameContext0: ResourceName,
    tagsContext0: TagsMap,
    providerAliases0: ProviderAliasMap
  ): Generator {
    function createProvider(
      identifier: string,
      fields: hcl2.BodyItem[]
    ): Provider {
      const provider =  hcl2.block("provider", [hcl2.stringLit(identifier)], fields);
      addProviderDetails(generated, provider);
      return provider;
    }

    function createResource(
      tftype: string,
      name: string,
      fields: ResourceFieldMap
    ): Resource {
      const tfname = nameContext0.concat(name);
      const providerType = getProviderType(tftype);
      const provider = providerAliases0[providerType]
        ? providerType + '.' + providerAliases0[providerType]
        : '';
      const details = {
        tftype,
        tfname,
        fields,
        provider,
        ignoreChanges: [],
        dependsOn: [],
        provisioners: [],
        createBeforeDestroy: false,
      };

      addResourceDetails(generated, details);
      return { tftype, tfname };
    }

    function getProviderType(tftype: string): string {
      // The terraform convention is that the provider given by the
      // resource type up to the first underscore
      const match = tftype.match(/[^_]*/);
      return (match && match[0]) || '';
    }

    function createAdhocFile(path: string, content: string): void {
      generated.adhocFiles[path] = content;
    }

    /// Create the backend config file
    function createBackendFile(path: string, content: string): void {
      generated.backendFile = {path, content};
    }


    function createTypedResource<T extends string>(
      type: T,
      tftype: string,
      name: string,
      fields: ResourceFieldMap
    ): ResourceT<T> {
      const res: ResourceT<T> = {
        type,
        ...createResource(tftype, name, fields),
      };
      return res;
    }

    function createTypedDataSource<T extends string>(
      type: T,
      tftype: string,
      name: string,
      fields: ResourceFieldMap
    ): DataSourceT<T> {
      const res: ResourceT<T> = {
        type,
        ...createDataSource(tftype, name, fields),
      };
      return res;
    }

    function createDataSource(
      tftype: string,
      name: string,
      fields: ResourceFieldMap
    ): DataSource {
      const tfname = nameContext0.concat(name);
      const providerType = getProviderType(tftype);
      const provider = providerAliases0[providerType]
        ? providerType + '.' + providerAliases0[providerType]
        : '';
      const details = {
        tftype,
        tfname,
        fields,
        ignoreChanges: [],
        dependsOn: [],
        provisioners: [],
        provider,
        createBeforeDestroy: false,
      };

      addDataSourceDetails(generated, details);
      return { tftype, tfname };
    }

    function createOutput(name: string, value: hcl2.Expression) : void {
      const tfname = nameContext0.concat(name);
      addOutput(generated, tfname, value);
    }

    function ignoreChanges(resource: Resource, fieldname: string) {
      const details = generated.resourcesByName[resourceName(resource)];
      if (details) {
        details.ignoreChanges.push(fieldname);
      }
    }

    function createBeforeDestroy(resource: Resource, value: boolean) {
      const details = generated.resourcesByName[resourceName(resource)];
      if (details) {
        details.createBeforeDestroy = value;
      }
    }

    function dependsOn(resource1: Resource, resource2: Resource) {
      const details1 = generated.resourcesByName[resourceName(resource1)];
      const details2 = generated.resourcesByName[resourceName(resource2)];
      if (details1 && details2) {
        details1.dependsOn.push(details2);
      }
    }

    function localExecProvisioner(resource: Resource, script: string) {
      const details = generated.resourcesByName[resourceName(resource)];
      if (details) {
        details.provisioners.push({ script, kind: 'local-exec' });
      }
    }

    function nameContext(): ResourceName {
      return nameContext0;
    }

    function tagsContext(): TagsMap {
      return tagsContext0;
    }

    function scopedName(name: string): ResourceName {
      return nameContext0.concat(name);
    }

    function localNameScope(name: string): Generator {
      return generator(
        nameContext0.concat(name),
        tagsContext0,
        providerAliases0
      );
    }

    function providerAlias(providerType: string, alias: string): Generator {
      const providerAliases = {
        ...providerAliases0,
      };
      providerAliases[providerType] = alias;
      return generator(nameContext0, tagsContext0, providerAliases);
    }

    function localTags(tagsMap: TagsMap): Generator {
      const mergedTagsContext = {
        ...tagsContext0,
        ...tagsMap,
      };
      return generator(nameContext0, mergedTagsContext, providerAliases0);
    }

    return {
      createProvider,
      createResource,
      createTypedResource,
      createDataSource,
      createTypedDataSource,
      createAdhocFile,
      createBackendFile,
      createOutput,
      ignoreChanges,
      createBeforeDestroy,
      dependsOn,
      localExecProvisioner,
      nameContext,
      tagsContext,
      scopedName,
      localNameScope,
      providerAlias,
      localTags,
    };
  }

  function resourceFile(tfname: ResourceName): string {
    if (tfname.length > 1) {
      return tfname[0] + '.tf';
    }
    return 'root.tf';
  }


  function providerFile(identifier: string): string {
    return `${identifier}.tf`;
  }

  function emptyGenerated(): Generated {
    return {
      providers: [],
      resources: [],
      resourcesByName: {},
      outputs: [],
      backendFile: null,
      adhocFiles: {},
      datasources: [],
    };
  }

  function addProviderDetails(generated: Generated, provider: hcl2.Block) {
    generated.providers.push(provider);
  }

  function addResourceDetails(generated: Generated, details: ResourceDetails) {
    generated.resources.push(details);
    generated.resourcesByName[resourceName(details)] = details;
  }

  function addDataSourceDetails(
    generated: Generated,
    details: DataSourceDetails
  ) {
    generated.datasources.push(details);
  }

  function addOutput(
    generated: Generated,
    tfname: ResourceName,
    value: hcl2.Expression,
  ) {
    generated.outputs.push({ tfname, value });
  }

  function groupResourcesByFile(): { [file: string]: Generated } {
    const result: { [file: string]: Generated } = {};

    for (const resource of generated.resources) {
      const file = resourceFile(resource.tfname);
      if (result[file] === undefined) {
        result[file] = emptyGenerated();
      }
      addResourceDetails(result[file], resource);
    }
    for (const output of generated.outputs) {
      const file = resourceFile(output.tfname);
      if (result[file] === undefined) {
        result[file] = emptyGenerated();
      }
      result[file].outputs.push(output);
    }
    for (const datasrc of generated.datasources) {
      const file = resourceFile(datasrc.tfname);
      if (result[file] === undefined) {
        result[file] = emptyGenerated();
      }
      addDataSourceDetails(result[file], datasrc);
    }
    return result;
  }
  function groupProvidersByFile(): { [file: string]: Generated } {
    const result: { [file: string]: Generated } = {};

    for (const provider of generated.providers) {
      const file = providerFile(provider.labels[0].value);
      if (result[file] === undefined) {
        result[file] = emptyGenerated();
      }
      result[file].providers.push(provider);
    }
    return result;
  }

  const INDENT = '  ';

  function textLines(indent: string, prefix: string, text: string): string[] {
    return [indent + prefix + text];
  }

  function textValue(t: string):  hcl2.ExprTerm {
    const imatch =  t.match(/^"\${([0-9A-Za-z._]+)}\"$/);
    if (imatch != null) {
      return hcl2.getVariable(imatch[1]);
    } else if (t.startsWith('"') && t.endsWith('"')) {
      return hcl2.stringLit(t.substr(1, t.length-2));
    } else {
      return hcl2.stringLit(t);
    }
  }


  function generateMetadata(resource: ResourceDetails): hcl2.BodyItem[] {
    const items: hcl2.BodyItem[] = [];

    {
    const lifecycle_items: hcl2.BodyItem[] = [];
    if (resource.ignoreChanges.length > 0) {
        lifecycle_items.push(hcl2.attribute('ignore_changes', hcl2.tupleExpr(resource.ignoreChanges.map(s => hcl2.getVariable(s)))));
      }
      if (resource.createBeforeDestroy) {
        lifecycle_items.push(hcl2.attribute('create_before_destroy', hcl2.booleanLit(resource.createBeforeDestroy)));
      }
      if (lifecycle_items.length > 0) {
        items.push(hcl2.block("lifecycle", [], lifecycle_items));
      }
    }

    if (resource.dependsOn.length > 0) {
      items.push(hcl2.attribute("depends_on", hcl2.tupleExpr(resource.dependsOn.map(
        r => hcl2.getVariable(`${r.tftype}.${r.tfname.join('_')}`)
      ))));
    }

    for (const p of resource.provisioners) {
      items.push(hcl2.block("provisioner", [hcl2.stringLit("local-exec")], [
        hcl2.attribute("command", hcl2.heredocTemplate('EOF',p.script)),
      ]));
    }

    return items;
  }

  function generateFile(generated: Generated) : string {
    const config : hcl2.ConfigFile = [];

    for (const p of generated.providers) {
      config.push(p);
    }

    for (const r of generated.resources) {
      const metadata = generateMetadata(r);
      config.push(hcl2.block(
        "resource", 
        [hcl2.stringLit(r.tftype), hcl2.stringLit(r.tfname.join("_"))],
        [...r.fields, ...metadata]
      ));
    }

    for (const o of generated.outputs) {
      config.push(hcl2.block("output", [hcl2.stringLit(o.tfname.join("_"))], [
        hcl2.attribute("value", o.value)
      ]));

    }
    return hcl2.generate(config);
  }


  function writeFiles(outdir: string) {
    // write files including manifest & hash
    // (separately so that providers change can retrigger terraform init)
    const providers = new Manifest('providers', outdir);
    const resources = new Manifest('resources', outdir);
    const adhoc = new Manifest('adhoc', outdir);
    const backend = new Manifest('backend', outdir);

    providers.clearFiles();
    resources.clearFiles();
    adhoc.clearFiles();
    backend.clearFiles();

    const fileResources = groupResourcesByFile();
    const fileProviders = groupProvidersByFile();
    for (const path in fileProviders) {
      providers.writeFile(path, generateFile(fileProviders[path]));
    }
    for (const path in fileResources) {
      resources.writeFile(path, generateFile(fileResources[path]));
    }
    for (const path of Object.keys(generated.adhocFiles)) {
      adhoc.writeFile(path, generated.adhocFiles[path]);
    }
    if(generated.backendFile) {
      backend.writeFile(generated.backendFile.path, generated.backendFile.content);
    }

    providers.save();
    resources.save();
    adhoc.save();
    backend.save();
  }

  return {
    ...generator([], {}, {}),
    writeFiles,
  };
}

const VAR_REGEX = /\${([a-zA-Z0-9_.]+)}$/;
const RAW_EXPR_PREFIX = 'TFRAWEXPR:';


export function hcl2ExprFromString(value:string): hcl2.Expression {
  const varmatch = value.match(VAR_REGEX);
  if (varmatch) {
    return hcl2.getVariable(varmatch[1]);
  }
  if (value.startsWith(RAW_EXPR_PREFIX)) {
    return hcl2.getVariable(value.substr(RAW_EXPR_PREFIX.length));
  }
  const needsQuoting = value.includes('\n') || value.includes('"');
  if (needsQuoting) {
    const eof = getUniqueEof(value);
    return hcl2.heredocTemplate(eof,value);
  } else {
    return hcl2.stringLit(value);
  }
}


/**
 * Create a raw string that will be passed to terraform as is.
 *
 * Useful as a workaround to produce terraform expression that
 * we can't currently generate.
 */
export function rawExpr(s: string): string {
  return RAW_EXPR_PREFIX + s;
}

function getUniqueEof(s: string): string {
  if (!s.includes('EOF')) {
    return 'EOF';
  }
  let i = 1;
  while (true) {
    const eof = `EOF${i}`;
    if (!s.includes(eof)) {
      return eof;
    }
    i = i + 1;
  }
}
