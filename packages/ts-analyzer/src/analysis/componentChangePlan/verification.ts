import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { ClusterScriptAnalyzer } from "../analyzer";
import type {
  AnalysisResult,
  Component,
  ComponentPropertyValue,
  SceneGraph,
} from "../../domain/types";
import { SceneGraphParser } from "../../sceneGraph/sceneGraphParser";
import { getApprovedComponentChanges } from "./approval";
import {
  applyApprovedComponentChangePlanViaUnityCliMcp,
  type UnityCliMcpApplicationOptions,
} from "./unityCliMcp";
import type {
  ComponentChangeApplicationRecord,
} from "./application";
import { ComponentChangeApplicationError } from "./application";
import type { ComponentChangePlan } from "./index";

export type ComponentChangeVerificationStatus =
  | "success"
  | "failure"
  | "unverified";

export type ComponentChangeCheckStatus = "verified" | "failed" | "unverified";

export interface ComponentChangeVerificationAction {
  actionId: string;
  target: {
    globalObjectId: string;
    hierarchyPath: string;
  };
  componentType: string;
  componentStatus: ComponentChangeCheckStatus;
  enabledStatus: ComponentChangeCheckStatus;
  settingsStatus: ComponentChangeCheckStatus;
  analysisStatus: ComponentChangeCheckStatus;
  messages: string[];
}

export interface ComponentChangeVerificationReport {
  status: ComponentChangeVerificationStatus;
  sceneGraphPath: string;
  logPath: string;
  applicationRecords: ComponentChangeApplicationRecord[];
  applicationError?: string;
  exportError?: string;
  actions: ComponentChangeVerificationAction[];
  analysisResults: Array<{
    filePath: string;
    issues: AnalysisResult["issues"];
    componentRequestCounts: AnalysisResult["summary"]["componentRequestCounts"];
  }>;
  runtimeBehavior: "not-verified";
}

export interface ComponentChangeVerificationOptions
  extends UnityCliMcpApplicationOptions {
  projectPath: string;
  sceneGraphPath?: string;
  sourcePaths?: string[];
  unityPath?: string;
  logPath?: string;
}

