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

  it("requires setStateCompat to be called inside a callback", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(sceneGraphPath, 'project = "TestProject"\n');
    const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);

    fs.writeFileSync(
      tsFilePath,
      '$.setStateCompat("this", "key", true);\n',
    );
    const outsideCallback = analyzer.analyzeTypeScriptFile(tsFilePath);
    expect(outsideCallback.issues).toMatchObject([
      {
        code: "INVALID_API_CONTEXT",
        severity: "error",
        apiCall: "setStateCompat",
        message:
          "Method 'setStateCompat' must be called inside a callback.",
      },
    ]);

    fs.writeFileSync(
      tsFilePath,
      '$.onUpdate(() => $.setStateCompat("this", "key", true));\n',
    );
    const insideCallback = analyzer.analyzeTypeScriptFile(tsFilePath);
    expect(insideCallback.issues).toHaveLength(0);

    fs.writeFileSync(
      tsFilePath,
      [
        "$.onUpdate(() => {",
        "  const updateState = () => $.setStateCompat('this', 'key', true);",
        "  updateState();",
        "});",
      ].join("\n"),
    );
    const nestedFunction = analyzer.analyzeTypeScriptFile(tsFilePath);
    expect(nestedFunction.issues).toMatchObject([
      {
        code: "UNVERIFIED_API_CONTEXT",
        severity: "warning",
        apiCall: "setStateCompat",
      },
    ]);
  });

  it("warns for invalid setStateCompat targets and string values", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(sceneGraphPath, 'project = "TestProject"\n');
    fs.writeFileSync(
      tsFilePath,
      [
        "$.onUpdate(() => {",
        '  $.setStateCompat("global", "custom-key", true);',
        '  $.setStateCompat("this", "another-key", "text");',
        '  $.setStateCompat("owner", "any-string-key", false);',
        "});",
      ].join("\n"),
    );

    const result = new ClusterScriptAnalyzer(sceneGraphPath).analyzeTypeScriptFile(
      tsFilePath,
    );

    expect(result.issues).toMatchObject([
      {
        severity: "warning",
        code: "INVALID_API_ARGUMENT",
        apiCall: "setStateCompat",
        message:
          'setStateCompat target must be "this" or "owner"; received "global".',
      },
      {
        severity: "warning",
        code: "INVALID_API_ARGUMENT",
        apiCall: "setStateCompat",
        message:
          "setStateCompat value does not support strings; use a number, boolean, Vector2, or Vector3.",
      },
    ]);
  });

  it("allows clearVisiblePlayers without component constraints", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(tsFilePath, "$.clearVisiblePlayers();\n");
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

    const result = new ClusterScriptAnalyzer(sceneGraphPath).analyzeTypeScriptFile(
      tsFilePath,
    );

    expect(result.issues).toHaveLength(0);
    expect(result.componentRequests).toHaveLength(0);
  });

  it("warns when setVisiblePlayers receives null or more than 64 literal players", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");
    const limitPlayers = Array.from(
      { length: 64 },
      (_, index) => `player${index + 1}`,
    ).join(", ");
    const overLimitPlayers = Array.from(
      { length: 65 },
      (_, index) => `player${index + 1}`,
    ).join(", ");
    const overLimitSparseArray = `[${",".repeat(65)}]`;

    fs.writeFileSync(sceneGraphPath, 'project = "TestProject"\n');
    fs.writeFileSync(
      tsFilePath,
      [
        "$.setVisiblePlayers(null);",
        "$.setVisiblePlayers(null!);",
        `$.setVisiblePlayers([${limitPlayers}]);`,
        `$.setVisiblePlayers([${overLimitPlayers}]);`,
        `$.setVisiblePlayers(${overLimitSparseArray});`,
        "$.setVisiblePlayers([player1, player2]);",
        "$.setVisiblePlayers(players);",
        "$.setVisiblePlayers([...players]);",
      ].join("\n"),
    );

    const result = new ClusterScriptAnalyzer(sceneGraphPath).analyzeTypeScriptFile(
      tsFilePath,
    );

    expect(result.issues).toMatchObject([
      {
        line: 1,
        severity: "warning",
        code: "INVALID_API_ARGUMENT",
        apiCall: "setVisiblePlayers",
        message:
          "setVisiblePlayers does not accept null; pass an array of PlayerHandle values.",
      },
      {
        line: 2,
        severity: "warning",
        code: "INVALID_API_ARGUMENT",
        apiCall: "setVisiblePlayers",
        message:
          "setVisiblePlayers does not accept null; pass an array of PlayerHandle values.",
      },
      {
        line: 4,
        severity: "warning",
        code: "INVALID_API_ARGUMENT",
        apiCall: "setVisiblePlayers",
        message:
          "setVisiblePlayers accepts at most 64 players; received 65.",
      },
      {
        line: 5,
        severity: "warning",
        code: "INVALID_API_ARGUMENT",
        apiCall: "setVisiblePlayers",
        message:
          "setVisiblePlayers accepts at most 64 players; received 65.",
      },
    ]);
  });

  it("checks literal subNode names against the ScriptableItem descendants", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "sample.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    fs.writeFileSync(
      tsFilePath,
      [
        '$.subNode("Child");',
        '$.subNode("Nested");',
        '$.subNode("Missing");',
        '$.subNode("Item");',
        "$.subNode(nodeName);",
        '// $.subNode("Commented");',
        `const example = '$.subNode("StringContent")';`,
      ].join("\n"),
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
id = "child-object"
path = "Item/Child"
name = "Child"
parent = "item-object"

[[gameObjects]]
id = "nested-object"
path = "Item/Child/Nested"
name = "Nested"
parent = "child-object"
`,
    );

    const result = new ClusterScriptAnalyzer(sceneGraphPath).analyzeTypeScriptFile(
      tsFilePath,
    );

    expect(result.issues).toMatchObject([
      {
        line: 3,
        severity: "warning",
        code: "MISSING_SUBNODE",
        apiCall: "subNode",
        message:
          'No child GameObject named "Missing" was found under ScriptableItem "Item".',
      },
      {
        line: 4,
        severity: "warning",
        code: "MISSING_SUBNODE",
        apiCall: "subNode",
        message:
          'No child GameObject named "Item" was found under ScriptableItem "Item".',
      },
      {
        line: 5,
        severity: "warning",
        code: "UNVERIFIED_SUBNODE_LOOKUP",
        apiCall: "subNode",
      },
    ]);
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
