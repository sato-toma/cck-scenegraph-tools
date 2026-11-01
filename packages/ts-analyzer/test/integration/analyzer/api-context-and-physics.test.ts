import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { ClusterScriptAnalyzer } from "../../../src/analysis/analyzer";
import { SceneGraphParser } from "../../../src/sceneGraph/sceneGraphParser";

describe("ClusterScriptAnalyzer: api-context-and-physics", () => {
  it("requires MovableItem for addForce", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(
      tsFilePath,
      "$.onPhysicsUpdate((dt) => {\n  $.addForce(new Vector3(0, 1, 0));\n});\n",
    );

    const analyzeWithComponents = (componentTypes: string[]) => {
      const componentEntries = componentTypes
        .map(
          (type) => `
[[gameObjects.components]]
type = "${type}"
enabled = true`,
        )
        .join("\n");

      fs.writeFileSync(
        sceneGraphPath,
        `
project = "TestProject"

[[gameObjects]]
id = "item-object"
path = "Item"
name = "Item"
parent = ""

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.Item"
enabled = true

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "sample.ts"
${componentEntries}
`,
      );

      const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
      return analyzer.analyzeTypeScriptFile(tsFilePath);
    };

    const withRigidbodyOnly = analyzeWithComponents(["UnityEngine.Rigidbody"]);
    expect(withRigidbodyOnly.issues).toHaveLength(1);
    expect(withRigidbodyOnly.issues[0]?.apiCall).toBe("addForce");
    expect(withRigidbodyOnly.issues[0]?.requiredComponents).toEqual([
      "ClusterVR.CreatorKit.Item.Implements.MovableItem",
    ]);

    const withMovableItem = analyzeWithComponents([
      "UnityEngine.Rigidbody",
      "ClusterVR.CreatorKit.Item.Implements.MovableItem",
    ]);
    expect(withMovableItem.issues).toHaveLength(0);
    expect(withMovableItem.componentRequests).toMatchObject([
      {
        api: "$.addForce",
        componentTypes: [
          "ClusterVR.CreatorKit.Item.Implements.MovableItem",
        ],
        verificationStatus: "satisfied",
      },
    ]);
  });

  it("reports addForce calls outside onPhysicsUpdate", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(
      sceneGraphPath,
      `
project = "TestProject"

[[gameObjects]]
id = "item-object"
path = "Item"
name = "Item"
parent = ""

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.Item"
enabled = true

[[gameObjects.components]]
type = "UnityEngine.Rigidbody"
enabled = true

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.MovableItem"
enabled = true

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "sample.ts"
`,
    );

    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
    for (const source of [
      "$.addForce(new Vector3(0, 1, 0));",
      "$.onUpdate(() => $.addForce(new Vector3(0, 1, 0)));",
    ]) {
      fs.writeFileSync(tsFilePath, source);
      const result = analyzer.analyzeTypeScriptFile(tsFilePath);

      expect(result.issues).toMatchObject([
        {
          code: "INVALID_API_CONTEXT",
          severity: "error",
          apiCall: "addForce",
        },
      ]);
    }
  });


});
