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
  return { kind: 'list', type };
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
  return { kind: 'stringalias', name };
}

interface ResourceIdType {
  kind: 'resourceid';
  name: string;
}

export function resourceIdType(name: string): ResourceIdType {
  return { kind: 'resourceid', name };
}

interface EnumType {
  kind: 'enum';
  values: string[];
}

export function enumType(values: string[]): EnumType {
  return { kind: 'enum', values };
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
  | { kind: 'resourceid'; resource: string };

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
  return { name, type: { kind: 'string', type, typelabel } };
}

export function resourceIdAttr(
  name: string,
  params: RecordDecl
): AttributeDecl {
  return { name, type: { kind: 'resourceid', resource: params.name } };
}

export interface Generator {
  generateResource(
    title,
    link,
    params: RecordDecl,
    attributes: AttributeDecl[]
  ): void;
  generateParams(params: RecordDecl): void;
}

export interface FileGenerator extends Generator {
  writeFile(path: string);
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
      return genType(type.type) + '[]';
    case 'record':
      return paramsInterfaceName(type.name);
    case 'stringalias':
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
  }
}

function genAttrTypeLabel(type: AttributeType): string {
  switch (type.kind) {
    case 'string':
      return type.typelabel;
    case 'resourceid':
      return camelFromSnake(type.resource) + 'Id';
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
  headerLines: string[]
): FileGenerator {
  const lines: string[] = headerLines.concat([]);

  function generateResource(
    comment,
    link,
    params: RecordDecl,
    attributes: AttributeDecl[]
  ) {
    const name = resourceName(params.name);
    const paramsName = paramsInterfaceName(name);
    const resourceType = provider + '_' + params.name;
    lines.push(`/**`);
    lines.push(` *  ${comment}`);
    lines.push(` *`);
    lines.push(` *  see ${link}`);
    lines.push(` */`);
    lines.push(
      `export function create${name}(tfgen: TF.Generator, rname: string, params: ${paramsName}): ${name} {`
    );
    lines.push(`  const fields = fieldsFrom${paramsName}(params);`);
    lines.push(
      `  const resource = tfgen.createResource('${resourceType}', rname, fields);`
    );
    for (const attr of attributes) {
      if (attr.type.kind == 'string' && attr.type.type == 'string') {
        lines.push(
          `  const ${
            attr.name
          }: string =  '\$\{' + TF.resourceName(resource) + '.${attr.name}}';`
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
    lines.push(`export interface ${name} extends TF.Resource {`);
    for (const attr of attributes) {
      lines.push(`  ${attr.name}: ${genAttrType(attr.type)};`);
    }
    lines.push('}');
    lines.push('');
    lines.push(`type ${name}Id = {type:'${name}Id',value:string};`);
    lines.push('');
  }

  function generateParams(record: RecordDecl) {
    const interfaceName = paramsInterfaceName(record.name);
    lines.push(`export interface ${interfaceName} {`);
    for (const field of record.fields) {
      const type = genType(field.type);
      const optional = field.optional ? '?' : '';
      lines.push(`  ${field.field}${optional}: ${type};`);
    }
    lines.push('}');
    lines.push('');
    lines.push(
      `export function fieldsFrom${interfaceName}(params: ${interfaceName}) : TF.ResourceFieldMap {`
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
