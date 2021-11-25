// Code to represent and write HCL2

import CodeBlockWriter from "https://deno.land/x/code_block_writer@10.1.1/mod.ts";

// DSL for Hashicorp Configuration Language 2 (HCL)

// https://github.com/hashicorp/hcl/blob/main/spec.md
// https://github.com/hashicorp/hcl/blob/main/hclsyntax/spec.md

/**
 * A body is a collection of associated attributes and blocks.
 * The meaning of this association is defined by the calling application.
 */
export type BodyItem = Attribute | Block | Comment;

/**
 * A configuration file is a sequence of characters whose top-level is interpreted as a Body.
 */
export type ConfigFile = BodyItem[];

/**
 * An attribute definition assigns a value to a particular attribute name within a body. Each distinct attribute name may be defined no more than once within a single body.
 * The attribute value is given as an expression, which is retained literally for later evaluation by the calling application.
 */
export class Attribute {
  // Identifier "=" Expression Newline;
  kind: "Attribute" = "Attribute";
  constructor(
    public name: Identifier,
    public value: Expression,
  ) {}
}
export function attribute(name: Identifier | string, value: Expression) {
  return new Attribute(identifier(name), value);
}

/**
 * A block creates a child body that is annotated with a block type and zero or more block labels. Blocks create a structural hierarchy which can be interpreted by the calling application.
 * Block labels can either be quoted literal strings or naked identifiers.
 */
export class Block {
  // Block = Identifier (StringLit|Identifier)* "{" Newline Body "}" Newline;
  kind: "Block" = "Block";
  constructor(
    public identifier: Identifier,
    public labels: (StringLit | Identifier)[],
    public body: BodyItem[],
  ) {}
}
export function block(
  name: Identifier | string,
  labels: (StringLit | Identifier)[],
  body: BodyItem[],
) {
  return new Block(identifier(name), labels, body);
}

export type Comment = InlineComment | BlockComment | BlankLine;

export class InlineComment {
  kind: "InlineComment" = "InlineComment";
  constructor(public content: string) {}
}

export class BlockComment {
  kind: "BlockComment" = "BlockComment";
  constructor(public content: string, public opts: { indent?: boolean } = {}) {}
}

export class BlankLine {
  kind: "BlankLine" = "BlankLine";
  constructor() {}
}

/**
 * Identifiers name entities such as blocks, attributes and expression variables
 */
export class Identifier {
  // Identifier = ID_Start (ID_Continue | '-')*;
  kind: "Identifier" = "Identifier";
  constructor(public value: string) {}
}

export function identifier(value: string | Identifier) {
  if (typeof value === "string") {
    return new Identifier(value);
  }
  return value;
}

/**
 * A quoted template expression containing only a single literal string serves as a syntax for defining literal string expressions.
 */
export class StringLit {
  // StringLit = "value";
  kind: "StringLit" = "StringLit";
  constructor(public value: string) {}
}
export function stringLit(value: string) {
  return new StringLit(value);
}

/**
 * The expression sub-language is used within attribute definitions to specify values.
 */
export type Expression = ExprTerm; // | Operation | Conditional;
// Operation | Conditional are not implemented

/**
 * Expression terms are the operands for unary and binary expressions, as well as acting as expressions in their own right.
 */
export type ExprTerm =
  | LiteralValue
  | CollectionValue
  | TemplateExpr
  | VariableExpr
  | FunctionCall
  //| ForExpr (not implemented)
  | ExprTermIndex
  | ExprTermGetAttr
  //| ExprTerm Splat  (not implemented)
  | BracketedExpression;

export class ExpressionBuilder {
  constructor(public expr: Expression) {}

  at(index: Expression) {
    return new ExpressionBuilder(
      new ExprTermIndex(this.expr, index),
    );
  }

  dot(attr: Identifier | string) {
    return new ExpressionBuilder(
      new ExprTermGetAttr(this.expr, identifier(attr)),
    );
  }
}
export function exprBuilder(expr: Expression) {
  return new ExpressionBuilder(expr);
}

