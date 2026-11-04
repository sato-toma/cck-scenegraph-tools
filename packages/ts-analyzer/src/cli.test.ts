import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAnalysis } from "./cli";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createSceneGraph(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-cli-"));
  temporaryDirectories.push(directory);
  const sceneGraphPath = path.join(directory, "SceneGraph.toml");
  fs.writeFileSync(sceneGraphPath, 'project = "TestProject"\n');
  return sceneGraphPath;
}

describe("analyze CLI", () => {
  it("reports upload validation failures even when no scripts are assigned", () => {
    const sceneGraphPath = createSceneGraph();
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message) => {
      output.push(String(message));
    });

    runAnalysis(sceneGraphPath, [], "text", false);

    expect(output.join("\n")).toContain("=== World Upload Validation ===");
    expect(output.join("\n")).toContain(
      'At least one enabled SpawnPoint with Spawn_Type = "Entrance" is required.',
    );
    expect(output.join("\n")).toContain(
      "Exactly one DespawnHeight component is required; found 0.",
    );
    expect(output.join("\n")).toContain(
      "No ScriptableItem source files found.",
    );
  });

  it("includes upload validation in JSON output", () => {
    const sceneGraphPath = createSceneGraph();
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message) => {
      output.push(String(message));
    });

    runAnalysis(sceneGraphPath, [], "json", false);

    const report = JSON.parse(output.join("\n")) as {
      schemaVersion: number;
      worldUploadValidation: { issues: string[] };
    };
    expect(report.schemaVersion).toBe(2);
    expect(report.worldUploadValidation.issues).toContain(
      "Exactly one DespawnHeight component is required; found 0.",
    );
  });
});
