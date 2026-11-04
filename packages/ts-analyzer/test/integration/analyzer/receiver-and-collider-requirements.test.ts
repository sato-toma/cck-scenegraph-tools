import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { ClusterScriptAnalyzer } from "../../../src/analysis/analyzer";

function analyzeOnCollide(isTrigger?: boolean) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
  const tsFilePath = path.join(tempDir, "onCollideScript.ts");
  const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

  fs.writeFileSync(tsFilePath, "$.onCollide(() => {});\n");
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
type = "UnityEngine.Rigidbody"
enabled = true

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "onCollideScript"

[[gameObjects]]
id = "collider-child"
path = "Item/Cube"
name = "Cube"
parent = "Item"

[[gameObjects.components]]
type = "UnityEngine.BoxCollider"
enabled = true
${isTrigger === undefined ? "" : `[gameObjects.components.properties]\nIs_Trigger = ${isTrigger}\n`}
`,
  );

  return new ClusterScriptAnalyzer(sceneGraphPath).analyzeTypeScriptFile(
    tsFilePath,
  );
}

describe("ClusterScriptAnalyzer receiver and collider requirements", () => {
  it("does not require MovableItem for PlayerScript position and rotation APIs", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "player-script.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(
      tsFilePath,
      "_.setPosition(new Vector3(1, 2, 3));\n_.setRotation(new Quaternion());\n",
    );
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
type = "ClusterVR.CreatorKit.Item.Implements.PlayerScript"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "player-script.ts"
`,
    );

    const result = new ClusterScriptAnalyzer(sceneGraphPath).analyzeTypeScriptFile(
      tsFilePath,
    );

    expect(result.issues).toHaveLength(0);
    expect(result.componentRequests).toHaveLength(0);
  });

  it("rejects a trigger Collider for onCollide", () => {
    const result = analyzeOnCollide(true);

    expect(result.issues).toMatchObject([
      {
        code: "MISSING_COMPONENT",
        apiCall: "onCollide",
        requiredComponents: expect.arrayContaining([
          "UnityEngine.BoxCollider | UnityEngine.CapsuleCollider | UnityEngine.MeshCollider | UnityEngine.SphereCollider | UnityEngine.WheelCollider (Is_Trigger=false)",
        ]),
      },
    ]);
  });

  it("marks the Collider requirement unverified when Is_Trigger is not exported", () => {
    const result = analyzeOnCollide();

    expect(result.issues).toMatchObject([
      {
        code: "UNVERIFIED_COMPONENT_REQUIREMENT",
        severity: "warning",
        apiCall: "onCollide",
      },
    ]);
    expect(
      result.componentRequests.find((request) => request.componentProperties),
    ).toMatchObject({
      verificationStatus: "unverified",
    });
  });

  it("accepts a non-trigger Collider for onCollide", () => {
    const result = analyzeOnCollide(false);

    expect(result.issues).toHaveLength(0);
    expect(
      result.componentRequests.find((request) => request.componentProperties),
    ).toMatchObject({
      api: "$.onCollide",
      verificationStatus: "satisfied",
      validation: {
        presentComponentTypes: ["UnityEngine.BoxCollider"],
        missingComponentTypes: [],
        matchedComponents: [
          {
            gameObjectId: "collider-child",
            gameObjectPath: "Item/Cube",
            componentType: "UnityEngine.BoxCollider",
          },
        ],
      },
    });
  });
});