/** A literal value immediately represents a particular value of a primitive type. */
export type LiteralValue = StringLit | NumericLit | BooleanLit | NullLit;

/** Primitive types for HCL2 */
export type Primitive = string | number | boolean | null;

export class NumericLit {
  kind: "NumericLit" = "NumericLit";
  constructor(public value: number) {}
}
export function numericLit(value: number) {
  return new NumericLit(value);
}

export class BooleanLit {
  kind: "BooleanLit" = "BooleanLit";
  constructor(public value: boolean) {}
}
export function booleanLit(value: boolean) {
  return new BooleanLit(value);
}

export class NullLit {
  kind: "NullLit" = "NullLit";
}
export function nullLit() {
  return new NullLit();
}

export function primitiveLit(primitive: Primitive): LiteralValue {
  if (typeof primitive === "string") {
    return stringLit(primitive);
  }
  if (typeof primitive === "number") {
    return numericLit(primitive);
  }
  if (primitive === true || primitive === false) {
    return booleanLit(primitive);
  }
  if (primitive === null) {
    return nullLit();
  }
  throw new Error("Unknown primitive value");
}

/// Collections: Tuples and Objects
export type CollectionValue = TupleExpr | ObjectExpr;

/// Tuple expression
export class TupleExpr {
  /*
  TupleExpr = "[" (
    (Expression ("," Expression)* ","?)?
  ) "]";
  */
  kind: "TupleExpr" = "TupleExpr";
  constructor(public values: Expression[]) {}
}
export function tupleExpr(values: Expression[]) {
  return new TupleExpr(values);
}

/// Object expression
export class ObjectExpr {
  /*
  object = "{" (
    (objectelem ("," objectelem)* ","?)?
  ) "}";
  */
  kind: "ObjectExpr" = "ObjectExpr";
  constructor(public elements: ObjectElement[]) {}
}
export function objectExpr(
  entries: { key: string | Identifier | Expression; value: Expression }[],
) {
  return new ObjectExpr(entries.map((e) => objectElement(e.key, e.value)));
}

/// key=value entry in an object expression
export class ObjectElement {
  // objectelem = (Identifier | Expression) ("=" | ":") Expression;
  kind: "ObjectElement" = "ObjectElement";

  constructor(
    public key: (Identifier | Expression),
    public value: Expression,
  ) {}
}
export function objectElement(
  key: string | Identifier | Expression,
  value: Expression,
) {
  if (typeof key === "string") {
    return new ObjectElement(identifier(key), value);
  }
  return new ObjectElement(key, value);
}

/// direct reference to a variable
export class VariableExpr {
  kind: "VariableExpr" = "VariableExpr";
  constructor(public identifier: Identifier) {}
}
export function getVariable(vr: string | Identifier) {
  return new VariableExpr(identifier(vr));
}

/// reference to expression[i]
export class ExprTermIndex {
  kind: "ExprTermIndex" = "ExprTermIndex";
  constructor(public expression: ExprTerm, public index: Expression) {}
}
export function atIndex(term: ExprTerm, index: ExpressionOrValue) {
  return new ExprTermIndex(term, getExpr(index));
}

/// reference to expression.attr
export class ExprTermGetAttr {
  kind: "ExprTermGetAttr" = "ExprTermGetAttr";
  constructor(public expression: ExprTerm, public attr: Identifier) {}
}

/// Call to a (terraform builtin) function
export class FunctionCall {
  /*
  FunctionCall = Identifier "(" arguments ")";
  Arguments = (
      () ||
      (Expression ("," Expression)* ("," | "...")?)
  );
  */
  kind: "FunctionCall" = "FunctionCall";
  constructor(public name: Identifier, public args: Expression[] = []) {}
}
export function functionCall(name: Identifier | string, args: Expression[]) {
  return new FunctionCall(identifier(name), args);
}

export type TemplateExpr = QuotedTemplate | HeredocTemplate;

