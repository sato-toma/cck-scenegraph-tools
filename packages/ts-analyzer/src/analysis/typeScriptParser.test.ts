import { describe, expect, it } from "vitest";
import { TypeScriptCodeParser } from "./typeScriptParser";

const sampleScript = `
$.onStart(() => {
  console.log("start");
});

$.onPhysicsUpdate((dt) => {
  $.addForce(new Vector3(0, 9.8, 0));
});

$.velocity = new Vector3(1, 0, 0);
$.state.items.push("item");
`;

describe("TypeScriptCodeParser", () => {
  it("extracts ClusterScript API calls", () => {
    const calls = TypeScriptCodeParser.extractApiCallsFromString(sampleScript);
    const methodNames = calls.map((c) => c.methodName);

    expect(methodNames).toContain("onStart");
    expect(methodNames).toContain("onPhysicsUpdate");
    expect(methodNames).toContain("addForce");
    expect(methodNames).toContain("velocity");
  });

  it("detects invalid state mutations", () => {
    const invalid = TypeScriptCodeParser.extractInvalidStateMutationsFromString(sampleScript);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]?.propertyName).toBe("items");
  });

  it("detects nested property mutations on state objects", () => {
    const content = `
$.state.profile.name = "updated";
$.state.items.push("item");
`;
    const invalid = TypeScriptCodeParser.extractInvalidStateMutationsFromString(content);

    expect(invalid).toHaveLength(2);
    expect(invalid.map((item) => item.propertyName)).toEqual(["profile", "items"]);
  });
});
