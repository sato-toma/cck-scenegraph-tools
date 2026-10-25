import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  COMPONENT_CHANGE_ACTION_STATUSES,
  COMPONENT_CHANGE_VERIFICATION_STATUSES,
  applyAndVerifyComponentChangePlanViaUnityCliMcp,
  approveComponentChangePlan,
  createComponentChangePlan,
  resolveComponentChangeSettings,
  type ComponentChangePlan,
} from ".";
import { formatComponentChangeVerificationReport } from "../../reporting/componentChangeVerificationFormatter";
import { applyApprovedComponentChangePlanViaUnityCliMcp } from "./unityCliMcp";
import type {
  AnalysisResult,
  ComponentRequirementRequest,
  SceneGraph,
} from "../../domain/types";

const sceneGraph: SceneGraph = {
  project: "TestProject",
  gameObjects: [],
};

const fixturePath = path.resolve(
  __dirname,
  "../../fixtures/fake-unity-cli-mcp.cjs",
);
const temporaryDirectories: string[] = [];

function request(
  id: string,
  componentType: string,
  line: number,
): ComponentRequirementRequest {
  return {
    id,
    api: "$.onCollide",
    componentTypes: [componentType],
    componentMatch: "all",
    target: {
      kind: "current-scriptable-item",
      resolution: "resolved",
      gameObjectId: "item-id",
      gameObjectPath: "Root/Item",
    },
    verificationStatus: "missing",
    validation: {
      presentComponentTypes: [],
      missingComponentTypes: [componentType],
      matchedComponents: [],
    },
    occurrences: [
      {
        source: { filePath: "item.ts", line, column: 0 },
        condition: { kind: "unconditional" },
        evidence: "$.onCollide(() => {})",
        confidence: "high",
      },
    ],
  };
}

function makePlan(
  componentTypes: string[] = ["UnityEngine.Rigidbody"],
  settings: Record<string, string | number | boolean | (string | number | boolean)[]> = {},
  approved = true,
): ComponentChangePlan {
  const requests = componentTypes.map((type, index) =>
    request(`request-${index}`, type, index + 1),
  );
  const result: AnalysisResult = {
    filePath: "item.ts",
    issues: [],
    componentRequests: requests,
    summary: {
      totalIssues: 0,
      errorCount: 0,
      warningCount: 0,
      componentRequestCounts: {
        satisfied: 0,
        missing: requests.length,
        ambiguous: 0,
        unsupported: 0,
        unverified: 0,
        optionalLookupMissing: 0,
      },
    },
  };
  const plan = createComponentChangePlan(
    sceneGraph,
    [result],
    "Assets/test.unity",
    "SceneGraph.toml",
  );
  const resolved = plan.actions.reduce(
    (current, action, index) =>
      resolveComponentChangeSettings(
        current,
        action.id,
        index === 0 ? settings : {},
      ),
    plan,
  );
  return approved
    ? approveComponentChangePlan(resolved, {
        planId: resolved.id,
        confirmed: true,
      })
    : resolved;
}

async function createMcpConfig(scenario = ""): Promise<{
  configPath: string;
  statePath: string;
}> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "cck-unity-cli-mcp-"),
  );
  temporaryDirectories.push(directory);
  const statePath = path.join(directory, "server-state.json");
  const configPath = path.join(directory, ".mcp.json");
  await writeFile(
    configPath,
    JSON.stringify({
      mcpServers: {
        unity: {
          type: "stdio",
          command: process.execPath,
          args: [fixturePath, statePath, scenario],
        },
      },
    }),
  );
  return { configPath, statePath };
}

async function readServerState(
  statePath: string,
): Promise<{
  started: boolean;
  calls: Array<{ name: string; arguments: Record<string, unknown> }>;
  components: string[];
  properties: Record<string, unknown>;
}> {
  return JSON.parse(await readFile(statePath, "utf8"));
}

