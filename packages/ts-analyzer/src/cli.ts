#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { ClusterScriptAnalyzer } from "./analysis/analyzer";
import { SceneGraphParser } from "./sceneGraph/sceneGraphParser";
import { TypeScriptCodeParser } from "./analysis/typeScriptParser";
import { ClusterScriptDefinitions } from "./rules/clusterScriptDefinitions";
import { formatComponentRequirementStatusCounts } from "./analysis/componentRequirements/summary";
import type { AnalysisResult } from "./domain/types";
import { formatComponentChangePlan } from "./reporting/componentChangePlanFormatter";
import {
  ANALYSIS_REPORT_FORMATS,
  formatStructuredAnalysisReport,
  type AnalysisReportFormat,
} from "./reporting/structuredAnalysisFormatter";

/**
 * CLI ツール - ClusterScript静的解析
 */

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

function printUsage() {
  console.log(`
Usage: ts-analyzer <command> [options]

Commands:
  analyze <sceneGraphPath> [tsFilePath]
    Analyze TypeScript file(s) against SceneGraph constraints
    --format <text|json|sarif|github-actions|vscode-problems> selects the output format
    --watch re-analyzes when the SceneGraph or TypeScript file changes

  report <sceneGraphPath> [tsFilePath]
    Generate comprehensive analysis report

  coverage <sceneGraphPath> [tsFilePath]
    Show API coverage report

  recommend <sceneGraphPath> [tsFilePath]
    Show recommended components for TypeScript file

  plan <sceneGraphPath> <unityScenePath> [tsFilePath]
    Create a non-mutating component change plan for review

  scene-graph <sceneGraphPath>
    Display scene graph structure

  list-apis
    List all available ClusterScript APIs

Examples:
  ts-analyzer analyze ./SceneGraph.toml
  ts-analyzer analyze ./SceneGraph.toml ./script.ts
  ts-analyzer report ./SceneGraph.toml
  ts-analyzer scene-graph ./SceneGraph.toml
`);
}

function analyzeCommand(args: string[]) {
  let parsedArgs: {
    positional: string[];
    format: AnalysisReportFormat;
    watch: boolean;
  };
  try {
    parsedArgs = parseAnalyzeArguments(args);
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    printUsage();
    process.exit(1);
  }

  const [sceneGraphPath, tsFilePath] = parsedArgs.positional;
  if (!sceneGraphPath) {
    console.error("Error: Missing argument");
    printUsage();
    process.exit(1);
  }

  if (!fs.existsSync(sceneGraphPath)) {
    console.error(`Error: SceneGraph file not found: ${sceneGraphPath}`);
    process.exit(1);
  }

  try {
    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
    const targetFiles = tsFilePath
      ? [tsFilePath]
      : analyzer.getScriptableItemSourceFiles();

    if (parsedArgs.watch) {
      if (!tsFilePath) {
        throw new Error("--watch requires an explicit TypeScript file path");
      }
      if (
        parsedArgs.format !== "text" &&
        parsedArgs.format !== "vscode-problems"
      ) {
        throw new Error(
          "--watch supports only text and vscode-problems formats",
        );
      }
      if (!fs.existsSync(tsFilePath)) {
        throw new Error(`TypeScript file not found: ${tsFilePath}`);
      }

      const analyze = () =>
        runAnalysis(sceneGraphPath, targetFiles, parsedArgs.format);
      runAnalysisCycle(analyze, parsedArgs.format);
      watchAnalysisFiles(
        [sceneGraphPath, tsFilePath],
        analyze,
        parsedArgs.format,
      );
      return;
    }

    runAnalysis(sceneGraphPath, targetFiles, parsedArgs.format);
  } catch (error) {
    console.error("Error during analysis:", error);
    process.exit(1);
  }
}

