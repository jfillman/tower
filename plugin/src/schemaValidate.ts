// Minimal, hand-rolled JSON Schema (draft-07-subset) validator - deliberately
// not a dependency on `ajv` (not a real dependency of this app; only present
// transitively via other tools' node_modules, which is too fragile to import
// from - see item 3's own discussion). This app has no other JSON Schema
// need, and the schema this validates against
// (airframe/charts/airframe-application/values.schema.json) only ever uses
// the subset implemented below: type, enum, required, properties,
// additionalProperties (as a map value-schema), items, minItems, minLength,
// pattern, minimum/maximum/exclusiveMinimum (numeric form), not+required
// (mutual exclusion), anyOf (any-one-of-these-required), if/then/else, allOf,
// and $ref into #/definitions. Every one of those is exercised by the real
// schema file - this isn't a generic JSON Schema engine, just enough of one
// to validate Tower's own Config-tab patches against a real chart schema
// instead of re-hardcoding the same invariants a second time in TypeScript.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonSchema = Record<string, any>;

export interface SchemaIssue {
  path: string;
  message: string;
}

function resolveRef(schema: JsonSchema, root: JsonSchema): JsonSchema {
  if (schema && typeof schema.$ref === 'string' && schema.$ref.startsWith('#/')) {
    const parts = schema.$ref.slice(2).split('/');
    let node: unknown = root;
    for (const part of parts) node = (node as JsonSchema | undefined)?.[part];
    return (node as JsonSchema) ?? {};
  }
  return schema;
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

export function validateAgainstSchema(
  schemaIn: JsonSchema | undefined,
  root: JsonSchema,
  value: unknown,
  path = '$',
): SchemaIssue[] {
  if (!schemaIn) return [];
  const schema = resolveRef(schemaIn, root);
  if (!schema || typeof schema !== 'object') return [];
  const issues: SchemaIssue[] = [];

  if (value === undefined) return issues; // nothing to check on an absent optional value

  if (schema.type) {
    const types: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(t => typeMatches(value, t))) {
      issues.push({ path, message: `expected ${types.join(' or ')}, got ${value === null ? 'null' : typeof value}` });
      return issues; // further checks are meaningless once the base type is wrong
    }
  }

  if (schema.enum && !(schema.enum as unknown[]).includes(value)) {
    issues.push({ path, message: `must be one of ${(schema.enum as unknown[]).join(', ')}` });
  }
  if (schema.const !== undefined && value !== schema.const) {
    issues.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({ path, message: `must be at least ${schema.minLength} character(s)` });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      issues.push({ path, message: `must match pattern ${schema.pattern}` });
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) issues.push({ path, message: `must be >= ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum) issues.push({ path, message: `must be <= ${schema.maximum}` });
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
      issues.push({ path, message: `must be > ${schema.exclusiveMinimum}` });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({ path, message: `must have at least ${schema.minItems} item(s)` });
    }
    if (schema.items) {
      value.forEach((item, i) => issues.push(...validateAgainstSchema(schema.items, root, item, `${path}[${i}]`)));
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (schema.required) {
      for (const key of schema.required as string[]) {
        if (obj[key] === undefined) issues.push({ path: `${path}.${key}`, message: 'is required' });
      }
    }
    if (schema.properties) {
      for (const key of Object.keys(schema.properties)) {
        if (obj[key] !== undefined) {
          issues.push(...validateAgainstSchema(schema.properties[key], root, obj[key], `${path}.${key}`));
        }
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      // Map-shaped object (e.g. {additionalProperties: {type: 'string'}} for
      // a labels/annotations record) - validate every value against the one
      // shared value-schema.
      for (const key of Object.keys(obj)) {
        issues.push(...validateAgainstSchema(schema.additionalProperties, root, obj[key], `${path}.${key}`));
      }
    }
    if (schema.not?.required) {
      const allPresent = (schema.not.required as string[]).every(k => obj[k] !== undefined);
      if (allPresent) issues.push({ path, message: `must not set both: ${(schema.not.required as string[]).join(' and ')}` });
    }
    if (schema.anyOf) {
      const satisfied = (schema.anyOf as JsonSchema[]).some(sub =>
        sub.required ? (sub.required as string[]).every(k => obj[k] !== undefined) : true,
      );
      if (!satisfied) issues.push({ path, message: 'must satisfy at least one of its required-field options' });
    }
  }

  if (schema.if) {
    const conditionMet = validateAgainstSchema(schema.if, root, value, path).length === 0;
    if (conditionMet && schema.then) issues.push(...validateAgainstSchema(schema.then, root, value, path));
    else if (!conditionMet && schema.else) issues.push(...validateAgainstSchema(schema.else, root, value, path));
  }
  if (schema.allOf) {
    for (const sub of schema.allOf as JsonSchema[]) issues.push(...validateAgainstSchema(sub, root, value, path));
  }

  return issues;
}
