import { describe, expect, it } from "vitest";
import { ConstraintValidator } from "./constraintValidator";

const gameObject = {
  id: "test-obj-1",
  path: "TestItem",
  name: "TestItem",
  parent: "",
  components: [
    {
      id: "comp-1",
      type: "UnityEngine.Rigidbody",
      enabled: true,
      properties: {},
    },
  ],
};

const hierarchySceneGraph = {
  project: "TestProject",
  gameObjects: [
    {
      id: "parent-obj",
      path: "ParentItem",
      name: "ParentItem",
      parent: "",
      components: [
        {
          id: "comp-parent-1",
          type: "ClusterVR.CreatorKit.Item.GrabbableItem",
          enabled: true,
          properties: {},
        },
      ],
    },
    {
      id: "child-obj",
      path: "ParentItem/ChildItem",
      name: "ChildItem",
      parent: "parent-obj",
      components: [
        {
          id: "comp-child-1",
          type: "UnityEngine.Rigidbody",
          enabled: true,
          properties: {},
        },
      ],
    },
  ],
};

describe("ConstraintValidator", () => {
  it("validates required components", () => {
    const result = ConstraintValidator.validateGameObject(gameObject, [
      { componentType: "UnityEngine.Rigidbody", requirement: "required" },
    ]);

    expect(result.isValid).toBe(true);
    expect(result.missingRequired).toHaveLength(0);
  });

  it("detects missing required components", () => {
    const result = ConstraintValidator.validateGameObject(gameObject, [
      { componentType: "UnityEngine.Collider", requirement: "required" },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.missingRequired).toEqual(["UnityEngine.Collider"]);
  });

  it("validates anyOf required components (array componentType)", () => {
    const result = ConstraintValidator.validateGameObject(gameObject, [
      {
        componentType: ["UnityEngine.BoxCollider", "UnityEngine.Rigidbody"],
        requirement: "required",
      },
    ]);

    expect(result.isValid).toBe(true);
    expect(result.missingRequired).toHaveLength(0);
  });

  it("detects missing anyOf required components (array componentType)", () => {
    const result = ConstraintValidator.validateGameObject(gameObject, [
      {
        componentType: [
          "UnityEngine.BoxCollider",
          "UnityEngine.SphereCollider",
        ],
        requirement: "required",
      },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.missingRequired).toEqual([
      "UnityEngine.BoxCollider | UnityEngine.SphereCollider",
    ]);
  });

  it("validates required components on ancestor objects", () => {
    const childObject = hierarchySceneGraph.gameObjects[1]!;
    const result = ConstraintValidator.validateGameObject(
      childObject,
      [
        {
          componentType: "ClusterVR.CreatorKit.Item.GrabbableItem",
          requirement: "required",
        },
      ],
      hierarchySceneGraph,
    );

    expect(result.isValid).toBe(true);
    expect(result.missingRequired).toHaveLength(0);
  });
});
