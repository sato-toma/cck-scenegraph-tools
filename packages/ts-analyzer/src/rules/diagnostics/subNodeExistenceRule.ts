import { ValidationIssue, SceneGraph } from "../../domain/types";
import { SceneGraphParser } from "../../sceneGraph/sceneGraphParser";
import {
  Token,
  createSourceIssue,
  getCallArguments,
  getStringArgument,
  tokenizeSource,
} from "../../analysis/sourceTokens";

export class SubNodeExistenceValidator {
  static validate(
    source: string,
    sceneGraphPath: string,
    sceneGraph: SceneGraph,
    sourceFilePath: string,
  ): ValidationIssue[] {
    const tokens = tokenizeSource(source);
    const targets = SceneGraphParser.findGameObjectsForScriptableItemSourceFile(
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

      const args = getCallArguments(tokens, index + 3);
      const nameArgument =
        args?.length === 1 ? getStringArgument(args[0]) : undefined;

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
    return createSourceIssue(source, token, "warning", code, message, "subNode");
  }
}
