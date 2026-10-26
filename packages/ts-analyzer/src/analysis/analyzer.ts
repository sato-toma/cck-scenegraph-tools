import {
  SceneGraph,
  AnalysisResult,
  ValidationIssue,
  GameObject,
} from "../domain/types";
import * as fs from "fs";
import { SceneGraphParser } from "../sceneGraph/sceneGraphParser";
import { TypeScriptCodeParser } from "./typeScriptParser";
import { ConstraintValidator } from "../validation/constraintValidator";
import { ClusterScriptDefinitions } from "../rules/clusterScriptDefinitions";
import { ComponentRequirementExtractor } from "./componentRequirements/extractor";
import { ComponentRequirementValidator } from "./componentRequirements/validator";
import { SetStateCompatArgumentValidator } from "./setStateCompatArgumentValidator";
import {
  summarizeComponentRequirements,
} from "./componentRequirements/summary";
import {
  CallbackContextAnalyzer,
  CallbackContextStatus,
} from "./callbackContextAnalyzer";
import * as path from "path";
import { AnalysisReportFormatter } from "../reporting/analysisReportFormatter";
import {
  ComponentChangePlan,
  createComponentChangePlan,
} from "./componentChangePlan";
import { formatComponentChangePlan } from "../reporting/componentChangePlanFormatter";

export interface ClusterScriptAnalyzerOptions {
  strictOptionalLookups?: boolean;
}

/**
 * 統合的なTypeScript静的解析エンジン
 * SceneGraph.tomlとTypeScriptコードを組み合わせて、
 * コンポーネント制約の違反を検出
 */
export class ClusterScriptAnalyzer {
  private sceneGraph: SceneGraph;
  private sceneGraphPath: string;
  private reportFormatter: AnalysisReportFormatter;
  private options: ClusterScriptAnalyzerOptions;

  constructor(
    sceneGraphPath: string,
    options: ClusterScriptAnalyzerOptions = {},
  ) {
    this.sceneGraphPath = sceneGraphPath;
    this.sceneGraph = SceneGraphParser.parseFile(sceneGraphPath);
    this.reportFormatter = new AnalysisReportFormatter(this.sceneGraph);
    this.options = options;
  }

  private getCandidateGameObjects(tsFilePath: string = ""): GameObject[] {
    const matchingGameObjects = SceneGraphParser.findGameObjectsForSourceFile(
      this.sceneGraphPath,
      this.sceneGraph,
      tsFilePath,
    );
    return matchingGameObjects.length === 1 ? matchingGameObjects : [];
  }

