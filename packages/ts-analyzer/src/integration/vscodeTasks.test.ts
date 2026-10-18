import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

interface WorkspaceTask {
  label: string;
  command: string;
  args: string[];
  dependsOn?: string;
  isBackground?: boolean;
  options: {
    cwd: string;
  };
  problemMatcher:
    | []
    | {
        pattern: {
          regexp: string;
        };
        background?: {
          beginsPattern: string;
          endsPattern: string;
        };
      };
}

interface WorkspaceTaskConfiguration {
  tasks: WorkspaceTask[];
  inputs: Array<{ id: string }>;
}

const repositoryRoot = path.resolve(__dirname, "../../../..");
const taskConfiguration = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, ".vscode", "tasks.json"), "utf8"),
) as WorkspaceTaskConfiguration;

describe("VS Code task configuration", () => {
  const buildTask = taskConfiguration.tasks.find((task) =>
    task.args.includes("build"),
  );
  const exportAndAnalyzeTask = taskConfiguration.tasks.find((task) =>
    task.args.includes("scenegraph:analyze"),
  );
  const watchTask = taskConfiguration.tasks.find((task) =>
    task.args.includes("--watch"),
  );

  it("builds the analyzer before running either workflow", () => {
    expect(buildTask).toBeDefined();
    expect(exportAndAnalyzeTask?.dependsOn).toBe(buildTask?.label);
    expect(watchTask?.dependsOn).toBe(buildTask?.label);
    expect(exportAndAnalyzeTask?.options.cwd).toBe(
      "${workspaceFolder}/packages/ts-analyzer",
    );
    expect(watchTask?.options.cwd).toBe(
      "${workspaceFolder}/packages/ts-analyzer",
    );
  });

  it("passes the export and analysis inputs to the one-shot task", () => {
    expect(exportAndAnalyzeTask?.command).toBe("npm");
    expect(exportAndAnalyzeTask?.args).toEqual(
      expect.arrayContaining([
        "--project-path",
        "${input:unityProjectPath}",
        "--scene-path",
        "${input:unityScenePath}",
        "--script-path",
        "${input:clusterScriptPath}",
      ]),
    );
    expect(taskConfiguration.inputs.map((input) => input.id)).toEqual(
      expect.arrayContaining([
        "unityProjectPath",
        "unityScenePath",
        "clusterScriptPath",
        "sceneGraphPath",
      ]),
    );
  });

  it("matches watch-mode diagnostics and background markers", () => {
    expect(watchTask?.command).toBe("node");
    expect(watchTask?.args).toEqual(
      expect.arrayContaining([
        "${input:sceneGraphPath}",
        "${input:clusterScriptPath}",
        "--watch",
        "--format",
        "vscode-problems",
      ]),
    );
    expect(watchTask?.isBackground).toBe(true);

    if (!watchTask || Array.isArray(watchTask.problemMatcher)) {
      throw new Error("Watch task is missing its problem matcher.");
    }

    const { pattern, background } = watchTask.problemMatcher;
    expect(
      "C:/workspace/script.ts(2,1): error SCENEGRAPH_COMPONENT_MISSING: Missing component",
    ).toMatch(new RegExp(pattern.regexp));
    expect(background).toBeDefined();
    expect("SCENEGRAPH_ANALYSIS_STARTED").toMatch(
      new RegExp(background!.beginsPattern),
    );
    expect("SCENEGRAPH_ANALYSIS_FINISHED").toMatch(
      new RegExp(background!.endsPattern),
    );

    const quickstart = fs.readFileSync(
      path.join(repositoryRoot, "docs", "quickstart.md"),
      "utf8",
    );
    expect(quickstart).toContain(exportAndAnalyzeTask?.label);
    expect(quickstart).toContain(watchTask.label);
  });
});
