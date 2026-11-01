import { ValidationIssue } from "../domain/types";

export interface Token {
  text: string;
  start: number;
}

export interface StringArgument {
  token: Token;
  value: string | undefined;
}

const tokenPattern =
  /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|./g;

export function tokenizeSource(source: string): Token[] {
  const tokens: Token[] = [];
  for (const match of source.matchAll(tokenPattern)) {
    const text = match[0];
    if (/^(?:\/\/|\/\*)/.test(text) || /^\s+$/.test(text)) {
      continue;
    }
    tokens.push({ text, start: match.index });
  }
  return tokens;
}

export function getCallArguments(
  tokens: Token[],
  openParenIndex: number,
): Token[][] | undefined {
  const closingIndex = findClosingParenIndex(tokens, openParenIndex);
  if (closingIndex === undefined) {
    return undefined;
  }

  const args: Token[][] = [];
  const closingDelimiters: string[] = [];
  let argumentStart = openParenIndex + 1;

  for (let index = argumentStart; index < closingIndex; index += 1) {
    const text = tokens[index]!.text;
    if (text === "(" || text === "[" || text === "{") {
      closingDelimiters.push(text === "(" ? ")" : text === "[" ? "]" : "}");
    } else if (
      (text === ")" || text === "]" || text === "}") &&
      closingDelimiters.length > 0 &&
      closingDelimiters[closingDelimiters.length - 1] === text
    ) {
      closingDelimiters.pop();
    } else if (text === "," && closingDelimiters.length === 0) {
      args.push(tokens.slice(argumentStart, index));
      argumentStart = index + 1;
    }
  }

  args.push(tokens.slice(argumentStart, closingIndex));
  return args;
}

/**
 * openParenIndex の "(" に対応する ")" のトークン位置を返す。
 */
export function findClosingParenIndex(
  tokens: Token[],
  openParenIndex: number,
): number | undefined {
  const closingDelimiters: string[] = [];

  for (let index = openParenIndex + 1; index < tokens.length; index += 1) {
    const text = tokens[index]!.text;
    if (text === "(" || text === "[" || text === "{") {
      closingDelimiters.push(text === "(" ? ")" : text === "[" ? "]" : "}");
    } else if (
      (text === ")" || text === "]" || text === "}") &&
      closingDelimiters.length > 0 &&
      closingDelimiters[closingDelimiters.length - 1] === text
    ) {
      closingDelimiters.pop();
    } else if (text === ")" && closingDelimiters.length === 0) {
      return index;
    }
  }

  return undefined;
}


/**
 * 単一の文字列リテラル引数を取り出す。エスケープを含む場合は value を undefined にする。
 */
export function getStringArgument(
  tokens: Token[] | undefined,
): StringArgument | undefined {
  if (tokens?.length !== 1) {
    return undefined;
  }

  const token = tokens[0]!;
  const quote = token.text[0];
  if (
    (quote === '"' || quote === "'") &&
    token.text[token.text.length - 1] === quote
  ) {
    const value = token.text.slice(1, -1);
    return {
      token,
      value: value.includes("\\") ? undefined : value,
    };
  }

  return undefined;
}

export function createSourceIssue(
  source: string,
  token: Token,
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  apiCall: string,
): ValidationIssue {
  const lineStart = source.lastIndexOf("\n", token.start - 1) + 1;
  return {
    line: source.slice(0, token.start).split("\n").length,
    column: token.start - lineStart,
    severity,
    code,
    message,
    apiCall,
    requiredComponents: [],
    availableComponents: [],
  };
}