export interface ComponentChangeVerificationDependencies {
  exportSceneGraph?: (
    args: {
      unityPath: string;
      projectPath: string;
      scenePath: string;
      outputPath: string;
      logPath: string;
    },
  ) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveUnityPath(unityPath?: string): string {
  const resolved = unityPath ?? process.env.UNITY_PATH ?? "Unity";
  if (resolved.trim().length === 0) {
    throw new Error("A Unity Editor executable path is required.");
  }
  return resolved;
}

async function exportSceneGraphWithUnity(args: {
  unityPath: string;
  projectPath: string;
  scenePath: string;
  outputPath: string;
  logPath: string;
}): Promise<void> {
  const projectPath = path.resolve(args.projectPath);
  if (!existsSync(projectPath)) {
    throw new Error(`Unity project not found: ${projectPath}`);
  }

  mkdirSync(path.dirname(args.outputPath), { recursive: true });
  mkdirSync(path.dirname(args.logPath), { recursive: true });
  const temporaryOutputPath = path.join(
    path.dirname(args.outputPath),
    `.${path.basename(args.outputPath)}.${randomUUID()}.tmp`,
  );
  const unityArguments = [
    "-batchmode",
    "-nographics",
    "-quit",
    "-projectPath",
    projectPath,
    "-executeMethod",
    "UnitySemanticGraph.Editor.Exporter.SelectiveComponentTomlExporter.ExportGraphToToml",
    "-scenePath",
    args.scenePath,
    "-outputPath",
    temporaryOutputPath,
    "-logFile",
    args.logPath,
  ];

  try {
    const isPowerShellScript = path.extname(args.unityPath).toLowerCase() === ".ps1";
    const command = isPowerShellScript
      ? process.platform === "win32"
        ? "powershell.exe"
        : "pwsh"
      : args.unityPath;
    const commandArguments = isPowerShellScript
      ? ["-NoProfile", "-File", args.unityPath, ...unityArguments]
      : unityArguments;
    const result = spawnSync(command, commandArguments, { stdio: "inherit" });
    if (result.error) {
      throw new Error(`Failed to start Unity: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(
        `Unity export failed with exit code ${String(result.status)}; see ${args.logPath}`,
      );
    }
    if (
      !existsSync(temporaryOutputPath) ||
      statSync(temporaryOutputPath).size === 0
    ) {
      throw new Error(
        `Unity did not create a non-empty SceneGraph file: ${temporaryOutputPath}`,
      );
    }

    SceneGraphParser.parseFile(temporaryOutputPath);
    renameSync(temporaryOutputPath, args.outputPath);
  } finally {
    if (existsSync(temporaryOutputPath)) {
      unlinkSync(temporaryOutputPath);
    }
  }
}

function getSourcePaths(
  plan: ComponentChangePlan,
  sourcePaths?: string[],
): string[] {
  if (sourcePaths) {
    return [...new Set(sourcePaths.map((filePath) => path.resolve(filePath)))];
  }
  return [
    ...new Set(
      plan.actions.flatMap((action) =>
        action.evidence.map(({ source }) => path.resolve(source.filePath)),
      ),
    ),
  ];
}

function findProperty(
  component: Component,
  propertyName: string,
): { found: boolean; value: ComponentPropertyValue | undefined } {
  const properties = component.properties;
  if (!properties) {
    return { found: false, value: undefined };
  }
  if (Object.prototype.hasOwnProperty.call(properties, propertyName)) {
    return { found: true, value: properties[propertyName] };
  }
  const matchingNames = Object.keys(properties).filter(
    (name) => name.toLowerCase() === propertyName.toLowerCase(),
  );
  if (matchingNames.length !== 1) {
    return { found: false, value: undefined };
  }
  return { found: true, value: properties[matchingNames[0]!] };
}

function requestMatchesAction(
  request: AnalysisResult["componentRequests"][number],
  plan: ComponentChangePlan,
  actionIndex: number,
): boolean {
  const action = plan.actions[actionIndex];
  if (
    !action ||
    !action.apis.includes(request.api) ||
    !request.componentTypes.includes(action.componentType) ||
    request.target.gameObjectId !== action.target.gameObjectId ||
    request.target.gameObjectPath !== action.target.gameObjectPath
  ) {
    return false;
  }
  return request.occurrences.some((occurrence) =>
    action.evidence.some(
      (evidence) =>
        path.basename(occurrence.source.filePath) ===
          path.basename(evidence.source.filePath) &&
        occurrence.source.line === evidence.source.line &&
        occurrence.source.column === evidence.source.column,
    ),
  );
}

function collectActions(
  plan: ComponentChangePlan,
  sceneGraph: SceneGraph,
  analysisResults: AnalysisResult[],
): ComponentChangeVerificationAction[] {
  return plan.actions.map((action, actionIndex) => {
    const messages: string[] = [];
    const result: ComponentChangeVerificationAction = {
      actionId: action.id,
      target: {
        globalObjectId: action.target.gameObjectId,
        hierarchyPath: action.target.gameObjectPath,
      },
      componentType: action.componentType,
      componentStatus: "unverified",
      enabledStatus: "unverified",
      settingsStatus: "verified",
      analysisStatus: "unverified",
      messages,
    };

    const targets = sceneGraph.gameObjects.filter(
      (gameObject) =>
        gameObject.id === action.target.gameObjectId &&
        gameObject.path === action.target.gameObjectPath,
    );
    if (targets.length !== 1) {
      result.componentStatus = "failed";
      result.enabledStatus = "failed";
      messages.push(
        `Expected one exported target matching its GlobalObjectId and path; found ${targets.length}.`,
      );
    } else {
      const components = targets[0]!.components.filter(
        (component) => component.type === action.componentType,
      );
      if (components.length === 0) {
        result.componentStatus = "failed";
        result.enabledStatus = "failed";
        messages.push("The exported target does not contain the component.");
      } else {
        result.componentStatus = "verified";
        const enabledComponents = components.filter(
          (component) => component.enabled,
        );
        if (enabledComponents.length === 0) {
          result.enabledStatus = "failed";
          messages.push("The exported component is disabled.");
        } else {
          result.enabledStatus = "verified";
          for (const [propertyName, expectedValue] of Object.entries(
            action.settings.values,
          )) {
            const property = enabledComponents
              .map((component) => findProperty(component, propertyName))
              .find((candidate) => candidate.found);
            if (!property) {
              result.settingsStatus = "unverified";
              messages.push(
                `The exporter did not expose the requested property "${propertyName}".`,
              );
            } else if (!isDeepStrictEqual(property.value, expectedValue)) {
              result.settingsStatus = "failed";
              messages.push(
                `Exported property "${propertyName}" does not match the approved value.`,
              );
            }
          }
        }
      }
    }

    const matchingRequests = analysisResults.flatMap((analysisResult) =>
      analysisResult.componentRequests.filter((request) =>
        requestMatchesAction(request, plan, actionIndex),
      ),
    );
    if (matchingRequests.some((request) => request.verificationStatus === "missing")) {
      result.analysisStatus = "failed";
      messages.push("Static analysis still reports the requirement as missing.");
    } else if (
      matchingRequests.some(
        (request) => request.verificationStatus === "satisfied",
      )
    ) {
      result.analysisStatus = "verified";
    } else {
      result.analysisStatus = "unverified";
      messages.push(
        "Static analysis did not produce a matching, satisfied requirement.",
      );
    }

    return result;
  });
}

function overallStatus(
  actions: ComponentChangeVerificationAction[],
  applicationError: string | undefined,
  exportError: string | undefined,
  hasStaticAnalysisErrors: boolean,
): ComponentChangeVerificationStatus {
  if (
    applicationError ||
    exportError ||
    hasStaticAnalysisErrors ||
    actions.some((action) =>
      [
        action.componentStatus,
        action.enabledStatus,
        action.settingsStatus,
        action.analysisStatus,
      ].includes("failed"),
    )
  ) {
    return "failure";
  }
  if (
    actions.length === 0 ||
    actions.some((action) =>
      [
        action.componentStatus,
        action.enabledStatus,
        action.settingsStatus,
        action.analysisStatus,
      ].includes("unverified"),
    )
  ) {
    return "unverified";
  }
  return "success";
}

export async function applyAndVerifyComponentChangePlanViaUnityCliMcp(
  plan: ComponentChangePlan,
  options: ComponentChangeVerificationOptions,
  dependencies: ComponentChangeVerificationDependencies = {},
): Promise<ComponentChangeVerificationReport> {
  getApprovedComponentChanges(plan);

  if (options.projectPath.trim().length === 0) {
    throw new Error("An explicit Unity project path is required.");
  }
  const projectPath = path.resolve(options.projectPath);
  const sceneGraphPath = path.resolve(
    options.sceneGraphPath ?? plan.sceneGraphPath,
  );
  const logPath = path.resolve(
    options.logPath ??
      path.join(
        projectPath,
        "Temp",
        `scenegraph-verification-${randomUUID()}.log`,
      ),
  );
  const unityPath = resolveUnityPath(options.unityPath);
  const applicationRecords: ComponentChangeApplicationRecord[] = [];
  let applicationError: string | undefined;
  try {
    applicationRecords.push(
      ...(await applyApprovedComponentChangePlanViaUnityCliMcp(plan, options)),
    );
  } catch (error) {
    if (error instanceof ComponentChangeApplicationError) {
      applicationRecords.push(...error.records);
    }
    applicationError = errorMessage(error);
  }

  let exportError: string | undefined;
  try {
    const exportArgs = {
      unityPath,
      projectPath,
      scenePath: plan.scenePath,
      outputPath: sceneGraphPath,
      logPath,
    };
    await (dependencies.exportSceneGraph ?? exportSceneGraphWithUnity)(
      exportArgs,
    );
  } catch (error) {
    exportError = `${errorMessage(error)} (Unity log: ${logPath})`;
  }

  let graph: SceneGraph | undefined;
  const analysisResults: AnalysisResult[] = [];
  if (!exportError) {
    try {
      graph = SceneGraphParser.parseFile(sceneGraphPath);
      const sourcePaths = getSourcePaths(plan, options.sourcePaths);
      if (sourcePaths.length === 0) {
        throw new Error("The approved plan does not identify any source files.");
      }
      const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
      for (const filePath of sourcePaths) {
        if (!existsSync(filePath)) {
          throw new Error(`TypeScript source file not found: ${filePath}`);
        }
        analysisResults.push(analyzer.analyzeTypeScriptFile(filePath));
      }
    } catch (error) {
      exportError = `Post-export analysis failed: ${errorMessage(error)}`;
    }
  }

  const actions = graph
    ? collectActions(plan, graph, analysisResults)
    : plan.actions.map((action) => ({
        actionId: action.id,
        target: {
          globalObjectId: action.target.gameObjectId,
          hierarchyPath: action.target.gameObjectPath,
        },
        componentType: action.componentType,
        componentStatus: "unverified" as const,
        enabledStatus: "unverified" as const,
        settingsStatus: "unverified" as const,
        analysisStatus: "unverified" as const,
        messages: ["Could not verify because SceneGraph export or analysis failed."],
      }));

  const report: ComponentChangeVerificationReport = {
    status: overallStatus(
      actions,
      applicationError,
      exportError,
      analysisResults.some((result) =>
        result.issues.some((issue) => issue.severity === "error"),
      ),
    ),
    sceneGraphPath,
    logPath,
    applicationRecords,
    actions,
    analysisResults: analysisResults.map((result) => ({
      filePath: result.filePath,
      issues: result.issues,
      componentRequestCounts: result.summary.componentRequestCounts,
    })),
    runtimeBehavior: "not-verified",
  };
  if (applicationError !== undefined) {
    report.applicationError = applicationError;
  }
  if (exportError !== undefined) {
    report.exportError = exportError;
  }
  return report;
}
