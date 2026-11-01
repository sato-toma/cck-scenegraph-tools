import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { ClusterScriptAnalyzer } from "../../../src/analysis/analyzer";
import { SceneGraphParser } from "../../../src/sceneGraph/sceneGraphParser";

describe("ClusterScriptAnalyzer: api-component-requirements", () => {
  it("requires MovableItem for setPosition and setRotation", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(
      tsFilePath,
      "$.setPosition(new Vector3(1, 2, 3));\n$.setRotation(new Quaternion().setFromEulerAngles(new Vector3(0, 90, 0)));\n",
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
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "sample.ts"
`,
    );

    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
    const result = analyzer.analyzeTypeScriptFile(tsFilePath);

    expect(result.issues).toHaveLength(2);
    expect(result.issues.map((issue) => issue.apiCall)).toEqual([
      "setPosition",
      "setRotation",
    ]);
    expect(result.issues[0]?.requiredComponents).toEqual([
      "ClusterVR.CreatorKit.Item.Implements.MovableItem",
    ]);
    expect(result.summary.componentRequestCounts).toEqual({
      satisfied: 0,
      missing: 2,
      ambiguous: 0,
      unsupported: 0,
      unverified: 0,
      optionalLookupMissing: 0,
    });
  });

  it.each([
    ["$", "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"],
    ["_", "ClusterVR.CreatorKit.Item.Implements.PlayerScript"],
  ])(
    "requires WorldItemReferenceList for %s.worldItemReference",
    (receiver, scriptType) => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
      const tsFilePath = path.join(tempDir, "world-item-reference.ts");
      const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

      fs.writeFileSync(
        tsFilePath,
        `${receiver}.worldItemReference("door");\n`,
      );

      const analyzeWithComponent = (enabled?: boolean) => {
        const componentEntry =
          enabled === undefined
            ? ""
            : `
[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.WorldItemReferenceList"
enabled = ${enabled}
`;
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
type = "${scriptType}"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "world-item-reference.ts"
${componentEntry}
`,
        );

        const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
        return { analyzer, result: analyzer.analyzeTypeScriptFile(tsFilePath) };
      };

      const missing = analyzeWithComponent();
      expect(missing.result.issues).toMatchObject([
        {
          code: "MISSING_COMPONENT",
          apiCall: "worldItemReference",
          requiredComponents: [
            "ClusterVR.CreatorKit.Item.Implements.WorldItemReferenceList",
          ],
        },
      ]);

      const disabled = analyzeWithComponent(false);
      expect(disabled.result.issues).toHaveLength(1);

      const enabled = analyzeWithComponent(true);
      expect(enabled.result.issues).toHaveLength(0);
      expect(enabled.analyzer.getScriptSourceFiles()).toContain(tsFilePath);
    },
  );

  it("requires GrabbableItem for onUse and passes when the component exists", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(tsFilePath, "$.onUse((isDown) => {});\n");

    const analyzeWithGrabbableItem = (includeComponent: boolean) => {
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
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "sample.ts"
${includeComponent ? `
[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.GrabbableItem"
enabled = true
` : ""}
`,
      );
      return new ClusterScriptAnalyzer(sceneGraphPath).analyzeTypeScriptFile(
        tsFilePath,
      );
    };

    const missing = analyzeWithGrabbableItem(false);
    expect(missing.issues).toHaveLength(1);
    expect(missing.issues[0]).toMatchObject({
      apiCall: "onUse",
      requiredComponents: [
        "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
      ],
    });
    expect(missing.componentRequests[0]).toMatchObject({
      api: "$.onUse",
      verificationStatus: "missing",
      validation: {
        missingComponentTypes: [
          "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
        ],
      },
    });

    const satisfied = analyzeWithGrabbableItem(true);
    expect(satisfied.issues).toHaveLength(0);
    expect(satisfied.componentRequests[0]).toMatchObject({
      api: "$.onUse",
      verificationStatus: "satisfied",
    });
  });

  it("requires RidableItem for onRide and only passes when the component is enabled", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(tsFilePath, "$.onRide((isGetOn) => {});\n");

    const analyzeWithRidableItem = (componentEnabled?: boolean) => {
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
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "sample.ts"
${componentEnabled === undefined ? "" : `
[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.RidableItem"
enabled = ${componentEnabled}
`}
`,
      );
      return new ClusterScriptAnalyzer(sceneGraphPath).analyzeTypeScriptFile(
        tsFilePath,
      );
    };

    const missing = analyzeWithRidableItem();
    expect(missing.issues).toHaveLength(1);
    expect(missing.issues[0]).toMatchObject({
      apiCall: "onRide",
      requiredComponents: [
        "ClusterVR.CreatorKit.Item.Implements.RidableItem",
      ],
    });
    expect(missing.componentRequests[0]).toMatchObject({
      api: "$.onRide",
      verificationStatus: "missing",
      validation: {
        missingComponentTypes: [
          "ClusterVR.CreatorKit.Item.Implements.RidableItem",
        ],
      },
    });

    const disabled = analyzeWithRidableItem(false);
    expect(disabled.issues).toHaveLength(1);
    expect(disabled.componentRequests[0]).toMatchObject({
      api: "$.onRide",
      verificationStatus: "missing",
    });

    const satisfied = analyzeWithRidableItem(true);
    expect(satisfied.issues).toHaveLength(0);
    expect(satisfied.componentRequests[0]).toMatchObject({
      api: "$.onRide",
      verificationStatus: "satisfied",
    });
  });

  it("requires an enabled PlayerScript component for setPlayerScript", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(tsFilePath, "$.setPlayerScript(player);\n");

    const analyzeWithPlayerScript = (componentEnabled?: boolean) => {
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
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "sample.ts"
${componentEnabled === undefined ? "" : `
[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.PlayerScript"
enabled = ${componentEnabled}
`}
`,
      );
      return new ClusterScriptAnalyzer(sceneGraphPath).analyzeTypeScriptFile(
        tsFilePath,
      );
    };

    const missing = analyzeWithPlayerScript();
    expect(missing.issues).toHaveLength(1);
    expect(missing.issues[0]).toMatchObject({
      apiCall: "setPlayerScript",
      requiredComponents: [
        "ClusterVR.CreatorKit.Item.Implements.PlayerScript",
      ],
    });
    expect(missing.componentRequests[0]).toMatchObject({
      api: "$.setPlayerScript",
      verificationStatus: "missing",
      validation: {
        missingComponentTypes: [
          "ClusterVR.CreatorKit.Item.Implements.PlayerScript",
        ],
      },
    });

    const disabled = analyzeWithPlayerScript(false);
    expect(disabled.issues).toHaveLength(1);
    expect(disabled.componentRequests[0]).toMatchObject({
      api: "$.setPlayerScript",
      verificationStatus: "missing",
    });

    const satisfied = analyzeWithPlayerScript(true);
    expect(satisfied.issues).toHaveLength(0);
    expect(satisfied.componentRequests[0]).toMatchObject({
      api: "$.setPlayerScript",
      verificationStatus: "satisfied",
    });
  });

  it("requires GrabbableItem for getGrabbingPlayer and only passes when enabled", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(tsFilePath, "$.getGrabbingPlayer();\n");

    const analyzeWithGrabbableItem = (componentEnabled?: boolean) => {
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
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "sample.ts"
${componentEnabled === undefined ? "" : `
[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.GrabbableItem"
enabled = ${componentEnabled}
`}
`,
      );
      return new ClusterScriptAnalyzer(sceneGraphPath).analyzeTypeScriptFile(
        tsFilePath,
      );
    };

    const missing = analyzeWithGrabbableItem();
    expect(missing.issues).toHaveLength(1);
    expect(missing.issues[0]).toMatchObject({
      apiCall: "getGrabbingPlayer",
      requiredComponents: [
        "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
      ],
    });
    expect(missing.componentRequests[0]).toMatchObject({
      api: "$.getGrabbingPlayer",
      verificationStatus: "missing",
      validation: {
        missingComponentTypes: [
          "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
        ],
      },
    });

    const disabled = analyzeWithGrabbableItem(false);
    expect(disabled.issues).toHaveLength(1);
    expect(disabled.componentRequests[0]).toMatchObject({
      api: "$.getGrabbingPlayer",
      verificationStatus: "missing",
    });

    const satisfied = analyzeWithGrabbableItem(true);
    expect(satisfied.issues).toHaveLength(0);
    expect(satisfied.componentRequests[0]).toMatchObject({
      api: "$.getGrabbingPlayer",
      verificationStatus: "satisfied",
    });
  });

  it("requires a Collider for onInteract", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "onInteractScript.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(tsFilePath, "$.onInteract(() => {});\n");
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
Source_Code_Asset = "onInteractScript"
`,
    );

    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
    const result = analyzer.analyzeTypeScriptFile(tsFilePath);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.apiCall).toBe("onInteract");
    expect(result.issues[0]?.requiredComponents).toEqual([
      "UnityEngine.BoxCollider | UnityEngine.SphereCollider | UnityEngine.CapsuleCollider | UnityEngine.MeshCollider | UnityEngine.WheelCollider",
    ]);
  });

  it("does not flag onInteract when any Collider type is present", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "onInteractScript.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(tsFilePath, "$.onInteract(() => {});\n");
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
type = "UnityEngine.SphereCollider"
enabled = true

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "onInteractScript"
`,
    );

    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
    const result = analyzer.analyzeTypeScriptFile(tsFilePath);

    expect(result.issues).toHaveLength(0);
    expect(result.componentRequests[0]).toMatchObject({
      api: "$.onInteract",
      target: {
        resolution: "resolved",
        gameObjectId: "item-object",
      },
      verificationStatus: "satisfied",
      validation: {
        presentComponentTypes: ["UnityEngine.SphereCollider"],
      },
    });
  });

  it("accepts an enabled Collider on a child GameObject for onInteract", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "onInteractScript.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(tsFilePath, "$.onInteract(() => {});\n");
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
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "onInteractScript"

[[gameObjects]]
id = "collider-child"
path = "Item/Cube"
name = "Cube"
parent = "Item"

[[gameObjects.components]]
type = "UnityEngine.BoxCollider"
enabled = true
`,
    );

    const result = new ClusterScriptAnalyzer(sceneGraphPath).analyzeTypeScriptFile(
      tsFilePath,
    );

    expect(result.issues).toHaveLength(0);
    expect(result.componentRequests[0]).toMatchObject({
      api: "$.onInteract",
      target: {
        resolution: "resolved",
        gameObjectId: "item-object",
      },
      verificationStatus: "satisfied",
      validation: {
        presentComponentTypes: ["UnityEngine.BoxCollider"],
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