function exportedSceneGraph(enabled = true): string {
  return `project = "TestProject"

[[gameObjects]]
id = "item-id"
path = "Root/Item"
name = "Item"
parent = "Root"

[[gameObjects.components]]
id = "scriptable-component"
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true

[gameObjects.components.properties]
Source_Code_Asset = "item"

[[gameObjects.components]]
id = "rigidbody-component"
type = "UnityEngine.Rigidbody"
enabled = ${enabled}

[gameObjects.components.properties]
Mass = 2
`;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Unity CLI MCP application integration", () => {
  it("re-exports and statically verifies the approved component change", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cck-component-verification-"),
    );
    temporaryDirectories.push(directory);
    const { configPath, statePath } = await createMcpConfig();
    const sourcePath = path.join(directory, "item.ts");
    const sceneGraphPath = path.join(directory, "SceneGraph.toml");
    await writeFile(sourcePath, "$.onCollide(() => {});\n");

    const report = await applyAndVerifyComponentChangePlanViaUnityCliMcp(
      makePlan(["UnityEngine.Rigidbody"], { mass: 2 }),
      {
        configPath,
        projectPath: directory,
        sceneGraphPath,
        sourcePaths: [sourcePath],
        unityPath: "Unity.exe",
      },
      {
        exportSceneGraph: async ({ outputPath }) => {
          await writeFile(outputPath, exportedSceneGraph());
        },
      },
    );

    expect(report).toMatchObject({
      status: COMPONENT_CHANGE_VERIFICATION_STATUSES.success,
      runtimeBehavior: "not-verified",
      actions: [
        {
          changeStatus: COMPONENT_CHANGE_ACTION_STATUSES.added,
          componentStatus: "verified",
          enabledStatus: "verified",
          settingsStatus: "verified",
          requestedSettings: { mass: 2 },
          exportedSettings: { mass: 2 },
          analysisStatus: "verified",
        },
      ],
      analysisResults: [
        {
          componentRequestCounts: {
            satisfied: 1,
            missing: 0,
            ambiguous: 0,
            unsupported: 0,
            unverified: 0,
            optionalLookupMissing: 0,
          },
        },
      ],
    });
    expect(formatComponentChangeVerificationReport(report)).toContain(
      "Runtime behavior: UNVERIFIED",
    );
    expect(formatComponentChangeVerificationReport(report)).toContain(
      "requested settings: {\"mass\":2}",
    );
    expect(formatComponentChangeVerificationReport(report)).toContain(
      "Root/Item (item-id)",
    );
    expect((await readServerState(statePath)).components).toContain(
      "UnityEngine.Rigidbody",
    );
  });

  it("reports disabled exported components as failure", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cck-component-verification-"),
    );
    temporaryDirectories.push(directory);
    const { configPath } = await createMcpConfig();
    const sourcePath = path.join(directory, "item.ts");
    const sceneGraphPath = path.join(directory, "SceneGraph.toml");
    await writeFile(sourcePath, "$.onCollide(() => {});\n");

    const report = await applyAndVerifyComponentChangePlanViaUnityCliMcp(
      makePlan(["UnityEngine.Rigidbody"]),
      {
        configPath,
        projectPath: directory,
        sceneGraphPath,
        sourcePaths: [sourcePath],
        unityPath: "Unity.exe",
      },
      {
        exportSceneGraph: async ({ outputPath }) => {
          await writeFile(outputPath, exportedSceneGraph(false));
        },
      },
    );

    expect(report.status).toBe("failure");
    expect(report.actions[0]).toMatchObject({
      componentStatus: "verified",
      enabledStatus: "failed",
      analysisStatus: "failed",
    });
    expect(report.actions[0]?.messages).toContain(
      "The exported component is disabled.",
    );
  });

  it("reports mismatched exported settings as failure", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cck-component-verification-"),
    );
    temporaryDirectories.push(directory);
    const { configPath } = await createMcpConfig();
    const sourcePath = path.join(directory, "item.ts");
    const sceneGraphPath = path.join(directory, "SceneGraph.toml");
    await writeFile(sourcePath, "$.onCollide(() => {});\n");

    const report = await applyAndVerifyComponentChangePlanViaUnityCliMcp(
      makePlan(["UnityEngine.Rigidbody"], { mass: 2 }),
      {
        configPath,
        projectPath: directory,
        sceneGraphPath,
        sourcePaths: [sourcePath],
        unityPath: "Unity.exe",
      },
      {
        exportSceneGraph: async ({ outputPath }) => {
          await writeFile(
            outputPath,
            exportedSceneGraph().replace("Mass = 2", "Mass = 3"),
          );
        },
      },
    );

    expect(report.status).toBe("failure");
    expect(report.actions[0]).toMatchObject({
      settingsStatus: "failed",
      requestedSettings: { mass: 2 },
      exportedSettings: { mass: 3 },
    });
  });

  it("reports exporter-omitted settings as unverified", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cck-component-verification-"),
    );
    temporaryDirectories.push(directory);
    const { configPath } = await createMcpConfig();
    const sourcePath = path.join(directory, "item.ts");
    const sceneGraphPath = path.join(directory, "SceneGraph.toml");
    await writeFile(sourcePath, "$.onCollide(() => {});\n");

    const report = await applyAndVerifyComponentChangePlanViaUnityCliMcp(
      makePlan(["UnityEngine.Rigidbody"], { mass: 2 }),
      {
        configPath,
        projectPath: directory,
        sceneGraphPath,
        sourcePaths: [sourcePath],
        unityPath: "Unity.exe",
      },
      {
        exportSceneGraph: async ({ outputPath }) => {
          await writeFile(
            outputPath,
            exportedSceneGraph().replace("Mass = 2\n", ""),
          );
        },
      },
    );

    expect(report.status).toBe("unverified");
    expect(report.actions[0]).toMatchObject({
      componentStatus: "verified",
      enabledStatus: "verified",
      settingsStatus: "unverified",
      analysisStatus: "verified",
    });
  });

  it("does not treat a stale SceneGraph as success when re-export fails", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cck-component-verification-"),
    );
    temporaryDirectories.push(directory);
    const { configPath } = await createMcpConfig();
    const sceneGraphPath = path.join(directory, "SceneGraph.toml");
    await writeFile(sceneGraphPath, exportedSceneGraph());

    const report = await applyAndVerifyComponentChangePlanViaUnityCliMcp(
      makePlan(),
      {
        configPath,
        projectPath: directory,
        sceneGraphPath,
        sourcePaths: [path.join(directory, "item.ts")],
        unityPath: "Unity.exe",
      },
      {
        exportSceneGraph: async () => {
          throw new Error("Exporter unavailable");
        },
      },
    );

    expect(report.status).toBe("failure");
    expect(report.exportError).toContain("Exporter unavailable");
    expect(report.actions[0]?.componentStatus).toBe("unverified");
  });

  it("reports post-export analysis failures instead of success", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cck-component-verification-"),
    );
    temporaryDirectories.push(directory);
    const { configPath } = await createMcpConfig();
    const sceneGraphPath = path.join(directory, "SceneGraph.toml");

    const report = await applyAndVerifyComponentChangePlanViaUnityCliMcp(
      makePlan(),
      {
        configPath,
        projectPath: directory,
        sceneGraphPath,
        sourcePaths: [path.join(directory, "missing.ts")],
        unityPath: "Unity.exe",
      },
      {
        exportSceneGraph: async ({ outputPath }) => {
          await writeFile(outputPath, exportedSceneGraph());
        },
      },
    );

    expect(report.status).toBe("failure");
    expect(report.exportError).toContain("Post-export analysis failed");
    expect(report.exportError).toContain("TypeScript source file not found");
  });

  it("applies only the approved component and its explicitly resolved settings", async () => {
    const { configPath, statePath } = await createMcpConfig();
    const plan = makePlan(["UnityEngine.Rigidbody"], { mass: 2 });

    const records = await applyApprovedComponentChangePlanViaUnityCliMcp(
      plan,
      { configPath },
    );

    const state = await readServerState(statePath);
    expect(state.calls.filter(({ name }) => name === "add_component")).toEqual([
      {
        name: "add_component",
        arguments: {
          gameObjectId: 42,
          componentType: "UnityEngine.Rigidbody",
        },
      },
    ]);
    expect(state.calls.filter(({ name }) => name === "set_component_properties"))
      .toEqual([
        {
          name: "set_component_properties",
          arguments: {
            gameObjectId: 42,
            componentType: "UnityEngine.Rigidbody",
            properties: { mass: 2 },
          },
        },
      ]);
    expect(state.properties).toEqual({ mass: 2 });
    expect(records[records.length - 1]).toMatchObject({
      phase: "after",
      result: "verified",
      target: {
        globalObjectId: "item-id",
        hierarchyPath: "Root/Item",
      },
    });
  });

  it("does not read config or start an MCP server for an unapproved plan", async () => {
    const plan = makePlan(["UnityEngine.Rigidbody"], {}, false);

    await expect(
      applyApprovedComponentChangePlanViaUnityCliMcp(plan, {
        configPath: path.join(os.tmpdir(), "missing-mcp-config.json"),
      }),
    ).rejects.toThrow("has not been approved");
  });

  it("prevents duplicate additions through the real MCP transport", async () => {
    const { configPath, statePath } = await createMcpConfig(
      "present:UnityEngine.Rigidbody",
    );

    const records = await applyApprovedComponentChangePlanViaUnityCliMcp(
      makePlan(),
      { configPath },
    );

    const state = await readServerState(statePath);
    expect(state.calls.some(({ name }) => name === "add_component")).toBe(false);
    expect(records[records.length - 1]).toMatchObject({
      phase: "after",
      result: "skipped",
      componentPresent: true,
    });
  });

  it("stops later planned additions after an MCP tool failure", async () => {
    const { configPath, statePath } = await createMcpConfig("fail-add");

    await expect(
      applyApprovedComponentChangePlanViaUnityCliMcp(
        makePlan(["UnityEngine.Rigidbody", "UnityEngine.BoxCollider"]),
        { configPath },
      ),
    ).rejects.toMatchObject({
      name: "ComponentChangeApplicationError",
      message: expect.stringContaining("remaining changes were not applied"),
    });

    const state = await readServerState(statePath);
    expect(state.calls.filter(({ name }) => name === "add_component")).toHaveLength(
      1,
    );
  });
});
