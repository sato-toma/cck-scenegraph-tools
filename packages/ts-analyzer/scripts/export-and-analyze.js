#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { randomUUID } = require("crypto");

const repositoryRoot = path.resolve(__dirname, "../../..");
const analyzerModulePath = path.join(__dirname, "..", "dist", "index.js");
const defaultProjectPath = path.join(
  repositoryRoot,
  "packages",
  "unity-semantic-graph",
  "Samples~",
);
const defaultScriptPath = path.join(
  defaultProjectPath,
  "Assets",
  "Script",
  "src",
  "onGrabScript.ts",
);

function printUsage() {
  console.log(`
Usage: npm run scenegraph:analyze -- [options]

Options:
  --unity-path <path>       Unity Editor executable path
  --project-path <path>     Unity project path
  --scene-path <path>       Scene path, relative to the Unity project or absolute
  --script-path <path>      ClusterScript TypeScript file to analyze
  --output-path <path>      SceneGraph TOML path, relative to the Unity project or absolute
  --log-path <path>         Unity log path, relative to the Unity project or absolute
  --fail-on-issues          Exit with code 1 when analyzer issues are found
  --fail-on-unverified      Exit with code 1 for ambiguous, unsupported, or unverified requirements
  --help                    Show this help
`);
}

function parseArguments(args) {
  const options = { failOnIssues: false, failOnUnverified: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--fail-on-issues") {
      options.failOnIssues = true;
      continue;
    }
    if (argument === "--fail-on-unverified") {
      options.failOnUnverified = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unknown argument: ${argument}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }

  return options;
}

function resolvePath(value, basePath) {
  return path.resolve(basePath, value);
}

function loadAnalyzerModule() {
  if (!fs.existsSync(analyzerModulePath)) {
    throw new Error("Analyzer build not found. Run npm run build in packages/ts-analyzer first.");
  }
  return require(analyzerModulePath);
}

function resolveUnityPath(explicitPath, projectPath) {
  const configuredPath = explicitPath || process.env.UNITY_PATH;
  if (configuredPath) {
    return configuredPath;
  }

  if (process.platform === "win32") {
    const versionFile = path.join(projectPath, "ProjectSettings", "ProjectVersion.txt");
    const versionText = fs.existsSync(versionFile)
      ? fs.readFileSync(versionFile, "utf8")
      : "";
    const versionMatch = versionText.match(/m_EditorVersion:\s*(\S+)/);
    const editorVersion = versionMatch ? versionMatch[1] : null;
    const editorRoot = process.env["ProgramFiles"] || "C:\\Program Files";
    if (editorVersion) {
      const candidate = path.join(
        editorRoot,
        "Unity",
        "Hub",
        "Editor",
        editorVersion,
        "Editor",
        "Unity.exe",
      );
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return "Unity.exe";
  }

  if (process.platform === "darwin") {
    return "Unity";
  }

  return "Unity";
}

function runUnity(options) {
  const projectPath = resolvePath(options.projectPath || defaultProjectPath, process.cwd());
  const scenePath = options.scenePath || "Assets/test.unity";
  const outputPath = resolvePath(
    options.outputPath || "SceneGraph.generated.toml",
    projectPath,
  );
  const temporaryOutputPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${randomUUID()}.tmp`,
  );
  const logPath = resolvePath(
    options.logPath || path.join("Temp", "scenegraph-export.log"),
    projectPath,
  );
  const unityPath = resolveUnityPath(options.unityPath, projectPath);

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Unity project not found: ${projectPath}`);
  }
  const { SceneGraphParser, WorldUploadValidator } = loadAnalyzerModule();

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  const unityArguments = [
    "-batchmode",
    "-nographics",
    "-quit",
    "-projectPath",
    projectPath,
    "-executeMethod",
    "UnitySemanticGraph.Editor.Exporter.SelectiveComponentTomlExporter.ExportGraphToToml",
    "-scenePath",
    scenePath,
    "-outputPath",
    temporaryOutputPath,
    "-logFile",
    logPath,
  ];

  console.log(`Unity project: ${projectPath}`);
  console.log(`Scene: ${scenePath}`);
  console.log(`SceneGraph output: ${outputPath}`);
  console.log(`Unity log: ${logPath}`);

  try {
    const isPowerShellScript = path.extname(unityPath).toLowerCase() === ".ps1";
    const command = isPowerShellScript
      ? process.platform === "win32"
        ? "powershell.exe"
        : "pwsh"
      : unityPath;
    const commandArguments = isPowerShellScript
      ? ["-NoProfile", "-File", unityPath, ...unityArguments]
      : unityArguments;
    const result = spawnSync(command, commandArguments, { stdio: "inherit" });
    if (result.error) {
      throw new Error(`Failed to start Unity: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`Unity export failed with exit code ${result.status}`);
    }
    if (
      !fs.existsSync(temporaryOutputPath) ||
      fs.statSync(temporaryOutputPath).size === 0
    ) {
      throw new Error(
        `Unity did not create a non-empty SceneGraph file: ${temporaryOutputPath}`,
      );
    }

    let sceneGraph;
    try {
      sceneGraph = SceneGraphParser.parseFile(temporaryOutputPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unity produced an invalid SceneGraph TOML: ${message}`);
    }
    const uploadIssues = WorldUploadValidator.validate(sceneGraph);
    if (uploadIssues.length > 0) {
      throw new Error(
        `SceneGraph does not meet Cluster world upload requirements:\n- ${uploadIssues.join("\n- ")}`,
      );
    }

    fs.renameSync(temporaryOutputPath, outputPath);
  } finally {
    if (fs.existsSync(temporaryOutputPath)) {
      fs.unlinkSync(temporaryOutputPath);
    }
  }

  return { projectPath, outputPath };
}

function runAnalyzer(outputPath, scriptPath, options) {
  const resolvedScriptPath = resolvePath(scriptPath || defaultScriptPath, process.cwd());
  if (!fs.existsSync(resolvedScriptPath)) {
    throw new Error(`TypeScript file not found: ${resolvedScriptPath}`);
  }

  const {
    ClusterScriptAnalyzer,
    hasMissingComponentRequirements,
    hasUnverifiedComponentRequirements,
  } = loadAnalyzerModule();
  const analyzer = new ClusterScriptAnalyzer(outputPath);
  const result = analyzer.analyzeTypeScriptFile(resolvedScriptPath);
  console.log(analyzer.generateReport(new Map([[resolvedScriptPath, result]])));

  const hasMissingRequirements = hasMissingComponentRequirements(
    result.componentRequests,
  );
  const hasUnverifiedRequirements = hasUnverifiedComponentRequirements(
    result.componentRequests,
  );

  if (
    options.failOnIssues &&
    (result.summary.totalIssues > 0 || hasMissingRequirements)
  ) {
    console.error(
      "Error: Analyzer found validation issues or missing component requirements.",
    );
    process.exitCode = 1;
  }
  if (options.failOnUnverified && hasUnverifiedRequirements) {
    console.error(
      "Error: Component requirements include ambiguous, unsupported, or unverified results.",
    );
    process.exitCode = 1;
  }
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      printUsage();
      return;
    }

    const exportResult = runUnity(options);
    runAnalyzer(exportResult.outputPath, options.scriptPath, options);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
