import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { ClusterScriptAnalyzer } from "../../../src/analysis/analyzer";
import { SceneGraphParser } from "../../../src/sceneGraph/sceneGraphParser";

describe("ClusterScriptAnalyzer: state-and-arguments", () => {
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


});