  analyzeTypeScriptFile(tsFilePath: string = ""): AnalysisResult {
    const resolvedTsFilePath = this.resolveTypeScriptFile(tsFilePath);
    const sourceContent = fs.readFileSync(resolvedTsFilePath, "utf-8");
    const apiCalls = TypeScriptCodeParser.extractApiCallsFromString(sourceContent);
    const issues: ValidationIssue[] =
      SetStateCompatArgumentValidator.validate(sourceContent);
    const callbackContexts = new Map<
      string,
      Map<string, CallbackContextStatus>
    >();

    // 各APIコールについてチェック
    for (const call of apiCalls) {
      const method = ClusterScriptDefinitions.getMethodDefinition(call.methodName);
      if (!method) {
        continue;
      }

      if (method.requiredCallbackContext || method.requiresCallbackContext) {
        const contextKey = `${method.name}:${method.requiredCallbackContext ?? "any"}`;
        let methodContexts = callbackContexts.get(contextKey);
        if (!methodContexts) {
          methodContexts = CallbackContextAnalyzer.analyze(
            sourceContent,
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

      const constraints = method.requiredComponents;
      if (constraints.length === 0) {
        continue;
      }

      const candidateGameObjects =
        this.getCandidateGameObjects(resolvedTsFilePath);
      const gameObject = candidateGameObjects[0];
      if (!gameObject) {
        continue;
      }

      // 制約を検証
      const validation = ConstraintValidator.validateGameObject(
        gameObject,
        constraints,
        this.sceneGraph,
      );

      if (!validation.isValid) {
        const requiredComponents = constraints
          .filter((c) => c.requirement === "required")
          .map((c) => ConstraintValidator.formatComponentType(c.componentType));

        issues.push({
          line: call.line,
          column: call.column,
          severity: "error",
          code: "MISSING_COMPONENT",
          message: `Method '${call.methodName}' requires components: ${requiredComponents.join(", ")}`,
          apiCall: call.methodName,
          requiredComponents: requiredComponents,
          availableComponents: SceneGraphParser.getEnabledComponentsInHierarchy(
            this.sceneGraph,
            gameObject,
          ).map((c) => c.type),
        });
      }
    }

    const invalidStateMutations =
      TypeScriptCodeParser.extractInvalidStateMutations(resolvedTsFilePath);

    for (const invalidMutation of invalidStateMutations) {
      issues.push({
        line: invalidMutation.line,
        column: invalidMutation.column,
        severity: "error",
        code: "INVALID_STATE_MUTATION",
        message: `Directly mutating $.state.${invalidMutation.propertyName} with property assignment or array/object mutating methods does not update state. Use a temporary variable, modify it, and reassign it back to $.state.${invalidMutation.propertyName}.`,
        apiCall: `$.state.${invalidMutation.propertyName}.push`,
        requiredComponents: [],
        availableComponents: [],
      });
    }

    const extractedComponentRequests =
      ComponentRequirementExtractor.extractFromFile(resolvedTsFilePath);
    const componentRequests = ComponentRequirementValidator.validate(
      extractedComponentRequests,
      this.sceneGraphPath,
      this.sceneGraph,
      resolvedTsFilePath,
    ).map((request) =>
      request.kind === "optional-lookup" &&
      request.verificationStatus === "missing" &&
      this.options.strictOptionalLookups
        ? { ...request, severity: "error" as const }
        : request,
    );
    const componentRequestCounts =
      summarizeComponentRequirements(componentRequests);
    const strictOptionalLookupErrorCount = componentRequests.filter(
      (request) => request.severity === "error",
    ).length;

    return {
      filePath: resolvedTsFilePath,
      issues,
      componentRequests,
      summary: {
        totalIssues: issues.length + strictOptionalLookupErrorCount,
        errorCount:
          issues.filter((i) => i.severity === "error").length +
          strictOptionalLookupErrorCount,
        warningCount: issues.filter((i) => i.severity === "warning").length,
        componentRequestCounts,
      },
    };
  }

  private resolveTypeScriptFile(tsFilePath: string): string {
    if (tsFilePath && fs.existsSync(tsFilePath)) {
      return tsFilePath;
    }

    const scriptableSources = SceneGraphParser.getScriptableItemSourcePaths(
      this.sceneGraphPath,
      this.sceneGraph,
    );

    for (const scriptableSource of scriptableSources) {
      if (fs.existsSync(scriptableSource)) {
        return scriptableSource;
      }
    }

    return tsFilePath;
  }

  getScriptableItemSourceFiles(): string[] {
    return SceneGraphParser.getScriptableItemSourcePaths(
      this.sceneGraphPath,
      this.sceneGraph,
    );
  }

  analyzeAllScriptableItemFiles(): Map<string, AnalysisResult> {
    const results = new Map<string, AnalysisResult>();

    for (const sourceFile of this.getScriptableItemSourceFiles()) {
      results.set(sourceFile, this.analyzeTypeScriptFile(sourceFile));
    }

    return results;
  }

  /**
   * 複数のTypeScriptファイルを解析
   */
  analyzeMultipleFiles(tsFilePaths: string[]): Map<string, AnalysisResult> {
    const results = new Map<string, AnalysisResult>();

    for (const filePath of tsFilePaths) {
      results.set(filePath, this.analyzeTypeScriptFile(filePath));
    }

    return results;
  }

  /**
   * 全体的な解析レポートを生成
   */
  generateReport(results: Map<string, AnalysisResult>): string {
    return this.reportFormatter.generateReport(results);
  }

  generateComponentRequirementReport(result: AnalysisResult): string {
    return this.reportFormatter.generateComponentRequirementReport(result);
  }

  /**
   * SceneGraphの構造を可視化してレポート
   */
  generateSceneGraphReport(): string {
    return this.reportFormatter.generateSceneGraphReport();
  }

  /**
   * ClusterScript APIのカバレッジレポート
   */
  generateApiCoverageReport(tsFilePath: string): string {
    return this.reportFormatter.generateApiCoverageReport(tsFilePath);
  }

  /**
   * 推奨コンポーネント設定を生成
   */
  generateRecommendedComponents(tsFilePath: string): string {
    return this.reportFormatter.generateRecommendedComponents(tsFilePath);
  }

  createComponentChangePlan(
    results: AnalysisResult[],
    scenePath: string,
  ): ComponentChangePlan {
    return createComponentChangePlan(
      this.sceneGraph,
      results,
      scenePath,
      this.sceneGraphPath,
    );
  }

  generateComponentChangePlanReport(
    results: AnalysisResult[],
    scenePath: string,
  ): string {
    return formatComponentChangePlan(
      this.createComponentChangePlan(results, scenePath),
    );
  }

  /**
   * SceneGraphを取得
   */
  getSceneGraph(): SceneGraph {
    return this.sceneGraph;
  }
}
