import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { ClusterScriptAnalyzer } from "../../../src/analysis/analyzer";
import { SceneGraphParser } from "../../../src/sceneGraph/sceneGraphParser";

describe("ClusterScriptAnalyzer: component-lookups", () => {
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

  it("matches a generic lookup target and short component type name", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(
      tsFilePath,
      '$.subNode("API_Label").getUnityComponent("MeshRenderer");\n',
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

[[gameObjects]]
id = "cube-object"
path = "Item/Cube"
name = "Cube"
parent = "Item"

[[gameObjects]]
id = "label-object"
path = "Item/Cube/API_Label"
name = "API_Label"
parent = "Item/Cube"

[[gameObjects.components]]
type = "UnityEngine.MeshRenderer"
enabled = true
`,
    );

    const result = new ClusterScriptAnalyzer(
      sceneGraphPath,
    ).analyzeTypeScriptFile(tsFilePath);

    expect(result.summary.componentRequestCounts.optionalLookupMissing).toBe(0);
    expect(result.componentRequests[0]).toMatchObject({
      api: "$.getUnityComponent",
      lookupTargetPath: ["API_Label"],
      componentTypes: ["MeshRenderer"],
      verificationStatus: "satisfied",
      validation: {
        presentComponentTypes: ["MeshRenderer"],
        missingComponentTypes: [],
        matchedComponents: [
          {
            gameObjectPath: "Item/Cube/API_Label",
            componentType: "UnityEngine.MeshRenderer",
          },
        ],
      },
    });
  });

  it("reports a missing lookup type on a generic receiver target", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(
      tsFilePath,
      '$.navigate("API_Label").getUnityComponent("MeshRenderer");\n',
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

[[gameObjects]]
id = "label-object"
path = "Item/API_Label"
name = "API_Label"
parent = "Item"
`,
    );

    const result = new ClusterScriptAnalyzer(
      sceneGraphPath,
    ).analyzeTypeScriptFile(tsFilePath);

    expect(result.summary.componentRequestCounts.optionalLookupMissing).toBe(1);
    expect(result.componentRequests[0]).toMatchObject({
      api: "$.getUnityComponent",
      lookupTargetPath: ["API_Label"],
      verificationStatus: "missing",
      verificationReason:
        'The component is not present on lookup target "API_Label"; getUnityComponent returns null. Add it only if that null result is unintended.',
      validation: {
        missingComponentTypes: ["MeshRenderer"],
      },
    });
  });

  it("matches every scene component with the same short type name", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(tsFilePath, '$.getUnityComponent("SharedType");\n');
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
type = "First.Namespace.SharedType"
enabled = true

[[gameObjects.components]]
type = "Second.Namespace.SharedType"
enabled = true
`,
    );

    const result = new ClusterScriptAnalyzer(
      sceneGraphPath,
    ).analyzeTypeScriptFile(tsFilePath);

    expect(result.componentRequests[0]).toMatchObject({
      componentTypes: ["SharedType"],
      verificationStatus: "satisfied",
      validation: {
        presentComponentTypes: ["SharedType"],
        missingComponentTypes: [],
        matchedComponents: [
          { componentType: "First.Namespace.SharedType" },
          { componentType: "Second.Namespace.SharedType" },
        ],
      },
    });
  });


});