export class QuotedTemplate {
  kind: "QuotedTemplate" = "QuotedTemplate";
  constructor(public body: string) {}
}
export function quotedTemplate(body: string) {
  return new QuotedTemplate(body);
}

export class HeredocTemplate {
  kind: "HeredocTemplate" = "HeredocTemplate";
  constructor(
    public identifier: Identifier,
    public body: string,
    public opts: { indented?: boolean } = {},
  ) {}
}
export function heredocTemplate(
  name: Identifier | string,
  body: string,
  opts: { indented?: boolean } = {},
) {
  return new HeredocTemplate(identifier(name), body, opts);
}

/// Expression in brackets
export class BracketedExpression {
  kind: "BracketedExpression" = "BracketedExpression";
  constructor(public expression: Expression) {}
}
export function bracketed(expr: Expression) {
  return new BracketedExpression(expr);
}

// https://github.com/hashicorp/hcl/blob/main/hclsyntax/spec.md#template-interpolations
export function interpolate(expr: Expression): string {
  const writer = new CodeBlockWriter({
    newLine: "\n",
    indentNumberOfSpaces: 0,
    useTabs: false,
    useSingleQuote: false,
  });
  renderExpression(writer, expr);

  const body = writer.toString();
  const head = "${";
  const tail = "}";
  return head + body + tail;
}

/** Write out HCL2 ConfigFile to string */
export function generateToWriter(writer: CodeBlockWriter, input: ConfigFile) {
  renderBody(writer, input);
}

export function generate(input: ConfigFile): string {
  const writer = new CodeBlockWriter({
    newLine: "\n",
    indentNumberOfSpaces: 2,
    useTabs: false,
    useSingleQuote: false,
  });
  generateToWriter(writer, input);
  return writer.toString();
}

function renderBody(writer: CodeBlockWriter, items: BodyItem[]) {
  for (const item of items) {
    switch (item.kind) {
      case "Attribute":
        renderIdentifier(writer, item.name);
        writer.write(" = ");
        renderExpression(writer, item.value);
        writer.newLineIfLastNot();
        break;
      case "Block": {
        renderIdentifier(writer, item.identifier);
        writer.space();
        for (const label of item.labels) {
          renderLabel(writer, label);
          writer.space();
        }
        writer.block(() => {
          renderBody(writer, item.body);
        });
        writer.newLineIfLastNot();
        break;
      }
      case "InlineComment": {
        writer.write("// ").write(item.content).newLineIfLastNot();
        break;
      }
      case "BlockComment": {
        writer.write("/*");
        const i = (item.opts.indent ?? true) ? 1 : 0;
        writer.withIndentationLevel(writer.getIndentationLevel() + i, () => {
          writer.write(item.content);
        });
        writer.write("*/");
        break;
      }
      case "BlankLine": {
        if (writer.getLastChar() !== undefined) {
          writer.blankLineIfLastNot();
        }
        break;
      }
      default:
        assertNever(item);
    }
  }
}

function renderStringLit(writer: CodeBlockWriter, val: StringLit) {
  writer.write(`"${val.value}"`);
}

function renderIdentifier(writer: CodeBlockWriter, identifier: Identifier) {
  writer.write(identifier.value);
}

function renderLabel(writer: CodeBlockWriter, label: StringLit | Identifier) {
  if (label.kind === "Identifier") {
    renderIdentifier(writer, label);
    return;
  }
  renderStringLit(writer, label);
}

/**
In quoted template expressions any literal string sequences within the template behave in a special way:
  literal newline sequences are not permitted
  and instead escape sequences can be included, starting with the backslash \:

    \n         Unicode newline control character
    \r         Unicode carriage return control character
    \t         Unicode tab control character
    \"         Literal quote mark, used to prevent interpretation as end of string
    \\         Literal backslash, used to prevent interpretation as escape sequence
    \uNNNN     Unicode character from Basic Multilingual Plane (NNNN is four hexadecimal digits)
    \UNNNNNNNN Unicode character from supplementary planes (NNNNNNNN is eight hexadecimal digits)
*/
export function escapeString(val: string): string {
  return val
    .replaceAll("\\", `\\\\`)
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t")
    .replaceAll('"', '\\"');
  // ignore escaping unicode characters
}

