import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { ClusterScriptAnalyzer } from "./analyzer";
import { SceneGraphParser } from "../sceneGraph/sceneGraphParser";

describe("ClusterScriptAnalyzer", () => {
  it("validates scriptable item behavior against the matching scene object", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(tsFilePath, "$.onGrab(() => {});\n");
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
type = "ClusterVR.CreatorKit.Item.Implements.GrabbableItem"
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

[[gameObjects]]
id = "other-object"
path = "Other"
name = "Other"
parent = ""
`,
    );

    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
    const result = analyzer.analyzeTypeScriptFile(tsFilePath);

    expect(result.issues).toHaveLength(0);
    expect(result.componentRequests).toMatchObject([
      {
        api: "$.onGrab",
        componentTypes: [
          "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
        ],
        target: {
          resolution: "resolved",
          gameObjectId: "item-object",
          gameObjectPath: "Item",
        },
        verificationStatus: "satisfied",
        validation: {
          presentComponentTypes: [
            "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
          ],
          missingComponentTypes: [],
          matchedComponents: [
            {
              gameObjectId: "item-object",
              gameObjectPath: "Item",
              componentType:
                "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
            },
          ],
        },
      },
    ]);
  });

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

  it("validates the specific ScriptableItem that matches the analyzed file", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "setRotationScript.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(
      tsFilePath,
      "$.setRotation(new Quaternion().setFromEulerAngles(new Vector3(0, 90, 0)));\n",
    );
    fs.writeFileSync(
      sceneGraphPath,
      `
project = "TestProject"

[[gameObjects]]
id = "movable-object"
path = "Movable"
name = "Movable"
parent = ""

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.MovableItem"
enabled = true

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "onGrabScript"

[[gameObjects]]
id = "rotation-object"
path = "setRotation"
name = "setRotation"
parent = ""

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.MovableItem"
enabled = false

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "setRotationScript"
`,
    );

    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
    const result = analyzer.analyzeTypeScriptFile(tsFilePath);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.apiCall).toBe("setRotation");
    expect(result.issues[0]?.requiredComponents).toEqual([
      "ClusterVR.CreatorKit.Item.Implements.MovableItem",
    ]);
    expect(result.componentRequests).toMatchObject([
      {
        api: "$.setRotation",
        target: {
          resolution: "resolved",
          gameObjectId: "rotation-object",
          gameObjectPath: "setRotation",
        },
        verificationStatus: "missing",
        validation: {
          presentComponentTypes: [],
          missingComponentTypes: [
            "ClusterVR.CreatorKit.Item.Implements.MovableItem",
          ],
          matchedComponents: [],
        },
      },
    ]);
  });

  it("marks a request ambiguous when one script is attached to multiple objects", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(tsFilePath, "$.onGrab(() => {});\n");
    fs.writeFileSync(
      sceneGraphPath,
      `
project = "TestProject"

[[gameObjects]]
id = "first-object"
path = "Root/Duplicate-1"
name = "Duplicate"
parent = "Root"

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "sample.ts"

[[gameObjects]]
id = "second-object"
path = "Root/Duplicate-2"
name = "Duplicate"
parent = "Root"

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.GrabbableItem"
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

    expect(result.componentRequests[0]).toMatchObject({
      verificationStatus: "ambiguous",
      target: {
        resolution: "ambiguous",
        candidates: [
          {
            gameObjectId: "first-object",
            gameObjectPath: "Root/Duplicate-1",
          },
          {
            gameObjectId: "second-object",
            gameObjectPath: "Root/Duplicate-2",
          },
        ],
      },
    });
    expect(result.issues).toHaveLength(0);
    const report = analyzer.generateReport(
      new Map([[tsFilePath, result]]),
    );
    expect(report).toContain("[AMBIGUOUS] $.onGrab");
    expect(report).toContain("Root/Duplicate-1 (first-object)");
    expect(report).toContain("Root/Duplicate-2 (second-object)");
    expect(report).toContain("ambiguous: 1");
    expect(report).not.toContain("No issues found!");
    expect(report).toContain("component requirements need review");
  });

  it("does not infer missing components when the source target is unresolved", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "unattached.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(tsFilePath, "$.setPosition(position);\n");
    fs.writeFileSync(
      sceneGraphPath,
      `
project = "TestProject"

[[gameObjects]]
id = "other-object"
path = "Other"
name = "Other"
parent = ""

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "other.ts"
`,
    );

    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
    const result = analyzer.analyzeTypeScriptFile(tsFilePath);

    expect(result.issues).toHaveLength(0);
    expect(result.componentRequests[0]).toMatchObject({
      target: { resolution: "unresolved" },
      verificationStatus: "unverified",
      verificationReason:
        "No ScriptableItem GameObject could be mapped to this source file.",
    });
  });

  it("reports conditional component requests with their source condition", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(
      tsFilePath,
      "if (canMove) {\n  $.setPosition(position);\n}\n",
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
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "sample.ts"
`,
    );

    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
    const result = analyzer.analyzeTypeScriptFile(tsFilePath);
    const report = analyzer.generateReport(
      new Map([[tsFilePath, result]]),
    );

    expect(result.componentRequests[0]).toMatchObject({
      verificationStatus: "missing",
      occurrences: [
        { condition: { kind: "conditional", expression: "canMove" } },
      ],
    });
    expect(report).toContain("[MISSING] $.setPosition at 2:2 when (canMove)");
    expect(report).toContain("Missing: ClusterVR.CreatorKit.Item.Implements.MovableItem");
  });

  it("warns by default and supports strict errors for a missing literal component lookup", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(
      tsFilePath,
      '$.getUnityComponent("UnityEngine.Rigidbody");\n',
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
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "sample.ts"
`,
    );

    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
    const result = analyzer.analyzeTypeScriptFile(tsFilePath);

    expect(result.issues).toHaveLength(0);
    expect(result.summary.errorCount).toBe(0);
    expect(result.summary.warningCount).toBe(0);
    expect(result.summary.componentRequestCounts).toMatchObject({
      missing: 0,
      optionalLookupMissing: 1,
    });
    expect(result.componentRequests[0]).toMatchObject({
      api: "$.getUnityComponent",
      kind: "optional-lookup",
      componentTypes: ["UnityEngine.Rigidbody"],
      target: { resolution: "resolved", gameObjectId: "item-object" },
      verificationStatus: "missing",
      verificationReason:
        "The component is not present on the ScriptableItem GameObject; getUnityComponent returns null. Add it only if that null result is unintended.",
      validation: {
        missingComponentTypes: ["UnityEngine.Rigidbody"],
      },
    });
    expect(analyzer.generateComponentRequirementReport(result)).toContain(
      "[OPTIONAL LOOKUP MISSING] $.getUnityComponent",
    );

    const strictResult = new ClusterScriptAnalyzer(sceneGraphPath, {
      strictOptionalLookups: true,
    }).analyzeTypeScriptFile(tsFilePath);

    expect(strictResult.summary).toMatchObject({
      totalIssues: 1,
      errorCount: 1,
      componentRequestCounts: { optionalLookupMissing: 1 },
    });
    expect(strictResult.componentRequests[0]).toMatchObject({
      severity: "error",
      verificationStatus: "missing",
    });
    expect(
      new ClusterScriptAnalyzer(sceneGraphPath, {
        strictOptionalLookups: true,
      }).generateComponentRequirementReport(strictResult),
    ).toContain("[OPTIONAL LOOKUP ERROR] $.getUnityComponent");
  });

  it("considers a disabled component present for optional component lookups", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(
      tsFilePath,
      '$.getUnityComponent("UnityEngine.Rigidbody");\n',
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
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "sample.ts"

[[gameObjects.components]]
type = "UnityEngine.Rigidbody"
enabled = false
`,
    );

    const result = new ClusterScriptAnalyzer(
      sceneGraphPath,
    ).analyzeTypeScriptFile(tsFilePath);

    expect(result.summary.componentRequestCounts.optionalLookupMissing).toBe(0);
    expect(result.componentRequests[0]).toMatchObject({
      verificationStatus: "satisfied",
      validation: {
        presentComponentTypes: ["UnityEngine.Rigidbody"],
        missingComponentTypes: [],
      },
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

  it("resolves a nested script from Source_Code_Asset by basename", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");
    const sourceDir = path.join(tempDir, "src");
    const sourceFilePath = path.join(sourceDir, "setRotationScript.ts");

    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      sourceFilePath,
      "$.setRotation(new Quaternion().setFromEulerAngles(new Vector3(0, 90, 0)));\n",
    );
    fs.writeFileSync(
      sceneGraphPath,
      `
project = "TestProject"

[[gameObjects]]
id = "rotation-object"
path = "setRotation"
name = "setRotation"
parent = ""

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "setRotationScript"
`,
    );

    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
    const result = analyzer.analyzeTypeScriptFile();

    expect(result.filePath).toBe(sourceFilePath);
  });

  it("resolves a script from Source_Code_Asset when no file path is provided", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");
    const sourceDir = path.join(tempDir, "src");
    const sourceFilePath = path.join(sourceDir, "setPosition.ts");

    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(sourceFilePath, "$.setPosition(new Vector3(1, 2, 3));\n");
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
Source_Code_Asset = "src/setPosition"
`,
    );

    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
    const result = analyzer.analyzeTypeScriptFile();

    expect(result.filePath).toBe(sourceFilePath);
  });
});
