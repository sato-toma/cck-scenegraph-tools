import {
  SceneGraph,
  AnalysisResult,
  ValidationIssue,
  GameObject,
} from "./types";
import * as fs from "fs";
import { SceneGraphParser } from "./sceneGraphParser";
import { TypeScriptCodeParser } from "./typeScriptParser";
import { ConstraintValidator } from "./constraintValidator";
import { ClusterScriptDefinitions } from "./clusterScriptDefinitions";
import { ComponentRequirementExtractor } from "./componentRequirementExtractor";
import { ComponentRequirementValidator } from "./componentRequirementValidator";
import * as path from "path";

const ANSI = {
  reset: "\u001b[0m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  green: "\u001b[32m",
  bold: "\u001b[1m",
};

function colorize(text: string, color: string): string {
  if (!process.stdout.isTTY || process.env.NO_COLOR !== undefined) {
    return text;
  }

  return `${color}${text}${ANSI.reset}`;
}

/**
 * 統合的なTypeScript静的解析エンジン
 * SceneGraph.tomlとTypeScriptコードを組み合わせて、
 * コンポーネント制約の違反を検出
 */
export class ClusterScriptAnalyzer {
  private sceneGraph: SceneGraph;
  private sceneGraphPath: string;

  constructor(sceneGraphPath: string) {
    this.sceneGraphPath = sceneGraphPath;
    this.sceneGraph = SceneGraphParser.parseFile(sceneGraphPath);
  }

  private getCandidateGameObjects(tsFilePath: string = ""): GameObject[] {
    const specificGameObject = SceneGraphParser.findGameObjectForSourceFile(
      this.sceneGraphPath,
      this.sceneGraph,
      tsFilePath,
    );

    if (specificGameObject) {
      return [specificGameObject];
    }

    const scriptableObjects = SceneGraphParser.getGameObjectsWithScriptableItem(
      this.sceneGraph,
    );

    return scriptableObjects.length > 0
      ? scriptableObjects
      : this.sceneGraph.gameObjects;
  }

  analyzeTypeScriptFile(tsFilePath: string = ""): AnalysisResult {
    const resolvedTsFilePath = this.resolveTypeScriptFile(tsFilePath);
    const apiCalls = TypeScriptCodeParser.extractApiCalls(resolvedTsFilePath);
    const issues: ValidationIssue[] = [];

    // 各APIコールについてチェック
    for (const call of apiCalls) {
      const constraints = ClusterScriptDefinitions.getMethodConstraints(
        call.methodName,
      );

      // 制約がない場合はスキップ
      if (constraints.length === 0) {
        continue;
      }

      const candidateGameObjects =
        this.getCandidateGameObjects(resolvedTsFilePath);
      const fallbackGameObject =
        candidateGameObjects[0] ?? this.sceneGraph.gameObjects[0];

      if (!fallbackGameObject) {
        continue;
      }

      const matchingGameObject = candidateGameObjects.find((candidate) => {
        const validation = ConstraintValidator.validateGameObject(
          candidate,
          constraints,
          this.sceneGraph,
        );
        return validation.isValid;
      });

      const gameObject = matchingGameObject ?? fallbackGameObject;

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
    );

    return {
      filePath: resolvedTsFilePath,
      issues,
      componentRequests,
      summary: {
        totalIssues: issues.length,
        errorCount: issues.filter((i) => i.severity === "error").length,
        warningCount: issues.filter((i) => i.severity === "warning").length,
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
    const lines: string[] = [];

    lines.push("=== ClusterScript Component Constraint Analysis Report ===\n");
    lines.push(`Project: ${this.sceneGraph.project}`);
    lines.push(`Total GameObjects: ${this.sceneGraph.gameObjects.length}\n`);

    let totalIssues = 0;
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const [filePath, result] of results) {
      if (result.issues.length > 0) {
        lines.push(`\n📄 File: ${filePath}`);
        lines.push(`   Issues: ${result.summary.totalIssues}`);
        lines.push(`   Errors: ${result.summary.errorCount}`);
        lines.push(`   Warnings: ${result.summary.warningCount}`);

        for (const issue of result.issues) {
          const severityColor =
            issue.severity === "error" ? ANSI.red : ANSI.yellow;
          const severityLabel = colorize(
            `[${issue.severity.toUpperCase()}]`,
            severityColor,
          );

          lines.push(`   ${severityLabel} Line ${issue.line}:${issue.column}`);
          lines.push(
            `     ${colorize("API:", severityColor)} ${colorize(issue.apiCall, severityColor)}`,
          );
          lines.push(
            `     ${colorize("Message:", severityColor)} ${colorize(issue.message, severityColor)}`,
          );
          lines.push(
            `     ${colorize("Required:", severityColor)} ${colorize(issue.requiredComponents.join(", "), severityColor)}`,
          );
          lines.push(
            `     ${colorize("Available:", severityColor)} ${colorize(issue.availableComponents.join(", ") || "none", severityColor)}`,
          );
        }

        totalIssues += result.summary.totalIssues;
        totalErrors += result.summary.errorCount;
        totalWarnings += result.summary.warningCount;
      }
    }

    lines.push(`\n${colorize("=== Summary ===", ANSI.bold)}`);
    lines.push(`Total Issues: ${totalIssues}`);
    lines.push(`${colorize("Total Errors", ANSI.red)}: ${totalErrors}`);
    lines.push(`${colorize("Total Warnings", ANSI.yellow)}: ${totalWarnings}`);

    if (totalIssues === 0) {
      lines.push(colorize("✅ No issues found!", ANSI.green));
    }

    return lines.join("\n");
  }

  /**
   * SceneGraphの構造を可視化してレポート
   */
  generateSceneGraphReport(): string {
    const lines: string[] = [];

    lines.push("=== Scene Graph Structure ===\n");
    lines.push(SceneGraphParser.visualizeHierarchy(this.sceneGraph));

    lines.push("\n=== Component Distribution ===");
    const distribution = SceneGraphParser.analyzeComponentDistribution(
      this.sceneGraph,
    );

    for (const [componentType, count] of distribution) {
      lines.push(`  ${componentType}: ${count}`);
    }

    return lines.join("\n");
  }

  /**
   * ClusterScript APIのカバレッジレポート
   */
  generateApiCoverageReport(tsFilePath: string): string {
    const lines: string[] = [];
    const content = require("fs").readFileSync(tsFilePath, "utf-8");
    const apiCalls = TypeScriptCodeParser.extractApiCalls(tsFilePath);

    const usedMethods = new Set(apiCalls.map((c) => c.methodName));
    const allMethods = ClusterScriptDefinitions.getAllMethodNames();

    lines.push("=== ClusterScript API Coverage ===\n");
    lines.push(`File: ${tsFilePath}`);
    lines.push(`Used APIs: ${usedMethods.size} / ${allMethods.length}`);
    lines.push(
      `Coverage: ${((usedMethods.size / allMethods.length) * 100).toFixed(1)}%\n`,
    );

    lines.push("Used Methods:");
    for (const method of Array.from(usedMethods).sort()) {
      lines.push(`  ✓ ${method}`);
    }

    lines.push("\nUnused Methods:");
    const unusedMethods = allMethods.filter((m) => !usedMethods.has(m));
    for (const method of unusedMethods.slice(0, 10)) {
      // 最初の10個のみ表示
      lines.push(`  - ${method}`);
    }

    if (unusedMethods.length > 10) {
      lines.push(`  ... and ${unusedMethods.length - 10} more`);
    }

    return lines.join("\n");
  }

  /**
   * 推奨コンポーネント設定を生成
   */
  generateRecommendedComponents(tsFilePath: string): string {
    const lines: string[] = [];
    const content = require("fs").readFileSync(tsFilePath, "utf-8");
    const apiCalls = TypeScriptCodeParser.extractApiCalls(tsFilePath);

    const requiredComponents = new Set<string>();

    for (const call of apiCalls) {
      const constraints = ClusterScriptDefinitions.getMethodConstraints(
        call.methodName,
      );

      for (const constraint of constraints) {
        if (constraint.requirement === "required") {
          requiredComponents.add(
            ConstraintValidator.formatComponentType(constraint.componentType),
          );
        }
      }
    }

    lines.push("=== Recommended Components ===\n");
    lines.push(`Based on API usage in: ${tsFilePath}\n`);
    lines.push("Required Components:");

    for (const component of Array.from(requiredComponents).sort()) {
      lines.push(`  ✓ ${component}`);
    }

    if (requiredComponents.size === 0) {
      lines.push("  (No required components)");
    }

    return lines.join("\n");
  }

  /**
   * SceneGraphを取得
   */
  getSceneGraph(): SceneGraph {
    return this.sceneGraph;
  }
}