function renderExpression(writer: CodeBlockWriter, expression: Expression) {
  switch (expression.kind) {
    case "BooleanLit":
      writer.write(expression.value ? "true" : "false");
      return;
    case "NullLit":
      writer.write("null");
      return;
    case "NumericLit":
      writer.write(`${expression.value}`);
      return;
    case "StringLit":
      writer.write(`"${expression.value}"`);
      return;

    case "TupleExpr": {
      writer.write("[");
      writer.indent(() => {
        let isFirst = true;
        for (const expr of expression.values) {
          if (!isFirst) {
            writer.write(",");
            writer.newLine();
          }
          renderExpression(writer, expr);
          isFirst = false;
        }
      });
      writer.write("]");
      return;
    }
    case "ObjectExpr": {
      writer.write("{");
      writer.indent(() => {
        let isFirst = true;
        for (const objElement of expression.elements) {
          if (!isFirst) {
            writer.write(",");
            writer.newLine();
          }
          renderObjectElement(writer, objElement);
          isFirst = false;
        }
      });
      writer.write("}");
      return;
    }
    case "VariableExpr":
      renderIdentifier(writer, expression.identifier);
      return;
    case "ExprTermIndex": {
      renderExpression(writer, expression.expression);
      writer.write("[");
      renderExpression(writer, expression.index);
      writer.write("]");
      return;
    }
    case "ExprTermGetAttr": {
      renderExpression(writer, expression.expression);
      writer.write(".");
      renderIdentifier(writer, expression.attr);
      return;
    }
    case "FunctionCall": {
      renderIdentifier(writer, expression.name);
      writer.write("(");
      let sep = "";
      for (const arg of expression.args) {
        writer.write(sep);
        renderExpression(writer, arg);
        sep = ", ";
      }
      writer.write(")");
      return;
    }
    case "QuotedTemplate": {
      writer.write('"').write(expression.body).write('"');
      return;
    }
    case "HeredocTemplate": {
      // If a heredoc template is introduced with the <<- symbol, any literal string at the start of each line is analyzed to find the minimum number of leading spaces, and then that number of prefix spaces is removed from all line-leading literal strings.
      const stripIndent = expression.opts.indented ?? true;
      if (stripIndent) {
        writer.write("<<-");
      } else {
        writer.write("<<");
      }
      renderIdentifier(writer, expression.identifier);
      writer.newLine();
      writer.write(expression.body);
      writer.newLineIfLastNot();
      renderIdentifier(writer, expression.identifier);
      writer.newLine();
      return;
    }
    case "BracketedExpression": {
      writer.write("(");
      renderExpression(writer, expression.expression);
      writer.write(")");
      return;
    }
    default:
      assertNever(expression);
  }
}

function renderObjectElement(
  writer: CodeBlockWriter,
  objectElement: ObjectElement,
) {
  switch (objectElement.key.kind) {
    case "Identifier":
      renderIdentifier(writer, objectElement.key);
      break;
    default:
      renderExpression(writer, objectElement.key);
  }
  writer.write(" = ");
  renderExpression(writer, objectElement.value);
}

/// Accept either an arbitary (HCL2) expression or the type T value (marked as having no 'kind')
export type ExpressionOrValueT<T extends Primitive> =
  | Expression // an HCL expression
  | (T & { kind?: undefined }) // a javascript value (with no kind)
;

/// Helpers to accept expressions OR any primitive plain values
export type ExpressionOrValue = ExpressionOrValueT<Primitive>;

/** Read any Expression or value and convert primitives to literal expressions */
export function getExpr(
  v: ExpressionOrValue,
): Expression {
  if (v.kind === undefined) {
    return primitiveLit(v);
  }
  return v;
}

export function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}