import * as fs from 'fs';

export interface RecordDecl {
  name: string;
  fields: FieldDecl[];
}

export interface FieldDecl {
  field: string;
  type: Type;
  optional: boolean;
}

export function requiredField(field: string, type: Type): FieldDecl {
  return { field, type, optional: false };
}

export function optionalField(field: string, type: Type): FieldDecl {
  return { field, type, optional: true };
}

export type Type =
  | PrimitiveType
  | ListType
  | RecordType
  | StringAliasType
  | ResourceIdType
  | ArnType
  | TagsMapType
  | EnumType;

interface PrimitiveType {
  kind: 'primitive';
  type: 'string' | 'number' | 'boolean';
}

export const STRING: PrimitiveType = { kind: 'primitive', type: 'string' };
export const NUMBER: PrimitiveType = { kind: 'primitive', type: 'number' };
export const BOOLEAN: PrimitiveType = { kind: 'primitive', type: 'boolean' };

interface ListType {
  kind: 'list';
  type: Type;
}

export function listType(type: Type): ListType {
  return { type, kind: 'list' };
}

interface RecordType {
  kind: 'record';
  name: string;
}

export function recordType(decl: RecordDecl): RecordType {
  return { kind: 'record', name: decl.name };
}

interface StringAliasType {
  kind: 'stringalias';
  name: string;
}

export function stringAliasType(name: string): StringAliasType {
  return { name, kind: 'stringalias' };
}

interface ResourceIdType {
  kind: 'resourceid';
  name: string;
}

export function resourceIdType(name: string): ResourceIdType {
  return { name, kind: 'resourceid' };
}

interface ArnType {
  kind: 'arntype';
  name: string;
}

export function arnType<R extends string>(params: RecordDecl): ArnType {
  return { name: `AT.ArnT<"${resourceName(params.name)}">`, kind: 'arntype' };
}

interface EnumType {
  kind: 'enum';
  values: string[];
}

export function enumType(values: string[]): EnumType {
  return { values, kind: 'enum' };
}

interface TagsMapType {
  kind: 'tagsmap';
}

export const TAGS_MAP: TagsMapType = { kind: 'tagsmap' };

interface AttributeDecl {
  name: string;
  type: AttributeType;
}

type AttributeType =
  | { kind: 'string'; type: string; typelabel: string }
  | { kind: 'resourceid'; resource: string }
  | { kind: 'resourcearn'; resource: string };

export function stringAttr(name: string): AttributeDecl {
  return {
    name,
    type: { kind: 'string', type: 'string', typelabel: 'string' },
  };
}

export function stringAliasAttr(
  name: string,
  typelabel: string,
  type: string
): AttributeDecl {
  return { name, type: { type, typelabel, kind: 'string' } };
}

export function resourceIdAttr(
  name: string,
  params: RecordDecl
): AttributeDecl {
  return { name, type: { kind: 'resourceid', resource: params.name } };
}

export function resourceArnAttr(
  name: string,
  params: RecordDecl
): AttributeDecl {
  return { name, type: { kind: 'resourcearn', resource: params.name } };
}

export interface Generator {
  generateResource(
    title: string,
    link: string,
    params: RecordDecl,
    attributes: AttributeDecl[],
    options?: {
      // id: boolean;
      arn: boolean /** Opt-in: Generate a typed Arn and expose as 'arn' attribute */;
    }
  ): void;
  generateParams(params: RecordDecl): void;
}

export interface FileGenerator extends Generator {
  writeFile(path: string): void;
}

function camelFromSnake(s: string): string {
  return s
    .split('_')
    .map(el => el[0].toUpperCase() + el.substr(1))
    .join('');
}

function genType(type: Type): string {
  switch (type.kind) {
    case 'primitive':
      return type.type;
    case 'list':
      return '(' + genType(type.type) + ')' + '[]';
    case 'record':
      return paramsInterfaceName(type.name);
    case 'stringalias':
      return type.name;
    case 'arntype':
      return type.name;
    case 'resourceid':
      return type.name;
    case 'tagsmap':
      return 'TF.TagsMap';
    case 'enum':
      return type.values.map(name => `'${name}'`).join(' | ');
  }
}

function genAttrType(type: AttributeType): string {
  switch (type.kind) {
    case 'string':
      return type.type;
    case 'resourceid':
      return `${camelFromSnake(type.resource)}Id`;
    case 'resourcearn':
      return `${camelFromSnake(type.resource)}Arn`;
  }
}

function genAttrTypeLabel(type: AttributeType): string {
  switch (type.kind) {
    case 'string':
      return type.typelabel;
    case 'resourceid':
      return camelFromSnake(type.resource) + 'Id';
    case 'resourcearn':
      return camelFromSnake(type.resource) + 'Arn';
  }
}