function runAnalysis(
  sceneGraphPath: string,
  targetFiles: string[],
  format: AnalysisReportFormat,
): void {
  const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
  if (targetFiles.length === 0) {
    if (format === "text") {
      console.log(
        colorize("No ScriptableItem source files found.", ANSI.yellow),
      );
    } else {
      console.log(formatStructuredAnalysisReport(format, []));
    }
    return;
  }

  const results: AnalysisResult[] = [];
  for (const targetFile of targetFiles) {
    if (!fs.existsSync(targetFile)) {
      console.error(`Error: TypeScript file not found: ${targetFile}`);
      continue;
    }

    const result = analyzer.analyzeTypeScriptFile(targetFile);
    results.push(result);
    if (format === "text") {
      printTextAnalysisResult(analyzer, targetFile, result);
    }
  }

  if (format !== "text") {
    console.log(formatStructuredAnalysisReport(format, results));
  }
}

function printTextAnalysisResult(
  analyzer: ClusterScriptAnalyzer,
  targetFile: string,
  result: AnalysisResult,
): void {
  console.log(colorize(`\n=== Analysis Results ===\n`, ANSI.bold));
  console.log(`File: ${targetFile}`);
  console.log(`Issues: ${result.summary.totalIssues}`);
  console.log(
    `${colorize("Errors", ANSI.red)}: ${result.summary.errorCount}`,
  );
  console.log(
    `${colorize("Warnings", ANSI.yellow)}: ${result.summary.warningCount}\n`,
  );
  if (result.componentRequests.length > 0) {
    console.log(
      formatComponentRequirementStatusCounts(
        result.summary.componentRequestCounts,
      ),
    );
  }

  if (result.issues.length > 0) {
    console.log(colorize("Issues:", ANSI.bold));
    for (const issue of result.issues) {
      const severityColor =
        issue.severity === "error" ? ANSI.red : ANSI.yellow;
      const severityLabel = colorize(
        `[${issue.severity.toUpperCase()}]`,
        severityColor,
      );

      console.log(`  ${severityLabel} Line ${issue.line}:${issue.column}`);
      console.log(
        `    ${colorize("API:", severityColor)} ${colorize(issue.apiCall, severityColor)}`,
      );
      console.log(
        `    ${colorize("Message:", severityColor)} ${colorize(issue.message, severityColor)}`,
      );
      console.log(
        `    ${colorize("Required:", severityColor)} ${colorize(issue.requiredComponents.join(", "), severityColor)}`,
      );
      console.log(
        `    ${colorize("Available:", severityColor)} ${colorize(issue.availableComponents.join(", ") || "none", severityColor)}\n`,
      );
    }
  } else if (
    result.summary.componentRequestCounts.missing === 0 &&
    result.summary.componentRequestCounts.ambiguous === 0 &&
    result.summary.componentRequestCounts.unsupported === 0 &&
    result.summary.componentRequestCounts.unverified === 0
  ) {
    console.log(colorize("✅ No issues found!", ANSI.green));
  } else {
    console.log(
      colorize(
        "⚠️ No confirmed validation issues; component requirements need review.",
        ANSI.yellow,
      ),
    );
  }
  if (result.componentRequests.length > 0) {
    console.log(analyzer.generateComponentRequirementReport(result));
  }
}

function parseAnalyzeArguments(args: string[]): {
  positional: string[];
  format: AnalysisReportFormat;
  watch: boolean;
} {
  const positional: string[] = [];
  let format = "text";
  let watch = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--watch") {
      watch = true;
    } else if (argument === "--format") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --format");
      }
      format = value;
      index += 1;
    } else if (argument.startsWith("--format=")) {
      format = argument.slice("--format=".length);
    } else {
      positional.push(argument);
    }
  }

  if (!isAnalysisReportFormat(format)) {
    throw new Error(`Unsupported analysis format: ${format}`);
  }
  return { positional, format, watch };
}

function isAnalysisReportFormat(value: string): value is AnalysisReportFormat {
  return ANALYSIS_REPORT_FORMATS.some((format) => format === value);
}

function runAnalysisCycle(
  analyze: () => void,
  format: AnalysisReportFormat,
): void {
  if (format === "vscode-problems") {
    console.log("SCENEGRAPH_ANALYSIS_STARTED");
  }
  try {
    analyze();
  } finally {
    if (format === "vscode-problems") {
      console.log("SCENEGRAPH_ANALYSIS_FINISHED");
    }
  }
}

