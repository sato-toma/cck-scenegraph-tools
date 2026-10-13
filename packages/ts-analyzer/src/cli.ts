#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { ClusterScriptAnalyzer } from "./analyzer";
import { SceneGraphParser } from "./sceneGraphParser";
import { TypeScriptCodeParser } from "./typeScriptParser";
import { ClusterScriptDefinitions } from "./clusterScriptDefinitions";
import type { AnalysisResult } from "./types";

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

  report <sceneGraphPath> [tsFilePath]
    Generate comprehensive analysis report

  coverage <sceneGraphPath> [tsFilePath]
    Show API coverage report

  recommend <sceneGraphPath> [tsFilePath]
    Show recommended components for TypeScript file

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

    if (targetFiles.length === 0) {
      console.log(
        colorize("No ScriptableItem source files found.", ANSI.yellow),
      );
      return;
    }

    for (const targetFile of targetFiles) {
      if (!fs.existsSync(targetFile)) {
        console.error(`Error: TypeScript file not found: ${targetFile}`);
        continue;
      }

      const result = analyzer.analyzeTypeScriptFile(targetFile);
      console.log(colorize(`\n=== Analysis Results ===\n`, ANSI.bold));
      console.log(`File: ${targetFile}`);
      console.log(`Issues: ${result.summary.totalIssues}`);
      console.log(
        `${colorize("Errors", ANSI.red)}: ${result.summary.errorCount}`,
      );
      console.log(
        `${colorize("Warnings", ANSI.yellow)}: ${result.summary.warningCount}\n`,
      );

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
      } else {
        console.log(colorize("✅ No issues found!", ANSI.green));
      }
      if (result.componentRequests.length > 0) {
        console.log(analyzer.generateComponentRequirementReport(result));
      }
    }
  } catch (error) {
    console.error("Error during analysis:", error);
    process.exit(1);
  }
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
