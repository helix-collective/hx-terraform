/**
 *  Core types and logic for TSTF, Helix's EDSL for terraform generation
 */
import * as fs from 'fs';
import * as p from 'path';
import  crypto from 'crypto';

/**
 * The interface for generating terraform
 */
export interface Generator {
  /** Construct a terraform provider */
  createProvider(type: string, fields: ProviderFieldMap): Provider;

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

  /** Create an ad-hoc output file */
  createAdhocFile(path: string, content: string): void;

  /** Construct a terraform output */
  createOutput(name: string, value: string): void;

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

export type StringAlias<T> = {
  type: T;
  value: string;
};

export type ResourceValue = RFText | RFList | RFMap;
export type RFText = { kind: 'text'; text: string };
export type RFList = { kind: 'list'; values: ResourceValue[] };
export type RFMap = { kind: 'map'; map: ResourceFieldMap };

// we can't use a regular object map here, as repeated keys are allowed
export type ResourceField = { key: string; value: ResourceValue };
export type ResourceFieldMap = ResourceField[];

export type ProviderType = string;
export type Provider = { tftype: ProviderType };
export type ProviderFieldMap = ResourceFieldMap;
export type ProviderDetails = Provider & {
  fields: ProviderFieldMap;
};

export type TagsMap = { [key: string]: string };

export function booleanValue(value: boolean): ResourceValue {
  return { kind: 'text', text: JSON.stringify(value) };
}

export function stringValue(value: string): ResourceValue {
  return { kind: 'text', text: quotedText(value) };
}

export function numberStringValue(value: number): ResourceValue {
  return { kind: 'text', text: `"${value}"` };
}

export function stringAliasValue(value: { value: string }): ResourceValue {
  return { kind: 'text', text: JSON.stringify(value.value) };
}

export function numberValue(value: number): ResourceValue {
  return { kind: 'text', text: JSON.stringify(value) };
}

export function resourceIdValue(value: { value: string }): ResourceValue {
  return { kind: 'text', text: JSON.stringify(value.value) };
}

export function resourceArnValue(value: { value: string }): ResourceValue {
  return { kind: 'text', text: JSON.stringify(value.value) };
}

export function listValue<T>(
  conv: (t: T) => ResourceValue
): (values: T[]) => ResourceValue {
  function convList(values: T[]): ResourceValue {
    return { kind: 'list', values: values.map(conv) };
  }
  return convList;
}

export function tagsValue(tags: TagsMap): ResourceValue {
  const map: ResourceFieldMap = [];
  for (const key in tags) {
    const value: ResourceValue = stringValue(tags[key]);
    map.push({ key, value });
  }
  return mapValue(map);
}

export function mapValue(map: ResourceFieldMap): ResourceValue {
  return { map, kind: 'map' };
}

export function addField<T>(
  fields: ResourceFieldMap,
  key: string,
  value: T,
  valuefn: (t: T) => ResourceValue
) {
  fields.push({ key, value: valuefn(value) });
}

export function addOptionalField<T>(
  fields: ResourceFieldMap,
  key: string,
  value: T | undefined,
  valuefn: (t: T) => ResourceValue
) {
  if (value !== undefined) {
    fields.push({ key, value: valuefn(value) });
  }
}

export function resourceName<T>(r: Resource): string {
  return r.tftype + '.' + r.tfname.join('_');
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

  interface OutputDetails {
    tfname: ResourceName;
    value: string;
  }

  interface Generated {
    providers: ProviderDetails[];
    resources: ResourceDetails[];
    resourcesByName: { [tname: string]: ResourceDetails };
    adhocFiles: { [path: string]: string };
    backendFile: {path: string, content: string}|null;
    outputs: OutputDetails[];
  }

  const generated: Generated = emptyGenerated();

  type ProviderAliasMap = { [providerType: string]: string };

  function generator(
    nameContext0: ResourceName,
    tagsContext0: TagsMap,
    providerAliases0: ProviderAliasMap
  ): Generator {
    function createProvider(
      tftype: string,
      fields: ProviderFieldMap
    ): Provider {
      const provider: Provider = {
        tftype,
      };
      const providerDetails: ProviderDetails = {
        ...provider,
        fields,
      };
      addProviderDetails(generated, providerDetails);
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

    function createOutput(name: string, value: string) {
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

  function providerFile(tftype: ProviderType): string {
    return `${tftype}.tf`;
  }

  function emptyGenerated(): Generated {
    return {
      providers: [],
      resources: [],
      resourcesByName: {},
      outputs: [],
      backendFile: null,
      adhocFiles: {},
    };
  }

  function addProviderDetails(generated: Generated, provider: ProviderDetails) {
    generated.providers.push(provider);
  }

  function addResourceDetails(generated: Generated, details: ResourceDetails) {
    generated.resources.push(details);
    generated.resourcesByName[resourceName(details)] = details;
  }

  function addOutput(
    generated: Generated,
    tfname: ResourceName,
    value: string
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
      addOutput(result[file], output.tfname, output.value);
    }
    return result;
  }
  function groupProvidersByFile(): { [file: string]: Generated } {
    const result: { [file: string]: Generated } = {};

    for (const provider of generated.providers) {
      const file = providerFile(provider.tftype);
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

  function mapLines(
    indent: string,
    prefix0: string,
    fields: ResourceFieldMap,
    closingBrace: boolean = true
  ): string[] {
    let result = [indent + prefix0 + ' {'];
    for (const field of fields) {
      // Quote the field key if required
      const fieldkey = field.key.match(/\//) ? `"${field.key}"` : field.key;

      const prefix = indent + fieldkey;
      switch (field.value.kind) {
        case 'text':
          result = result.concat(
            textLines(indent + INDENT, prefix + ' = ', field.value.text)
          );
          break;
        case 'map':
          result = result.concat(
            mapLines(indent + INDENT, prefix, field.value.map)
          );
          break;
        case 'list':
          // The HCL syntax sucks. If it's a list of maps, we repeat the key section.
          // whereas for primitive we generate a json style list.
          if (field.value.values.length > 0) {
            const value0 = field.value.values[0];
            switch (value0.kind) {
              case 'map':
                for (const value of field.value.values) {
                  if (value.kind === 'map') {
                    result = result.concat(
                      mapLines(indent + INDENT, prefix + ' = ', value.map)
                    );
                  }
                }
                break;
              case 'text':
                const items: string[] = [];
                for (const value of field.value.values) {
                  if (value.kind === 'text') {
                    items.push(value.text);
                  }
                }
                result = result.concat(
                  textLines(
                    indent + INDENT,
                    prefix + ' = ',
                    '[' + items.join(', ') + ']'
                  )
                );
                break;
              case 'list':
                throw new Error('list of lists not implemented');
            }
          } else {
            throw new Error('empty lists not implemented');
          }
          break;
      }
    }
    if (closingBrace) {
      result.push(indent + '}');
    }
    return result;
  }

  function generateFile(generated: Generated) : string {
    const indent = '';
    let lines: string[] = [];
    for (const provider of generated.providers) {
      const prefix = `provider "${provider.tftype}"`;
      const fields = provider.fields.concat([]);
      lines = lines.concat(mapLines(indent, prefix, fields, false));
      lines.push('}');
      lines.push('');
    }
    for (const resource of generated.resources) {
      const prefix =
        'resource "' +
        resource.tftype +
        '" "' +
        resource.tfname.join('_') +
        '"';
      const fields = resource.fields.concat([]);
      if (resource.dependsOn.length > 0) {
        const dependsOn = resource.dependsOn.map(r => {
          return `"${r.tftype}.${r.tfname.join('_')}"`;
        });
        fields.push({
          key: 'depends_on',
          value: { kind: 'text', text: `[${dependsOn.join(', ')}]` },
        });
      }
      if (resource.provider !== '') {
        fields.push({
          key: 'provider',
          value: { kind: 'text', text: `"${resource.provider}"` },
        });
      }
      if (resource.ignoreChanges.length > 0 || resource.createBeforeDestroy) {
        const lifecycleFieldMap: ResourceField[] = [];
        if (resource.ignoreChanges.length > 0) {
          const ignoreChanges = resource.ignoreChanges.map(f => '"' + f + '"');
          lifecycleFieldMap.push({
            key: 'ignore_changes',
            value: { kind: 'text', text: `[${ignoreChanges.join(', ')}]` },
          });
        }
        if (resource.createBeforeDestroy) {
          lifecycleFieldMap.push({
            key: 'create_before_destroy',
            value: { kind: 'text', text: 'true' },
          });
        }
        const lifecycleField: ResourceField = {
          key: 'lifecycle',
          value: {
            kind: 'map',
            map: lifecycleFieldMap,
          },
        };
        fields.push(lifecycleField);
      }
      lines = lines.concat(mapLines(indent, prefix, fields, false));
      for (const provisioner of resource.provisioners) {
        if (provisioner.kind === 'local-exec') {
          lines.push('  provisioner "local-exec" {');
          lines.push('    command = <<EOF');
          lines.push(provisioner.script);
          lines.push('EOF');
          lines.push('  }');
        }
      }
      lines.push('}');
      lines.push('');
    }
    for (const output of generated.outputs) {
      lines.push('output "' + output.tfname.join('_') + '" {');
      lines.push('  value = "' + output.value + '"');
      lines.push('}');
      lines.push('');
    }
    return lines.join('\n');
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

class Manifest {
  private contents : {file:string, hash:string}[] = [];
  private manifestFile: string;

  constructor(public name: string, public outdir: string) {
    this.manifestFile = p.join(outdir,`.manifest.${name}`);
    this.load();
  }

  load() {
    if (fs.existsSync(this.manifestFile)) {
      const data : {file:string, hash:string}[] = JSON.parse(fs.readFileSync(this.manifestFile).toString());
      this.contents = data;
    }
  }

  clearFiles() {
    for(const c of this.contents) {
      const path = p.join(this.outdir,c.file);
      if(fs.existsSync(path)) {
        fs.unlinkSync(path);
      }
    }
    this.contents = [];
  }

  writeFile(path: string, content: string) : void {
    const shasum = crypto.createHash('sha1');
    shasum.update(content);

    this.contents.push({
      file:path,
      hash:shasum.digest('hex')
    });

    if (!fs.existsSync(this.outdir)) {
      fs.mkdirSync(this.outdir,{recursive:true});
    }
    fs.writeFileSync(p.join(this.outdir,path),content);
  }

  save() {
    fs.writeFileSync(this.manifestFile, JSON.stringify(this.contents, null, 2) + '\n');
  }
};

const RAW_EXPR_PREFIX = 'TFRAWEXPR:';

/**
 * Create a raw string that will be passed to terraform as is.
 *
 * Useful as a workaround to produce terraform expression that
 * we can't currently generate.
 */
export function rawExpr(s: string): string {
  return RAW_EXPR_PREFIX + s;
}

function quotedText(s: string) {
  if (s.startsWith(RAW_EXPR_PREFIX)) {
    return s.slice(RAW_EXPR_PREFIX.length);
  }

  const needsQuoting = s.includes('\n') || s.includes('"');

  if (needsQuoting) {
    const eof = getUniqueEof(s);
    const trailing = s.endsWith('\n') ? '' : '\n';
    return `<<${eof}\n${s}${trailing}${eof}`;
  }
  return JSON.stringify(s);
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
