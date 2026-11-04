import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { ClusterScriptAnalyzer } from "../../../src/analysis/analyzer";
import { SceneGraphParser } from "../../../src/sceneGraph/sceneGraphParser";

describe("ClusterScriptAnalyzer: material", () => {
  it("requires a registered material and a Renderer on the Item or its descendants", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "material.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");
    fs.writeFileSync(tsFilePath, '$.material("cubeMat");\n');

    const writeScene = (options: {
      rendererParent?: "item" | "descendant" | "ancestor" | "none";
      rendererMaterialGuid?: string;
      materialSetId?: string;
    }) => {
      const rendererParent = options.rendererParent ?? "descendant";
      const materialSetId = options.materialSetId ?? "cubeMat";
      const rendererObject =
        rendererParent === "item"
          ? `
[[gameObjects.components]]
type = "UnityEngine.MeshRenderer"
enabled = true
[gameObjects.components.properties]
Renderer_Material_Guids = ["${options.rendererMaterialGuid ?? "material-guid"}"]
`
          : "";
      const ancestorRenderer =
        rendererParent === "ancestor"
          ? `
[[gameObjects]]
id = "ancestor-object"
path = "Parent"
name = "Parent"
parent = ""

[[gameObjects.components]]
type = "UnityEngine.MeshRenderer"
enabled = true
[gameObjects.components.properties]
Renderer_Material_Guids = ["${options.rendererMaterialGuid ?? "material-guid"}"]
`
          : "";
      const childRenderer =
        rendererParent === "descendant"
          ? `
[[gameObjects]]
id = "renderer-object"
path = "Item/ColorRenderer"
name = "ColorRenderer"
parent = "item-object"

[[gameObjects.components]]
type = "UnityEngine.MeshRenderer"
enabled = true
[gameObjects.components.properties]
Renderer_Material_Guids = ["${options.rendererMaterialGuid ?? "material-guid"}"]
`
          : "";

      fs.writeFileSync(
        sceneGraphPath,
        `
project = "TestProject"
${ancestorRenderer}
[[gameObjects]]
id = "item-object"
path = "Item"
name = "Item"
parent = "${rendererParent === "ancestor" ? "Parent" : ""}"

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "material.ts"

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.ItemMaterialSetList"
enabled = true
[gameObjects.components.properties]
Item_Material_Sets = ["${materialSetId}=material-guid"]
${rendererObject}
${childRenderer}
`,
      );
      return new ClusterScriptAnalyzer(sceneGraphPath).analyzeTypeScriptFile(
        tsFilePath,
      );
    };

    expect(writeScene({ rendererParent: "descendant" }).issues).toHaveLength(0);
    expect(writeScene({ rendererParent: "item" }).issues).toHaveLength(0);
    expect(writeScene({ rendererParent: "none" }).issues).toMatchObject([
      { code: "MISSING_COMPONENT", apiCall: "material" },
    ]);
    expect(writeScene({ rendererParent: "ancestor" }).issues).toMatchObject([
      { code: "MISSING_COMPONENT", apiCall: "material" },
    ]);
    expect(
      writeScene({
        rendererParent: "descendant",
        rendererMaterialGuid: "other-material-guid",
      }).issues,
    ).toMatchObject([
      { code: "MATERIAL_NOT_ASSIGNED_TO_RENDERER", apiCall: "material" },
    ]);
    expect(
      writeScene({ materialSetId: "differentMaterial" }).issues,
    ).toMatchObject([
      { code: "MATERIAL_ID_NOT_REGISTERED", apiCall: "material" },
    ]);

    fs.writeFileSync(tsFilePath, `$.material("${"a".repeat(65)}");\n`);
    expect(
      writeScene({ rendererParent: "descendant" }).issues,
    ).toMatchObject([{ code: "INVALID_MATERIAL_ID", apiCall: "material" }]);

    fs.writeFileSync(tsFilePath, "$.material(materialId);\n");
    expect(
      writeScene({ rendererParent: "descendant" }).issues,
    ).toMatchObject([
      { severity: "warning", code: "UNVERIFIED_MATERIAL_ID", apiCall: "material" },
    ]);
  });

  it("reports disabled _EMISSION as an implicit material rule", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-analyzer-"));
    const tsFilePath = path.join(tempDir, "emission.ts");
    const sceneGraphPath = path.join(tempDir, "SceneGraph.toml");

    const writeScene = (options: {
      emissionEnabled?: boolean;
      includeMaterials?: boolean;
      materialSetId?: string;
    }) => {
      const materialSetId = options.materialSetId ?? "cubeMat";
      const materials =
        options.includeMaterials === false
          ? ""
          : `
[[materials]]
guid = "material-guid"
name = "CubeColor"
path = "Assets/CubeColor.mat"
shader = "Standard"
emissionEnabled = ${options.emissionEnabled === false ? "false" : "true"}
emissionColor = [0.0, 0.0, 0.0, 1.0]
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
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "emission.ts"

[[gameObjects.components]]
type = "ClusterVR.CreatorKit.Item.Implements.ItemMaterialSetList"
enabled = true
[gameObjects.components.properties]
Item_Material_Sets = ["${materialSetId}=material-guid"]

[[gameObjects.components]]
type = "UnityEngine.MeshRenderer"
enabled = true
[gameObjects.components.properties]
Renderer_Material_Guids = ["material-guid"]
${materials}`,
      );
      return new ClusterScriptAnalyzer(sceneGraphPath).analyzeTypeScriptFile(
        tsFilePath,
      );
    };

    fs.writeFileSync(
      tsFilePath,
      [
        'const mat = $.material("cubeMat");',
        'mat.setEmissionColor(1, 0, 0, 1);',
        '$.material("cubeMat").setEmissionColor(0, 1, 0, 1);',
      ].join("\n"),
    );

    expect(writeScene({ emissionEnabled: true }).issues).toHaveLength(0);

    expect(writeScene({ emissionEnabled: false }).issues).toMatchObject([
      { line: 2, severity: "warning", code: "IMPLICIT_MATERIAL_EMISSION_DISABLED", apiCall: "setEmissionColor" },
      { line: 3, severity: "warning", code: "IMPLICIT_MATERIAL_EMISSION_DISABLED", apiCall: "setEmissionColor" },
    ]);

    expect(writeScene({ includeMaterials: false }).issues).toMatchObject([
      { line: 2, severity: "warning", code: "UNVERIFIED_IMPLICIT_MATERIAL_EMISSION", apiCall: "setEmissionColor" },
      { line: 3, severity: "warning", code: "UNVERIFIED_IMPLICIT_MATERIAL_EMISSION", apiCall: "setEmissionColor" },
    ]);

    expect(writeScene({ materialSetId: "otherMat" }).issues).toMatchObject([
      { line: 1, severity: "error", code: "MATERIAL_ID_NOT_REGISTERED", apiCall: "material" },
      { line: 3, severity: "error", code: "MATERIAL_ID_NOT_REGISTERED", apiCall: "material" },
    ]);
  });


});
