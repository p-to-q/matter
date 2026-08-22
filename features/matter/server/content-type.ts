/** Parses only the HTTP media type and well-formed parameters needed at route boundaries. */
export function isJsonContentType(value: string | null): boolean {
  return parseContentType(value)?.mediaType === "application/json";
}

export function hasMultipartFormDataBoundary(value: string | null): boolean {
  const parsed = parseContentType(value);
  return parsed?.mediaType === "multipart/form-data" &&
    parsed.boundary !== undefined &&
    isMultipartBoundary(parsed.boundary);
}

type ParsedContentType = Readonly<{ mediaType: string; boundary?: string }>;

function parseContentType(value: string | null): ParsedContentType | null {
  if (value === null) return null;
  const parts = splitParameters(value);
  if (parts === null || parts.length === 0) return null;
  const mediaType = parts[0]!.trim().toLowerCase();
  if (!isMediaType(mediaType)) return null;

  let boundary: string | undefined;
  for (const parameter of parts.slice(1)) {
    const match = /^[ \t]*([!#$%&'*+\-.^_`|~0-9A-Za-z]+)[ \t]*=([^\r\n]*)$/u.exec(parameter);
    if (match === null) return null;
    const name = match[1]!.toLowerCase();
    // HTTP optional whitespace is SP / HTAB only. JavaScript trim() also
    // removes vertical and Unicode whitespace, which would launder malformed
    // parameter values into valid tokens at the request boundary.
    const rawValue = match[2]!.replace(/^[ \t]+|[ \t]+$/gu, "");
    if (rawValue.length === 0) return null;
    const parameterValue = parseParameterValue(rawValue);
    if (parameterValue === null) return null;
    if (name === "boundary") {
      if (boundary !== undefined || parameterValue.length === 0) return null;
      boundary = parameterValue;
    }
  }
  return Object.freeze({ mediaType, ...(boundary === undefined ? {} : { boundary }) });
}

function splitParameters(value: string): string[] | null {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') quoted = !quoted;
    else if (character === ";" && !quoted) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  if (quoted || escaped) return null;
  parts.push(value.slice(start));
  return parts;
}

function isMediaType(value: string): boolean {
  return /^[!#$%&'*+\-.^_`|~0-9a-z]+\/[!#$%&'*+\-.^_`|~0-9a-z]+$/u.test(value);
}

function parseParameterValue(value: string): string | null {
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length < 2) return null;
    let result = "";
    let escaped = false;
    for (const character of value.slice(1, -1)) {
      if (escaped) {
        result += character;
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"' || character === "\r" || character === "\n") {
        return null;
      } else {
        result += character;
      }
    }
    return escaped ? null : result;
  }
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(value) ? value : null;
}

/** RFC 2046 limits multipart boundaries to 70 ASCII bchars, with no trailing space. */
function isMultipartBoundary(value: string): boolean {
  return value.length >= 1 &&
    value.length <= 70 &&
    /^[0-9A-Za-z'()+_,\-./:=?](?:[0-9A-Za-z'()+_,\-./:=? ]*[0-9A-Za-z'()+_,\-./:=?])?$/u.test(value);
}
