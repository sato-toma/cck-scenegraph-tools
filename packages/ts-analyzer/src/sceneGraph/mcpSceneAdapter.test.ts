import { describe, expect, it } from "vitest";
import liveResponseFixture from "../fixtures/mcp-on-grab-scene.json";
import { McpSceneAdapter, McpSceneAdapterError } from "./mcpSceneAdapter";

describe("McpSceneAdapter", () => {
  it("normalizes captured hierarchy and GlobalObjectId responses", () => {
    const result = McpSceneAdapter.normalize(
      liveResponseFixture.getSceneHierarchy,
      liveResponseFixture.findGameObjects,
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.snapshot).toMatchObject({
      sceneName: "test",
      scenePath: "Assets/test.unity",
      isActive: true,
      isDirty: false,
      gameObjects: [
        {
          globalId:
            "GlobalObjectId_V1-2-4623955290552cb4fb2bccad9a61aa7c-1369298475-0",
          hierarchyPath: "/onGrab",
          name: "onGrab",
          activeSelf: true,
          components: [
            { shortTypeName: "Transform", enabled: { status: "unsupported" } },
            { shortTypeName: "Item", enabled: { status: "unsupported" } },
            { shortTypeName: "Rigidbody", enabled: { status: "unsupported" } },
            { shortTypeName: "MovableItem", enabled: { status: "unsupported" } },
            { shortTypeName: "GrabbableItem", enabled: { status: "unsupported" } },
            { shortTypeName: "ScriptableItem", enabled: { status: "unsupported" } },
          ],
        },
        {
          globalId:
            "GlobalObjectId_V1-2-4623955290552cb4fb2bccad9a61aa7c-676474044-0",
          hierarchyPath: "/onGrab/Cube",
          name: "Cube",
          components: [
            { shortTypeName: "Transform", enabled: { status: "unsupported" } },
            { shortTypeName: "MeshFilter", enabled: { status: "unsupported" } },
            { shortTypeName: "MeshRenderer", enabled: { status: "unsupported" } },
            { shortTypeName: "BoxCollider", enabled: { status: "unsupported" } },
          ],
        },
      ],
    });
    expect(result.snapshot.gameObjects[0]?.components[1]?.enabled.reason).toMatch(
      /do not expose component enabled state/,
    );
  });

  it("omits objects without a stable ID instead of matching by path or name", () => {
    const hierarchy = {
      sceneName: "test",
      scenePath: "Assets/test.unity",
      isActive: true,
      isDirty: false,
      roots: [
        {
          name: "onGrab",
          instanceId: 41018,
          hierarchyPath: "/onGrab",
          activeSelf: true,
          components: ["Transform", "Item"],
          children: [],
        },
      ],
    };
    const found = {
      count: 1,
      gameObjects: [
        {
          globalId: "",
          instanceId: 41018,
          hierarchyPath: "/onGrab",
        },
      ],
    };

    const result = McpSceneAdapter.normalize(hierarchy, found);

    expect(result.snapshot.gameObjects).toEqual([]);
    expect(result.diagnostics).toMatchObject([
      { code: "missing-global-id", hierarchyPath: "/onGrab" },
    ]);
  });

  it("omits an object when hierarchy responses disagree across MCP calls", () => {
    const hierarchy = {
      sceneName: "test",
      scenePath: "Assets/test.unity",
      isActive: true,
      isDirty: false,
      roots: [
        {
          name: "onGrab",
          instanceId: 41018,
          hierarchyPath: "/onGrab",
          activeSelf: true,
          components: ["Transform"],
          children: [],
        },
      ],
    };
    const found = {
      gameObjects: [
        {
          globalId: "stable-id",
          instanceId: 41018,
          hierarchyPath: "/renamed",
        },
      ],
    };

    const result = McpSceneAdapter.normalize(hierarchy, found);

    expect(result.snapshot.gameObjects).toEqual([]);
    expect(result.diagnostics).toMatchObject([
      { code: "hierarchy-path-mismatch", hierarchyPath: "/onGrab" },
    ]);
  });

  it("rejects malformed hierarchy data explicitly", () => {
    expect(() =>
      McpSceneAdapter.normalize(
        { sceneName: "test", scenePath: "Assets/test.unity", roots: [] },
        { gameObjects: [] },
      ),
    ).toThrow(McpSceneAdapterError);
  });
});
