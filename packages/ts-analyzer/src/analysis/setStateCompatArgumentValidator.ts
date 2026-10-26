import { ValidationIssue } from "../domain/types";

interface Token {
  text: string;
  start: number;
  end: number;
}

interface StringArgument {
  token: Token;
  value: string | undefined;
}

const validTargets = new Set(["this", "owner"]);
const tokenPattern =
  /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|./g;

export class SetStateCompatArgumentValidator {
  static validate(source: string): ValidationIssue[] {
    const tokens = this.tokenize(source);
    const issues: ValidationIssue[] = [];

    const addWarning = (token: Token, message: string) => {
      const lineStart = source.lastIndexOf("\n", token.start - 1) + 1;
      issues.push({
        line: source.slice(0, token.start).split("\n").length,
        column: token.start - lineStart,
        severity: "warning",
        code: "INVALID_API_ARGUMENT",
        message,
        apiCall: "setStateCompat",
        requiredComponents: [],
        availableComponents: [],
      });
    };

    for (let index = 0; index + 3 < tokens.length; index += 1) {
      if (
        tokens[index]?.text !== "$" ||
        tokens[index + 1]?.text !== "." ||
        tokens[index + 2]?.text !== "setStateCompat" ||
        tokens[index + 3]?.text !== "("
      ) {
        continue;
      }

      const args = this.getArguments(tokens, index + 3);
      if (!args) {
        continue;
      }

      const target = this.getStringArgument(args[0]);
      if (target?.value !== undefined && !validTargets.has(target.value)) {
        addWarning(
          target.token,
          `setStateCompat target must be "this" or "owner"; received "${target.value}".`,
        );
      }

      const value = this.getStringArgument(args[2]);
      if (value) {
        addWarning(
          value.token,
          "setStateCompat value does not support strings; use a number, boolean, Vector2, or Vector3.",
        );
      }
    }

    return issues;
  }

  private static tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    for (const match of source.matchAll(tokenPattern)) {
      const text = match[0];
      if (/^(?:\/\/|\/\*)/.test(text) || /^\s+$/.test(text)) {
        continue;
      }
      const start = match.index;
      tokens.push({ text, start, end: start + text.length });
    }
    return tokens;
  }

  private static getArguments(
    tokens: Token[],
    openParenIndex: number,
  ): Token[][] | undefined {
    const closingDelimiters: string[] = [];
    const args: Token[][] = [];
    let argumentStart = openParenIndex + 1;

    for (let index = argumentStart; index < tokens.length; index += 1) {
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
        args.push(tokens.slice(argumentStart, index));
        return args;
      } else if (text === "," && closingDelimiters.length === 0) {
        args.push(tokens.slice(argumentStart, index));
        argumentStart = index + 1;
      }
    }

    return undefined;
  }

  private static getStringArgument(
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
      const rawValue = token.text.slice(1, -1);
      return {
        token,
        value: rawValue.includes("\\") ? undefined : rawValue,
      };
    }

    if (quote === "`" && token.text[token.text.length - 1] === "`") {
      const rawValue = token.text.slice(1, -1);
      return {
        token,
        value:
          rawValue.includes("\\") || rawValue.includes("${")
            ? undefined
            : rawValue,
      };
    }

    return undefined;
  }
}
