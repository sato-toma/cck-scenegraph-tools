import { describe, expect, it } from "vitest";
import { SceneGraphParser } from "./sceneGraphParser";

const sampleToml = `
project = "TestProject"

[[gameObjects]]
id = "test-obj-1"
path = "TestItem"
name = "TestItem"
parent = ""

[[gameObjects.components]]
id = "comp-1"
type = "UnityEngine.Rigidbody"
enabled = true
`;

const hierarchyToml = `
project = "TestProject"

[[gameObjects]]
id = "parent-obj"
path = "ParentItem"
name = "ParentItem"
parent = ""

[[gameObjects.components]]
id = "comp-parent-1"
type = "ClusterVR.CreatorKit.Item.GrabbableItem"
enabled = true

[[gameObjects]]
id = "child-obj"
path = "ParentItem/ChildItem"
name = "ChildItem"
parent = "parent-obj"

[[gameObjects.components]]
id = "comp-child-1"
type = "UnityEngine.Rigidbody"
enabled = true
`;

const propertyValuesToml = String.raw`
project = "TestProject"

[[gameObjects]]
id = "object-1"
path = "Root/Item"
name = "Item \"quoted\""
parent = "Root"

[[gameObjects.components]]
id = "component-1"
type = "UnityEngine.BoxCollider"
enabled = true

[gameObjects.components.properties]
Label = "quote: \"x\"; path: \"C:\\Scene\"; line1\nline2"
Mass = 1.25
Vector = [1.25, -2.5, 3.75]
Bounds = [[1.25, 2.5, 3.75], [4.5, 5.5, 6.5]]
`;

describe("SceneGraphParser", () => {
  it("parses a simple SceneGraph TOML", () => {
    const sceneGraph = SceneGraphParser.parse(sampleToml);
    expect(sceneGraph.project).toBe("TestProject");
    expect(sceneGraph.gameObjects).toHaveLength(1);
    const firstGameObject = sceneGraph.gameObjects[0]!;
    const firstComponent = firstGameObject.components[0]!;
    expect(firstComponent.type).toBe("UnityEngine.Rigidbody");
  });

  it("parses escaped strings, invariant decimal values, and nested property arrays", () => {
    const sceneGraph = SceneGraphParser.parse(propertyValuesToml);
    const gameObject = sceneGraph.gameObjects[0]!;
    const component = gameObject.components[0]!;

    expect(gameObject.name).toBe('Item "quoted"');
    expect(component.properties?.Label).toBe(
      'quote: "x"; path: "C:\\Scene"; line1\nline2',
    );
    expect(component.properties?.Mass).toBe(1.25);
    expect(component.properties?.Vector).toEqual([1.25, -2.5, 3.75]);
    expect(component.properties?.Bounds).toEqual([
      [1.25, 2.5, 3.75],
      [4.5, 5.5, 6.5],
    ]);
  });

  it("leaves upload-readiness checks to the world validator", () => {
    expect(SceneGraphParser.parse('project = "TestProject"').gameObjects).toEqual(
      [],
    );
  });

  it("rejects malformed TOML and component records without enabled state", () => {
    expect(() => SceneGraphParser.parse('project = "unterminated')).toThrow();
    expect(() =>
      SceneGraphParser.parse(`
project = "TestProject"

[[gameObjects]]
id = "object-1"
path = "Item"
name = "Item"
parent = ""

[[gameObjects.components]]
type = "UnityEngine.Rigidbody"
`),
    ).toThrow("SceneGraph.gameObjects[0].components[0].enabled must be a boolean");
  });

  it("rejects unsupported serialized property values", () => {
    expect(() =>
      SceneGraphParser.parse(`
project = "TestProject"

[[gameObjects]]
id = "object-1"
path = "Item"
name = "Item"
parent = ""

[[gameObjects.components]]
type = "UnityEngine.Rigidbody"
enabled = true

[gameObjects.components.properties]
Unsupported = 1979-05-27T07:32:00Z
`),
    ).toThrow(
      "SceneGraph.gameObjects[0].components[0].properties.Unsupported contains an unsupported TOML value",
    );
  });

  it("finds game objects by component", () => {
    const sceneGraph = SceneGraphParser.parse(sampleToml);
    const rigidbodies = SceneGraphParser.getGameObjectsWithComponent(
      sceneGraph,
      "UnityEngine.Rigidbody",
    );
    expect(rigidbodies).toHaveLength(1);
    expect(rigidbodies[0]!.name).toBe("TestItem");
  });

  it("retrieves ancestors and hierarchy components", () => {
    const sceneGraph = SceneGraphParser.parse(hierarchyToml);
    const childObject = sceneGraph.gameObjects.find(
      (obj) => obj.id === "child-obj",
    )!;

    const ancestors = SceneGraphParser.getGameObjectAncestors(
      sceneGraph,
      childObject,
    );
    expect(ancestors).toHaveLength(1);
    expect(ancestors[0]!.id).toBe("parent-obj");

    const enabledComponents = SceneGraphParser.getEnabledComponentsInHierarchy(
      sceneGraph,
      childObject,
    );
    expect(enabledComponents.map((c) => c.type)).toEqual(
      expect.arrayContaining([
        "UnityEngine.Rigidbody",
        "ClusterVR.CreatorKit.Item.GrabbableItem",
      ]),
    );
  });

  it("resolves nested parents stored as SceneGraph paths", () => {
    const sceneGraph = SceneGraphParser.parse(`
project = "TestProject"

[[gameObjects]]
id = "item"
path = "Item"
name = "Item"
parent = ""

[[gameObjects]]
id = "cube"
path = "Item/Cube"
name = "Cube"
parent = "Item"

[[gameObjects]]
id = "label"
path = "Item/Cube/API_Label"
name = "API_Label"
parent = "Item/Cube"
`);
    const item = sceneGraph.gameObjects[0]!;
    const label = sceneGraph.gameObjects[2]!;

    expect(
      SceneGraphParser.getGameObjectDescendants(sceneGraph, item).map(
        (gameObject) => gameObject.path,
      ),
    ).toEqual(["Item/Cube", "Item/Cube/API_Label"]);
    expect(
      SceneGraphParser.getGameObjectAncestors(sceneGraph, label).map(
        (gameObject) => gameObject.path,
      ),
    ).toEqual(["Item/Cube", "Item"]);
  });
});
