import { describe, expect, it } from "vitest";
import { ComponentRequirementExtractor } from "./extractor";

describe("ComponentRequirementExtractor", () => {
  it("extracts literal getUnityComponent requests with source evidence", () => {
    const requests = ComponentRequirementExtractor.extractFromString(
      '$.getUnityComponent("UnityEngine.Rigidbody");',
      "script.ts",
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      api: "$.getUnityComponent",
      kind: "optional-lookup",
      componentTypes: ["UnityEngine.Rigidbody"],
      componentMatch: "all",
      target: {
        kind: "current-scriptable-item",
        resolution: "unresolved",
      },
      verificationStatus: "unverified",
      occurrences: [
        {
          source: { filePath: "script.ts", line: 1, column: 0 },
          condition: { kind: "unconditional" },
          confidence: "high",
        },
      ],
    });
    expect(requests[0]?.occurrences[0]?.evidence).toContain(
      "UnityEngine.Rigidbody",
    );
  });

  it("marks dynamic component type arguments unsupported", () => {
    const requests = ComponentRequirementExtractor.extractFromString(
      "$.getUnityComponent(componentName);",
      "script.ts",
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      componentTypes: [],
      kind: "optional-lookup",
      componentMatch: "unknown",
      verificationStatus: "unsupported",
      occurrences: [{ confidence: "low" }],
    });
  });

  it("extracts API constraints and their enclosing simple condition", () => {
    const requests = ComponentRequirementExtractor.extractFromString(
      "if (canMove) {\n  $.setPosition(position);\n}\n",
      "script.ts",
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      api: "$.setPosition",
      componentTypes: [
        "ClusterVR.CreatorKit.Item.Implements.MovableItem",
      ],
      verificationStatus: "unverified",
      occurrences: [
        {
          source: { filePath: "script.ts", line: 2, column: 2 },
          condition: { kind: "conditional", expression: "canMove" },
          confidence: "high",
        },
      ],
    });
  });

  it("keeps unsupported conditional syntax unknown rather than unconditional", () => {
    const requests = ComponentRequirementExtractor.extractFromString(
      "if (\n  canMove\n) {\n  $.setPosition(position);\n}\n",
      "script.ts",
    );

    expect(requests[0]?.occurrences[0]?.condition).toEqual({
      kind: "unknown",
    });
  });

  it("combines nested simple conditions and ignores completed conditions", () => {
    const nestedRequests = ComponentRequirementExtractor.extractFromString(
      "if (enabled) {\n  if (canMove) {\n    $.setPosition(position);\n  }\n}\n",
      "nested.ts",
    );
    const afterIfRequests = ComponentRequirementExtractor.extractFromString(
      "if (enabled) {\n  $.setPosition(position);\n}\n$.setPosition(otherPosition);\n",
      "after.ts",
    );

    expect(nestedRequests[0]?.occurrences[0]?.condition).toEqual({
      kind: "conditional",
      expression: "enabled && canMove",
    });
    expect(afterIfRequests[0]?.occurrences[1]?.condition).toEqual({
      kind: "unconditional",
    });
  });

  it("does not mistake an else branch for the if condition", () => {
    const requests = ComponentRequirementExtractor.extractFromString(
      "if (enabled) {\n}\nelse {\n  $.setPosition(position);\n}\n",
      "else.ts",
    );

    expect(requests[0]?.occurrences[0]?.condition).toEqual({
      kind: "unknown",
    });
  });

  it("preserves any-of component constraints as alternatives", () => {
    const requests = ComponentRequirementExtractor.extractFromString(
      "$.onInteract(() => {});",
      "script.ts",
    );

    expect(requests[0]).toMatchObject({
      api: "$.onInteract",
      componentMatch: "any",
      componentTypes: [
        "UnityEngine.BoxCollider",
        "UnityEngine.CapsuleCollider",
        "UnityEngine.MeshCollider",
        "UnityEngine.SphereCollider",
        "UnityEngine.WheelCollider",
      ],
    });
  });

  it("deduplicates equal requirements while retaining every occurrence", () => {
    const requests = ComponentRequirementExtractor.extractFromString(
      '$.getUnityComponent("UnityEngine.Rigidbody");\n$.getUnityComponent("UnityEngine.Rigidbody");',
      "script.ts",
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.occurrences.map(({ source }) => source.line)).toEqual([
      1,
      2,
    ]);
    expect(requests[0]?.id).toBe(
      ComponentRequirementExtractor.extractFromString(
        '$.getUnityComponent("UnityEngine.Rigidbody");\n$.getUnityComponent("UnityEngine.Rigidbody");',
        "other-path.ts",
      )[0]?.id,
    );
  });

  it("keeps unsupported literal syntax explicit instead of guessing its type", () => {
    const requests = ComponentRequirementExtractor.extractFromString(
      "$.getUnityComponent(`UnityEngine.Rigidbody`);",
      "script.ts",
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      componentTypes: [],
      verificationStatus: "unsupported",
      occurrences: [{ confidence: "low" }],
    });
  });
});
