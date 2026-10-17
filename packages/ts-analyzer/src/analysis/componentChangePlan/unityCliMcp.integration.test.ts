import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  approveComponentChangePlan,
  createComponentChangePlan,
  resolveComponentChangeSettings,
  type ComponentChangePlan,
} from ".";
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
    api: "$.onGrab",
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
        evidence: "$.onGrab(() => {})",
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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Unity CLI MCP application integration", () => {
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
