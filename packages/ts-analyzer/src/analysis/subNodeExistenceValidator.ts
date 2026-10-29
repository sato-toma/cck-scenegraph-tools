import { ValidationIssue, SceneGraph } from "../domain/types";
import { SceneGraphParser } from "../sceneGraph/sceneGraphParser";

interface Token {
  text: string;
  start: number;
}

interface StringArgument {
  token: Token;
  value: string | undefined;
}

const tokenPattern =
  /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|./g;

export class SubNodeExistenceValidator {
  static validate(
    source: string,
    sceneGraphPath: string,
    sceneGraph: SceneGraph,
    sourceFilePath: string,
  ): ValidationIssue[] {
    const tokens = this.tokenize(source);
    const targets = SceneGraphParser.findGameObjectsForSourceFile(
      sceneGraphPath,
      sceneGraph,
      sourceFilePath,
    );
    const issues: ValidationIssue[] = [];

    for (let index = 0; index + 3 < tokens.length; index += 1) {
      if (
        tokens[index]?.text !== "$" ||
        tokens[index + 1]?.text !== "." ||
        tokens[index + 2]?.text !== "subNode" ||
        tokens[index + 3]?.text !== "("
      ) {
        continue;
      }

      const args = this.getArguments(tokens, index + 3);
      const nameArgument =
        args?.length === 1 ? this.getStringArgument(args[0]) : undefined;

      if (
        !nameArgument ||
        nameArgument.value === undefined ||
        targets.length !== 1
      ) {
        const token = nameArgument?.token ?? tokens[index + 3]!;
        issues.push(
          this.createIssue(
            source,
            token,
            "UNVERIFIED_SUBNODE_LOOKUP",
            nameArgument?.value !== undefined
              ? "Could not verify subNode because this script is not mapped to exactly one ScriptableItem."
              : "Could not verify subNode; subNodeName must be a supported string literal.",
          ),
        );
        continue;
      }

      const descendants = SceneGraphParser.getGameObjectDescendants(
        sceneGraph,
        targets[0]!,
      );
      if (!descendants.some((gameObject) => gameObject.name === nameArgument.value)) {
        issues.push(
          this.createIssue(
            source,
            nameArgument.token,
            "MISSING_SUBNODE",
            `No child GameObject named "${nameArgument.value}" was found under ScriptableItem "${targets[0]!.path}".`,
          ),
        );
      }
    }

    return issues;
  }

  private static createIssue(
    source: string,
    token: Token,
    code: string,
    message: string,
  ): ValidationIssue {
    const lineStart = source.lastIndexOf("\n", token.start - 1) + 1;
    return {
      line: source.slice(0, token.start).split("\n").length,
      column: token.start - lineStart,
      severity: "warning",
      code,
      message,
      apiCall: "subNode",
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
      const value = token.text.slice(1, -1);
      return {
        token,
        value: value.includes("\\") ? undefined : value,
      };
    }

    return undefined;
  }
}
