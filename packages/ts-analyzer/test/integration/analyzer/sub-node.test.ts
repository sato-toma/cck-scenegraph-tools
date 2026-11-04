import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { ClusterScriptAnalyzer } from "../../../src/analysis/analyzer";
import { SceneGraphParser } from "../../../src/sceneGraph/sceneGraphParser";

describe("ClusterScriptAnalyzer: sub-node", () => {
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


});
