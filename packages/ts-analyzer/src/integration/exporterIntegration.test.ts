import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { ClusterScriptAnalyzer } from "../analysis/analyzer";
import { SceneGraphParser } from "../sceneGraph/sceneGraphParser";
import { WorldUploadValidator } from "../validation/worldUploadValidator";

const fixturePath = path.join(
  __dirname,
  "..",
  "fixtures",
  "scene-graph-export.toml",
);

function analyzeExporterFixture(
  source: string,
  fileName = "sample.ts",
  transformGraph: (graph: string) => string = (graph) => graph,
) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scenegraph-export-"));
  const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");
  const scriptPath = path.join(tempDir, fileName);
  const fixture = fs.readFileSync(fixturePath, "utf8");
  fs.writeFileSync(sceneGraphPath, transformGraph(fixture));
  fs.writeFileSync(scriptPath, source);

  const analyzer = new ClusterScriptAnalyzer(sceneGraphPath);
  return {
    analyzer,
    result: analyzer.analyzeTypeScriptFile(scriptPath),
  };
}

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
    const scriptPath = path.join(tempDir, "sample.ts");
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
    const scriptPath = path.join(tempDir, "sample.ts");
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

  it("distinguishes verified, missing, ambiguous, unsupported, and unverified requests", () => {
    const satisfied = analyzeExporterFixture("$.onGrab(() => {});\n");
    const missing = analyzeExporterFixture(
      "if (canGrab) {\n  $.onGrab(() => {});\n}\n",
      "sample.ts",
      (graph) =>
        graph.replace(
          /(type = "ClusterVR\.CreatorKit\.Item\.Implements\.GrabbableItem"\r?\nenabled = )true/,
          "$1false",
        ),
    );
    const ambiguous = analyzeExporterFixture(
      "$.onGrab(() => {});\n",
      "sample.ts",
      (graph) => `${graph}

[[gameObjects]]
id = "GlobalObjectId_V1-0-duplicate"
path = "Root/Item Copy"
name = "Item"
parent = "Root"

[[gameObjects.components]]
id = "duplicate-scriptable-item"
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true

[gameObjects.components.properties]
Source_Code_Asset = "sample"
`,
    );
    const unsupported = analyzeExporterFixture(
      "$.getUnityComponent(componentType);\n",
    );
    const unverified = analyzeExporterFixture(
      '$.getUnityComponent("UnityEngine.Rigidbody");\n',
    );
    const unresolved = analyzeExporterFixture(
      "$.setPosition(position);\n",
      "unattached.ts",
    );

    expect(satisfied.result.componentRequests[0]?.verificationStatus).toBe(
      "satisfied",
    );
    expect(missing.result.componentRequests[0]).toMatchObject({
      verificationStatus: "missing",
      occurrences: [
        { condition: { kind: "conditional", expression: "canGrab" } },
      ],
    });
    expect(ambiguous.result.componentRequests[0]).toMatchObject({
      verificationStatus: "ambiguous",
      target: {
        resolution: "ambiguous",
        candidates: expect.arrayContaining([
          expect.objectContaining({ gameObjectPath: "Root/Item" }),
          expect.objectContaining({ gameObjectPath: "Root/Item Copy" }),
        ]),
      },
    });
    expect(unsupported.result.componentRequests[0]?.verificationStatus).toBe(
      "unsupported",
    );
    expect(unverified.result.componentRequests[0]?.verificationStatus).toBe(
      "unverified",
    );
    expect(unresolved.result.componentRequests[0]).toMatchObject({
      verificationStatus: "unverified",
      target: { resolution: "unresolved" },
    });
    expect(ambiguous.result.issues).toHaveLength(0);
  });

  it("creates a non-mutating plan from a missing requirement in exporter data", () => {
    const { analyzer, result } = analyzeExporterFixture(
      "$.onGrab(() => {});\n",
      "sample.ts",
      (graph) =>
        graph.replace(
          /(type = "ClusterVR\.CreatorKit\.Item\.Implements\.GrabbableItem"\r?\nenabled = )true/,
          "$1false",
        ),
    );

    const plan = analyzer.createComponentChangePlan(
      [result],
      "Assets/Scenes/Main.unity",
    );

    expect(plan).toMatchObject({
      project: "UnitySemanticGraph",
      scenePath: "Assets/Scenes/Main.unity",
      status: "needs-user-input",
      actions: [
        {
          target: {
            gameObjectId:
              "GlobalObjectId_V1-0-00000000000000000000000000000002-0",
            gameObjectPath: "Root/Item",
          },
          componentType:
            "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
          settings: { resolution: "needs-user-input", values: {} },
        },
      ],
    });
    expect(plan.sceneGraphPath).toMatch(/SceneGraph\.toml$/);
  });
});
