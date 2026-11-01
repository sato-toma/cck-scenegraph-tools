import {
  GameObject,
  ValidationIssue,
} from "../../domain/types";
import { SceneGraphParser } from "../../sceneGraph/sceneGraphParser";
import { ConstraintValidator } from "../../validation/constraintValidator";
import { ClusterScriptDefinitions } from "../clusterScriptDefinitions";
import {
  CallbackContextAnalyzer,
  CallbackContextStatus,
} from "../../analysis/callbackContextAnalyzer";
import {
  TopLevelApiCallAnalyzer,
  TopLevelApiCallStatus,
} from "../../analysis/topLevelApiCallAnalyzer";
import { TypeScriptCodeParser } from "../../analysis/typeScriptParser";
import { DiagnosticRule, DiagnosticRuleContext } from "./types";

function getCandidateGameObject(
  context: DiagnosticRuleContext,
): GameObject | undefined {
  const candidates = SceneGraphParser.findGameObjectsForSourceFile(
    context.sceneGraphPath,
    context.sceneGraph,
    context.sourceFilePath,
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

export const apiMethodRule: DiagnosticRule = {
  id: "api-method",
  analyze(context: DiagnosticRuleContext): ValidationIssue[] {
    const apiCalls = TypeScriptCodeParser.extractApiCallsFromString(
      context.source,
    );
    const issues: ValidationIssue[] = [];
    const callbackContexts = new Map<
      string,
      Map<string, CallbackContextStatus>
    >();
    const topLevelContexts = new Map<
      string,
      Map<string, TopLevelApiCallStatus>
    >();

    for (const call of apiCalls) {
      const method = ClusterScriptDefinitions.getMethodDefinition(
        call.methodName,
      );
      if (!method) {
        continue;
      }

      if (method.requiresTopLevelContext) {
        let methodContexts = topLevelContexts.get(method.name);
        if (!methodContexts) {
          methodContexts = TopLevelApiCallAnalyzer.analyze(
            context.source,
            method.name,
          );
          topLevelContexts.set(method.name, methodContexts);
        }

        const contextStatus = methodContexts.get(
          `${call.line}:${call.column}`,
        );
        if (contextStatus === "nested" || contextStatus === "unverified") {
          const isUnverified = contextStatus === "unverified";
          issues.push({
            line: call.line,
            column: call.column,
            severity: isUnverified ? "warning" : "error",
            code: isUnverified
              ? "UNVERIFIED_API_CONTEXT"
              : "INVALID_API_CONTEXT",
            message: isUnverified
              ? `Could not verify that '${call.methodName}' is a direct top-level statement.`
              : `Method '${call.methodName}' must be a direct top-level statement.`,
            apiCall: call.methodName,
            requiredComponents: [],
            availableComponents: [],
          });
        }
      }

      if (method.requiredCallbackContext || method.requiresCallbackContext) {
        const contextKey = `${method.name}:${method.requiredCallbackContext ?? "any"}`;
        let methodContexts = callbackContexts.get(contextKey);
        if (!methodContexts) {
          methodContexts = CallbackContextAnalyzer.analyze(
            context.source,
            method.name,
            method.requiredCallbackContext,
          );
          callbackContexts.set(contextKey, methodContexts);
        }

        const contextStatus = methodContexts.get(`${call.line}:${call.column}`);
        if (contextStatus === "outside" || contextStatus === "unverified") {
          const isUnverified = contextStatus === "unverified";
          const requiredContext = method.requiredCallbackContext
            ? "'$." + method.requiredCallbackContext + "'"
            : "a callback";
          const invalidContext = method.requiredCallbackContext
            ? `the callback registered with ${requiredContext}`
            : "a callback";
          issues.push({
            line: call.line,
            column: call.column,
            severity: isUnverified ? "warning" : "error",
            code: isUnverified
              ? "UNVERIFIED_API_CONTEXT"
              : "INVALID_API_CONTEXT",
            message: isUnverified
              ? `Could not verify that '${call.methodName}' is called directly inside ${requiredContext}.`
              : `Method '${call.methodName}' must be called inside ${invalidContext}.`,
            apiCall: call.methodName,
            requiredComponents: [],
            availableComponents: [],
          });
        }
      }

      if (method.requiredComponents.length === 0) {
        continue;
      }

      const gameObject = getCandidateGameObject(context);
      if (!gameObject) {
        continue;
      }

      const validation = ConstraintValidator.validateGameObject(
        gameObject,
        method.requiredComponents,
        context.sceneGraph,
      );
      if (validation.isValid) {
        continue;
      }

      const requiredComponents = method.requiredComponents
        .filter((constraint) => constraint.requirement === "required")
        .map((constraint) =>
          ConstraintValidator.formatComponentType(constraint.componentType),
        );
      issues.push({
        line: call.line,
        column: call.column,
        severity: "error",
        code: "MISSING_COMPONENT",
        message: `Method '${call.methodName}' requires components: ${requiredComponents.join(", ")}`,
        apiCall: call.methodName,
        requiredComponents,
        availableComponents: SceneGraphParser.getEnabledComponentsInHierarchy(
          context.sceneGraph,
          gameObject,
        ).map((component) => component.type),
      });
    }

    return issues;
  },
};