function watchAnalysisFiles(
  files: string[],
  analyze: () => void,
  format: AnalysisReportFormat,
): void {
  const watchedFiles = Array.from(
    new Set(files.map((file) => path.resolve(file))),
  );
  let debounceTimer: NodeJS.Timeout | undefined;
  const listeners = new Map<
    string,
    (current: fs.Stats, previous: fs.Stats) => void
  >();

  const stopWatching = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    for (const [file, listener] of listeners) {
      fs.unwatchFile(file, listener);
    }
    process.exit(0);
  };

  const scheduleAnalysis = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      try {
        runAnalysisCycle(analyze, format);
      } catch (error) {
        console.error(
          `Error during watched analysis: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }, 300);
  };

  for (const file of watchedFiles) {
    const listener = (current: fs.Stats, previous: fs.Stats) => {
      if (
        current.mtimeMs === previous.mtimeMs &&
        current.ctimeMs === previous.ctimeMs &&
        current.size === previous.size
      ) {
        return;
      }
      scheduleAnalysis();
    };
    listeners.set(file, listener);
    fs.watchFile(file, { interval: 500, persistent: true }, listener);
  }

  process.once("SIGINT", stopWatching);
  process.once("SIGTERM", stopWatching);
  console.log(`Watching for changes: ${watchedFiles.join(", ")}`);
}

function reportCommand(args: string[]) {
  if (args.length < 1) {
    console.error("Error: Missing argument");
    printUsage();
    process.exit(1);
  }

  const sceneGraphPath = args[0];
  const tsFilePath = args[1];
  const sceneGraphPathNonNull = sceneGraphPath!;

  if (!fs.existsSync(sceneGraphPathNonNull)) {
    console.error(`Error: SceneGraph file not found: ${sceneGraphPathNonNull}`);
    process.exit(1);
  }

  try {
    const analyzer = new ClusterScriptAnalyzer(sceneGraphPathNonNull);
    const targetFiles = tsFilePath
      ? [tsFilePath]
      : analyzer.getScriptableItemSourceFiles();

    console.log(analyzer.generateSceneGraphReport());
    console.log("\n");

    const results = new Map<string, AnalysisResult>();
    for (const targetFile of targetFiles) {
      if (!fs.existsSync(targetFile)) {
        console.error(`Error: TypeScript file not found: ${targetFile}`);
        continue;
      }
      results.set(targetFile, analyzer.analyzeTypeScriptFile(targetFile));
    }

    console.log(analyzer.generateReport(results));
  } catch (error) {
    console.error("Error generating report:", error);
    process.exit(1);
  }
}

function coverageCommand(args: string[]) {
  if (args.length < 1) {
    console.error("Error: Missing argument");
    printUsage();
    process.exit(1);
  }

  const sceneGraphPath = args[0];
  const tsFilePath = args[1];
  const sceneGraphPathNonNull = sceneGraphPath!;

  if (!fs.existsSync(sceneGraphPathNonNull)) {
    console.error(`Error: SceneGraph file not found: ${sceneGraphPathNonNull}`);
    process.exit(1);
  }

  try {
    const analyzer = new ClusterScriptAnalyzer(sceneGraphPathNonNull);
    const targetFiles = tsFilePath
      ? [tsFilePath]
      : analyzer.getScriptableItemSourceFiles();

    for (const targetFile of targetFiles) {
      if (!fs.existsSync(targetFile)) {
        console.error(`Error: TypeScript file not found: ${targetFile}`);
        continue;
      }
      console.log("\n" + analyzer.generateApiCoverageReport(targetFile));
    }
  } catch (error) {
    console.error("Error generating coverage report:", error);
    process.exit(1);
  }
}

function recommendCommand(args: string[]) {
  if (args.length < 1) {
    console.error("Error: Missing argument");
    printUsage();
    process.exit(1);
  }

  const sceneGraphPath = args[0];
  const tsFilePath = args[1];
  const sceneGraphPathNonNull = sceneGraphPath!;

  if (!fs.existsSync(sceneGraphPathNonNull)) {
    console.error(`Error: SceneGraph file not found: ${sceneGraphPathNonNull}`);
    process.exit(1);
  }

  try {
    const analyzer = new ClusterScriptAnalyzer(sceneGraphPathNonNull);
    const targetFiles = tsFilePath
      ? [tsFilePath]
      : analyzer.getScriptableItemSourceFiles();

    for (const targetFile of targetFiles) {
      if (!fs.existsSync(targetFile)) {
        console.error(`Error: TypeScript file not found: ${targetFile}`);
        continue;
      }
      console.log("\n" + analyzer.generateRecommendedComponents(targetFile));
    }
  } catch (error) {
    console.error("Error generating recommendations:", error);
    process.exit(1);
  }
}

function planCommand(args: string[]) {
  if (args.length < 2) {
    console.error("Error: Missing argument");
    printUsage();
    process.exit(1);
  }

  const sceneGraphPath = args[0]!;
  const scenePath = args[1]!;
  const tsFilePath = args[2];

  if (!fs.existsSync(sceneGraphPath)) {
    console.error(`Error: SceneGraph file not found: ${sceneGraphPath}`);
    process.exit(1);
  }

  try {
    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
    const targetFiles = tsFilePath
      ? [tsFilePath]
      : analyzer.getScriptableItemSourceFiles();
    const results: AnalysisResult[] = [];

    for (const targetFile of targetFiles) {
      if (!fs.existsSync(targetFile)) {
        console.error(`Error: TypeScript file not found: ${targetFile}`);
        continue;
      }
      results.push(analyzer.analyzeTypeScriptFile(targetFile));
    }

    console.log(
      formatComponentChangePlan(
        analyzer.createComponentChangePlan(results, scenePath),
      ),
    );
  } catch (error) {
    console.error("Error creating component change plan:", error);
    process.exit(1);
  }
}

function sceneGraphCommand(args: string[]) {
  if (args.length < 1) {
    console.error("Error: Missing sceneGraphPath");
    printUsage();
    process.exit(1);
  }

  const sceneGraphPath = args[0];
  const sceneGraphPathNonNull = sceneGraphPath!;

  if (!fs.existsSync(sceneGraphPathNonNull)) {
    console.error(`Error: SceneGraph file not found: ${sceneGraphPathNonNull}`);
    process.exit(1);
  }

  try {
    const sceneGraph = SceneGraphParser.parseFile(sceneGraphPathNonNull);
    console.log("\n" + SceneGraphParser.visualizeHierarchy(sceneGraph));
    console.log("\n=== Component Distribution ===");

    const distribution =
      SceneGraphParser.analyzeComponentDistribution(sceneGraph);
    for (const [componentType, count] of distribution) {
      console.log(`  ${componentType}: ${count}`);
    }
  } catch (error) {
    console.error("Error reading scene graph:", error);
    process.exit(1);
  }
}

function listApisCommand() {
  const methods = ClusterScriptDefinitions.getAllMethodNames();
  const properties = ClusterScriptDefinitions.getAllPropertyNames();

  console.log("\n=== Available ClusterScript APIs ===\n");

  console.log("Methods:");
  for (const method of methods.sort()) {
    console.log(`  - ${method}`);
  }

  console.log("\nProperties:");
  for (const prop of properties.sort()) {
    console.log(`  - ${prop}`);
  }
}

// Main CLI entry point
const args = process.argv.slice(2);

if (args.length === 0) {
  printUsage();
  process.exit(0);
}

const command = args[0];
const commandArgs = args.slice(1);

switch (command) {
  case "analyze":
    analyzeCommand(commandArgs);
    break;
  case "report":
    reportCommand(commandArgs);
    break;
  case "coverage":
    coverageCommand(commandArgs);
    break;
  case "recommend":
    recommendCommand(commandArgs);
    break;
  case "plan":
    planCommand(commandArgs);
    break;
  case "scene-graph":
    sceneGraphCommand(commandArgs);
    break;
  case "list-apis":
    listApisCommand();
    break;
  case "--help":
  case "-h":
  case "help":
    printUsage();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}