function genResourceFn(type: Type): string {
  switch (type.kind) {
    case 'primitive':
      return `TF.${type.type}Value`;
    case 'list':
      return `TF.listValue(${genResourceFn(type.type)})`;
    case 'record':
      return `(v) => TF.mapValue(fieldsFrom${paramsInterfaceName(
        type.name
      )}(v))`;
    case 'stringalias':
      return 'TF.stringAliasValue';
    case 'arntype':
      return 'TF.resourceArnValue';
    case 'resourceid':
      return 'TF.resourceIdValue';
    case 'tagsmap':
      return 'TF.tagsValue';
    case 'enum':
      return 'TF.stringValue';
  }
}

function resourceName(name: string) {
  return camelFromSnake(name);
}

function paramsInterfaceName(name: string) {
  return camelFromSnake(name) + 'Params';
}

export function fileGenerator(
  provider: string,
  headerLines: string[],
  providerPrefix: boolean = false
): FileGenerator {
  const lines: string[] = headerLines.concat([]);

  let prefix = '';
  if (providerPrefix) {
    prefix = camelFromSnake(provider);
  }

  function generateResource(
    comment: string,
    link: string,
    params: RecordDecl,
    attributes: AttributeDecl[],
    options?: {
      // id: boolean;
      arn: boolean /** Opt-in: Generate a typed Arn and expose as 'arn' attribute */;
    }
  ) {
    const name = resourceName(params.name);
    const paramsName = paramsInterfaceName(name);
    const resourceType = provider + '_' + params.name;

    if (options && options.arn) {
      attributes.push(resourceArnAttr('arn', params));
    }

    lines.push(`/**`);
    lines.push(` *  ${comment}`);
    lines.push(` *`);
    lines.push(` *  see ${link}`);
    lines.push(` */`);
    lines.push(
      `export function create${prefix}${name}(tfgen: TF.Generator, rname: string, params: ${prefix}${paramsName}): ${name} {`
    );
    lines.push(`  const fields = fieldsFrom${prefix}${paramsName}(params);`);
    lines.push(
      `  const resource = tfgen.createTypedResource('${name}', '${resourceType}', rname, fields);`
    );
    for (const attr of attributes) {
      if (attr.type.kind === 'string' && attr.type.type === 'string') {
        lines.push(
          `  const ${
            attr.name
          }: string =  '\$\{' + TF.resourceName(resource) + '.${attr.name}}';`
        );
      } else if (attr.type.kind === 'resourcearn') {
        lines.push(
          `  const ${attr.name}: ${genAttrType(
            attr.type
          )} = AT.arnT('\$\{' + TF.resourceName(resource) + '.${
            attr.name
          }}', '${name}');`
        );
      } else {
        lines.push(
          `  const ${attr.name}: ${genAttrType(
            attr.type
          )} =  {type: '${genAttrTypeLabel(
            attr.type
          )}', value: '\$\{' + TF.resourceName(resource) + '.${attr.name}}'};`
        );
      }
    }
    lines.push('');
    lines.push('  return {');
    lines.push('    ...resource,');
    for (const attr of attributes) {
      lines.push(`    ${attr.name},`);
    }
    lines.push('  };');
    lines.push('}');
    lines.push('');
    lines.push(`export interface ${name} extends TF.ResourceT<'${name}'> {`);

    for (const attr of attributes) {
      lines.push(`  ${attr.name}: ${genAttrType(attr.type)};`);
    }
    lines.push('}');
    lines.push('');
    lines.push(`export type ${name}Id = {type:'${name}Id',value:string};`);
    if (options && options.arn) {
      lines.push(`export type ${name}Arn = AT.ArnT<"${name}">;`);
    }
    lines.push('');
  }

  function generateParams(record: RecordDecl) {
    const interfaceName = paramsInterfaceName(record.name);
    lines.push(`export interface ${prefix}${interfaceName} {`);
    for (const field of record.fields) {
      const type = genType(field.type);
      const optional = field.optional ? '?' : '';
      lines.push(`  ${field.field}${optional}: ${type};`);
    }
    lines.push('}');
    lines.push('');
    lines.push(
      `export function fieldsFrom${prefix}${interfaceName}(params: ${prefix}${interfaceName}) : TF.ResourceFieldMap {`
    );
    lines.push('  const fields: TF.ResourceFieldMap = [];');
    for (const field of record.fields) {
      const fname = field.field;
      const toResourceFn = genResourceFn(field.type);
      if (field.optional) {
        lines.push(
          `  TF.addOptionalField(fields, "${fname}", params.${fname}, ${toResourceFn});`
        );
      } else {
        lines.push(
          `  TF.addField(fields, "${fname}", params.${fname}, ${toResourceFn});`
        );
      }
    }
    lines.push('  return fields;');
    lines.push('}');
    lines.push('');
  }

  function writeFile(path: string) {
    fs.writeFileSync(path, lines.join('\n'));
  }

  return {
    generateResource,
    generateParams,
    writeFile,
  };
}
