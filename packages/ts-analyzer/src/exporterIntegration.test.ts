import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { ClusterScriptAnalyzer } from "./analyzer";
import { SceneGraphParser } from "./sceneGraphParser";
import { WorldUploadValidator } from "./worldUploadValidator";

const fixturePath = path.join(
  __dirname,
  "fixtures",
  "scene-graph-export.toml",
);

describe("SceneGraph exporter integration", () => {
  it("parses exporter-shaped TOML and analyzes the mapped ClusterScript", () => {
    const sceneGraph = SceneGraphParser.parseFile(fixturePath);
    expect(WorldUploadValidator.validate(sceneGraph)).toEqual([]);
    const item = sceneGraph.gameObjects.find((gameObject) => gameObject.name === "Item");
    expect(item?.components.map((component) => component.type)).toEqual([
      "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
      "ClusterVR.CreatorKit.Item.Implements.ScriptableItem",
    ]);
    expect(sceneGraph.gameObjects[0]?.components[0]?.enabled).toBe(false);
    expect(sceneGraph.gameObjects[0]?.components[0]?.properties?.Mass).toBe(
      1.25,
    );

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scenegraph-export-"));
    const scriptPath = path.join(tempDir, "onGrabSceneGraphContract.ts");
    fs.writeFileSync(scriptPath, "$.onGrab(() => {});\n");

    const result = new ClusterScriptAnalyzer(fixturePath).analyzeTypeScriptFile(
      scriptPath,
    );

    expect(result.issues).toHaveLength(0);
    expect(result.componentRequests).toMatchObject([
      {
        api: "$.onGrab",
        componentTypes: [
          "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
        ],
        target: {
          resolution: "resolved",
          gameObjectPath: "Root/Item",
        },
        verificationStatus: "satisfied",
      },
    ]);
  });

  it("does not treat a disabled required component as satisfying analysis", () => {
    const fixture = fs
      .readFileSync(fixturePath, "utf8")
      .replace(
        /(type = "ClusterVR\.CreatorKit\.Item\.Implements\.GrabbableItem"\r?\nenabled = )true/,
        "$1false",
      );
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scenegraph-export-"));
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");
    const scriptPath = path.join(tempDir, "onGrabSceneGraphContract.ts");
    fs.writeFileSync(sceneGraphPath, fixture);
    fs.writeFileSync(scriptPath, "$.onGrab(() => {});\n");

    const result = new ClusterScriptAnalyzer(
      sceneGraphPath,
    ).analyzeTypeScriptFile(scriptPath);

    expect(result.componentRequests[0]?.verificationStatus).toBe("missing");
    expect(
      result.componentRequests[0]?.validation.missingComponentTypes,
    ).toContain("ClusterVR.CreatorKit.Item.Implements.GrabbableItem");
  });
});
