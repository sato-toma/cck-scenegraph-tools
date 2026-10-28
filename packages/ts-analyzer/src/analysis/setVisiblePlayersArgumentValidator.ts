import { ValidationIssue } from "../domain/types";

interface Token {
  text: string;
  start: number;
}

const tokenPattern =
  /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\.\.\.|[A-Za-z_$][\w$]*|./g;

export class SetVisiblePlayersArgumentValidator {
  static validate(source: string): ValidationIssue[] {
    const tokens = this.tokenize(source);
    const issues: ValidationIssue[] = [];

    for (let index = 0; index + 3 < tokens.length; index += 1) {
      if (
        tokens[index]?.text !== "$" ||
        tokens[index + 1]?.text !== "." ||
        tokens[index + 2]?.text !== "setVisiblePlayers" ||
        tokens[index + 3]?.text !== "("
      ) {
        continue;
      }

      const args = this.getArguments(tokens, index + 3);
      const players = args?.[0];
      if (!players?.length) {
        continue;
      }

      const nullToken =
        players[0]?.text === "null" &&
        (players.length === 1 ||
          (players.length === 2 && players[1]?.text === "!"))
          ? players[0]
          : undefined;
      if (nullToken) {
        issues.push(
          this.createIssue(
            source,
            nullToken,
            "setVisiblePlayers does not accept null; pass an array of PlayerHandle values.",
          ),
        );
        continue;
      }

      const arrayLength = this.getArrayLiteralLength(players);
      if (arrayLength !== undefined && arrayLength > 64) {
        issues.push(
          this.createIssue(
            source,
            players[0]!,
            `setVisiblePlayers accepts at most 64 players; received ${arrayLength}.`,
          ),
        );
      }
    }

    return issues;
  }

  private static createIssue(
    source: string,
    token: Token,
    message: string,
  ): ValidationIssue {
    const lineStart = source.lastIndexOf("\n", token.start - 1) + 1;
    return {
      line: source.slice(0, token.start).split("\n").length,
      column: token.start - lineStart,
      severity: "warning",
      code: "INVALID_API_ARGUMENT",
      message,
      apiCall: "setVisiblePlayers",
      requiredComponents: [],
      availableComponents: [],
    };
  }

  private static tokenize(source: string): Token[] {
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

  private static getArrayLiteralLength(tokens: Token[]): number | undefined {
    if (tokens[0]?.text !== "[" || tokens[tokens.length - 1]?.text !== "]") {
      return undefined;
    }

    const closingDelimiters: string[] = [];
    let elementStart = 1;
    let separatorCount = 0;
    let hasSpreadElement = false;

    for (let index = 1; index < tokens.length - 1; index += 1) {
      const text = tokens[index]!.text;
      if (text === "(" || text === "[" || text === "{") {
        closingDelimiters.push(text === "(" ? ")" : text === "[" ? "]" : "}");
      } else if (
        (text === ")" || text === "]" || text === "}") &&
        closingDelimiters[closingDelimiters.length - 1] === text
      ) {
        closingDelimiters.pop();
      } else if (closingDelimiters.length === 0 && text === ",") {
        separatorCount += 1;
        elementStart = index + 1;
      } else if (
        closingDelimiters.length === 0 &&
        text === "..." &&
        index === elementStart
      ) {
        hasSpreadElement = true;
      }
    }

    if (hasSpreadElement) {
      return undefined;
    }

    const hasFinalElement = elementStart < tokens.length - 1;
    return separatorCount + (hasFinalElement ? 1 : 0);
  }
}
