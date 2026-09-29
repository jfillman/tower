function resolveRef(schema, root) {
  if (schema && typeof schema.$ref === "string" && schema.$ref.startsWith("#/")) {
    const parts = schema.$ref.slice(2).split("/");
    let node = root;
    for (const part of parts) node = node?.[part];
    return node ?? {};
  }
  return schema;
}
function typeMatches(value, type) {
  switch (type) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}
function validateAgainstSchema(schemaIn, root, value, path = "$") {
  if (!schemaIn) return [];
  const schema = resolveRef(schemaIn, root);
  if (!schema || typeof schema !== "object") return [];
  const issues = [];
  if (value === void 0) return issues;
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(value, t))) {
      issues.push({ path, message: `expected ${types.join(" or ")}, got ${value === null ? "null" : typeof value}` });
      return issues;
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    issues.push({ path, message: `must be one of ${schema.enum.join(", ")}` });
  }
  if (schema.const !== void 0 && value !== schema.const) {
    issues.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
  }
  if (typeof value === "string") {
    if (schema.minLength !== void 0 && value.length < schema.minLength) {
      issues.push({ path, message: `must be at least ${schema.minLength} character(s)` });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      issues.push({ path, message: `must match pattern ${schema.pattern}` });
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== void 0 && value < schema.minimum) issues.push({ path, message: `must be >= ${schema.minimum}` });
    if (schema.maximum !== void 0 && value > schema.maximum) issues.push({ path, message: `must be <= ${schema.maximum}` });
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) {
      issues.push({ path, message: `must be > ${schema.exclusiveMinimum}` });
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== void 0 && value.length < schema.minItems) {
      issues.push({ path, message: `must have at least ${schema.minItems} item(s)` });
    }
    if (schema.items) {
      value.forEach((item, i) => issues.push(...validateAgainstSchema(schema.items, root, item, `${path}[${i}]`)));
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value;
    if (schema.required) {
      for (const key of schema.required) {
        if (obj[key] === void 0) issues.push({ path: `${path}.${key}`, message: "is required" });
      }
    }
    if (schema.properties) {
      for (const key of Object.keys(schema.properties)) {
        if (obj[key] !== void 0) {
          issues.push(...validateAgainstSchema(schema.properties[key], root, obj[key], `${path}.${key}`));
        }
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const key of Object.keys(obj)) {
        issues.push(...validateAgainstSchema(schema.additionalProperties, root, obj[key], `${path}.${key}`));
      }
    }
    if (schema.not?.required) {
      const allPresent = schema.not.required.every((k) => obj[k] !== void 0);
      if (allPresent) issues.push({ path, message: `must not set both: ${schema.not.required.join(" and ")}` });
    }
    if (schema.anyOf) {
      const satisfied = schema.anyOf.some(
        (sub) => sub.required ? sub.required.every((k) => obj[k] !== void 0) : true
      );
      if (!satisfied) issues.push({ path, message: "must satisfy at least one of its required-field options" });
    }
  }
  if (schema.if) {
    const conditionMet = validateAgainstSchema(schema.if, root, value, path).length === 0;
    if (conditionMet && schema.then) issues.push(...validateAgainstSchema(schema.then, root, value, path));
    else if (!conditionMet && schema.else) issues.push(...validateAgainstSchema(schema.else, root, value, path));
  }
  if (schema.allOf) {
    for (const sub of schema.allOf) issues.push(...validateAgainstSchema(sub, root, value, path));
  }
  return issues;
}

export { validateAgainstSchema };
//# sourceMappingURL=schemaValidate.esm.js.map
