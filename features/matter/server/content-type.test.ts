import { describe, expect, it } from "vitest";
import { hasMultipartFormDataBoundary, isJsonContentType } from "./content-type";

describe("strict request Content-Type parsing", () => {
  it.each([
    "application/json",
    "Application/JSON; charset=utf-8",
    "application/json; charset=\"utf-8\"",
  ])("accepts an exact JSON MIME type with valid parameters: %s", (value) => {
    expect(isJsonContentType(value)).toBe(true);
  });

  it.each([
    null,
    "application/json-patch+json",
    "application/jsonx",
    "text/application/json",
    "application/json;",
    "application/json; charset=",
    "application/json; charset=\vutf-8",
    "application/json; charset=utf-8\v",
    "application/json; charset=\futf-8",
    "application/json; charset=utf-8\f",
    "application/json; charset=\u00a0utf-8",
    "application/json; charset=utf-8\u00a0",
  ])("rejects a non-exact or malformed JSON MIME type: %s", (value) => {
    expect(isJsonContentType(value)).toBe(false);
  });

  it.each([
    "multipart/form-data; boundary=MatterBoundaryAaZz",
    "Multipart/Form-Data; charset=utf-8; boundary=\"MatterBoundaryAaZz\"",
    `multipart/form-data; boundary=${"x".repeat(70)}`,
    "multipart/form-data; boundary=\"Matter Boundary AaZz\"",
  ])("accepts multipart only with a non-empty boundary: %s", (value) => {
    expect(hasMultipartFormDataBoundary(value)).toBe(true);
  });

  it.each([
    null,
    "multipart/form-data",
    "multipart/form-data; boundary=",
    "multipart/form-data; boundary=one; boundary=two",
    "multipart/form-datax; boundary=x",
    "multipart/form-data; boundary=\"unterminated",
    "multipart/form-data; boundary=\"trailing \"",
    "multipart/form-data; boundary=\"💣\"",
    `multipart/form-data; boundary=${"x".repeat(71)}`,
  ])("rejects malformed multipart metadata: %s", (value) => {
    expect(hasMultipartFormDataBoundary(value)).toBe(false);
  });
});
