import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { ClusterScriptDefinitions } from "./clusterScriptDefinitions";
import { TypeScriptCodeParser } from "./typeScriptParser";
import {
  ComponentRequirementOccurrence,
  ComponentRequirementRequest,
} from "./types";

interface ExtractedOccurrence {
  api: string;
  componentTypes: string[];
  componentMatch: ComponentRequirementRequest["componentMatch"];
  verificationStatus: ComponentRequirementRequest["verificationStatus"];
  occurrence: ComponentRequirementOccurrence;
}

export class ComponentRequirementExtractor {
  static extractFromFile(filePath: string): ComponentRequirementRequest[] {
    return this.extractFromString(fs.readFileSync(filePath, "utf-8"), filePath);
  }

  static extractFromString(
    content: string,
    filePath = "<memory>",
  ): ComponentRequirementRequest[] {
    const lines = content.split("\n");
    const extracted: ExtractedOccurrence[] = [];

    for (const call of TypeScriptCodeParser.extractApiCallsFromString(content)) {
      const constraints = call.fullExpression.endsWith("(")
        ? ClusterScriptDefinitions.getMethodConstraints(call.methodName)
        : ClusterScriptDefinitions.getPropertyConstraints(call.methodName);

      for (const constraint of constraints) {
        if (constraint.requirement !== "required") {
          continue;
        }

        const componentTypes = Array.isArray(constraint.componentType)
          ? [...new Set(constraint.componentType)].sort()
          : [constraint.componentType];
        const condition = this.extractCondition(
          lines,
          call.line - 1,
          call.column,
        );

        extracted.push({
          api: `$.${call.methodName}`,
          componentTypes,
          componentMatch: componentTypes.length > 1 ? "any" : "all",
          verificationStatus: "unverified",
          occurrence: {
            source: { filePath, line: call.line, column: call.column },
            condition,
            evidence: `ClusterScript API constraint for $.${call.methodName}`,
            confidence: "high",
          },
        });
      }
    }

    const unityComponentCallPattern =
      /\$\s*\.\s*getUnityComponent\s*\(([\s\S]*?)\)/g;
    let unityComponentCall: RegExpExecArray | null;

    while (
      (unityComponentCall = unityComponentCallPattern.exec(content)) !== null
    ) {
      const argument = unityComponentCall[1]!.trim();
      const literalMatch = argument.match(/^(['"])([^'"]+)\1$/);
      const source = this.getSourcePosition(content, unityComponentCall.index);
      const componentTypes = literalMatch ? [literalMatch[2]!] : [];
      const condition = this.extractCondition(
        lines,
        source.line - 1,
        source.column,
      );

      extracted.push({
        api: "$.getUnityComponent",
        componentTypes,
        componentMatch: literalMatch ? "all" : "unknown",
        verificationStatus: literalMatch ? "unverified" : "unsupported",
        occurrence: {
          source: { filePath, ...source },
          condition,
          evidence: literalMatch
            ? `Literal component type passed to $.getUnityComponent: ${literalMatch[2]}`
            : "Component type argument is not a supported string literal",
          confidence: literalMatch ? "high" : "low",
        },
      });
    }

    return this.deduplicate(extracted);
  }

  private static deduplicate(
    extracted: ExtractedOccurrence[],
  ): ComponentRequirementRequest[] {
    const requests = new Map<string, ComponentRequirementRequest>();

    for (const item of extracted) {
      const key = JSON.stringify([
        item.api,
        item.componentTypes,
        item.componentMatch,
        item.verificationStatus,
      ]);
      let request = requests.get(key);

      if (!request) {
        const id = `cr-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
        request = {
          id,
          api: item.api,
          componentTypes: item.componentTypes,
          componentMatch: item.componentMatch,
          target: {
            kind: "current-scriptable-item",
            resolution: "unresolved",
          },
          verificationStatus: item.verificationStatus,
          validation: {
            presentComponentTypes: [],
            missingComponentTypes: [],
            matchedComponents: [],
          },
          occurrences: [],
        };
        requests.set(key, request);
      }

      request.occurrences.push(item.occurrence);
    }

    return [...requests.values()];
  }

  private static extractCondition(
    lines: string[],
    lineIndex: number,
    column: number,
  ): ComponentRequirementOccurrence["condition"] {
    const prefix = lines[lineIndex]?.slice(0, column) ?? "";
    const inlineCondition = prefix.match(/\bif\s*\(([^()]*)\)\s*\{?\s*$/);
    if (inlineCondition) {
      return { kind: "conditional", expression: inlineCondition[1]!.trim() };
    }

    const activeConditions: string[] = [];
    let uncertainCondition = false;
    let activeUnsupportedCondition = false;
    for (
      let candidateIndex = lineIndex - 1;
      candidateIndex >= 0;
      candidateIndex--
    ) {
      const candidateLine = lines[candidateIndex]!;
      const candidate = lines[candidateIndex]!.match(
        /^\s*if\s*\(([^()]*)\)\s*\{\s*(?:\/\/.*)?$/,
      );
      if (
        !candidate &&
        !/\b(?:if|switch|while|for|catch)\s*\(/.test(candidateLine)
      ) {
        continue;
      }

      let braceDepth = candidate ? 1 : 0;
      for (
        let currentIndex = candidate ? candidateIndex + 1 : candidateIndex;
        currentIndex <= lineIndex;
        currentIndex++
      ) {
        const currentLine =
          currentIndex === lineIndex
            ? lines[currentIndex]!.slice(0, column)
            : lines[currentIndex]!;
        braceDepth += this.countBraces(currentLine);
      }

      if (
        !candidate &&
        /\bif\s*\(/.test(candidateLine) &&
        !candidateLine.includes("{")
      ) {
        const bodyText = [
          candidateLine,
          ...lines.slice(candidateIndex + 1, lineIndex),
          prefix,
        ].join("\n");
        if (!bodyText.includes(";")) {
          activeUnsupportedCondition = true;
        }
      }

      if (braceDepth > 0) {
        if (!candidate) {
          activeUnsupportedCondition = true;
          continue;
        }

        const conditionText = [
          ...lines.slice(candidateIndex + 1, lineIndex),
          prefix,
        ].join("\n");
        if (
          /\belse\b|\b(?:switch|while|for|catch)\b|\?|&&|\|\|/.test(
            conditionText,
          )
        ) {
          uncertainCondition = true;
        } else {
          activeConditions.push(candidate[1]!.trim());
        }
      }
    }

    if (activeConditions.length > 0 && !uncertainCondition) {
      return {
        kind: "conditional",
        expression: activeConditions.reverse().join(" && "),
      };
    }

    if (
      uncertainCondition ||
      activeUnsupportedCondition ||
      /\?|\|\||&&/.test(prefix)
    ) {
      return { kind: "unknown" };
    }

    return { kind: "unconditional" };
  }

  private static countBraces(line: string): number {
    const withoutStrings = line.replace(
      /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,
      "",
    );
    const withoutLineComment = withoutStrings.replace(/\/\/.*$/, "");
    return (
      (withoutLineComment.match(/\{/g)?.length ?? 0) -
      (withoutLineComment.match(/\}/g)?.length ?? 0)
    );
  }

  private static getSourcePosition(
    content: string,
    offset: number,
  ): { line: number; column: number } {
    const precedingText = content.slice(0, offset);
    const lastNewline = precedingText.lastIndexOf("\n");
    return {
      line: precedingText.split("\n").length,
      column: offset - lastNewline - 1,
    };
  }
}
