// Validates a fingerprint submission body against fingerprint.schema.json.
//
// Mirrors blazer-rails/app/services/blazer/fingerprints/schema_validator.rb
// in shape: returns [{path, message}] on invalid input, empty array on valid.
// Running both validators on the same body should produce equivalent
// verdicts (identical schema, equivalent error structure).

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, "../../../../docs/fingerprint/fingerprint.schema.json");

let cachedValidator = null;

function loadValidator() {
  if (cachedValidator) return cachedValidator;
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf-8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

function humanize(err) {
  switch (err.keyword) {
    case "required":
      return `missing required property ${err.params.missingProperty}`;
    case "pattern":
      return `does not match pattern ${err.params.pattern}`;
    case "enum":
      return `must be one of ${(err.params.allowedValues || []).join(", ")}`;
    case "const":
      return `must equal ${JSON.stringify(err.params.allowedValue)}`;
    case "additionalProperties":
      return `unexpected property ${err.params.additionalProperty}`;
    case "format":
      return `invalid ${err.params.format} format`;
    case "type":
      return `must be ${err.params.type}`;
    default:
      return err.message || err.keyword;
  }
}

/**
 * Validate a parsed body. Returns [] on valid input, otherwise an array of
 * { path, message } objects where path is a JSON Pointer into the body.
 * Never throws on invalid input — only on schema-load failures.
 */
export function validate(body) {
  const fn = loadValidator();
  if (fn(body)) return [];
  return (fn.errors || []).map((err) => ({
    path: err.instancePath || "",
    message: humanize(err),
  }));
}

export function isValid(body) {
  return validate(body).length === 0;
}
