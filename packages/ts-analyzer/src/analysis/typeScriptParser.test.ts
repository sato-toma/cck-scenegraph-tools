import { describe, expect, it } from "vitest";
import { CallbackContextAnalyzer } from "./callbackContextAnalyzer";
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

describe("CallbackContextAnalyzer", () => {
  const analyzeAddForce = (content: string) =>
    CallbackContextAnalyzer.analyze(content, "addForce", "onPhysicsUpdate");

  it("recognizes inline and uniquely named physics callbacks", () => {
    const inlineCallback = analyzeAddForce(
      "$.onPhysicsUpdate((dt) => $.addForce(new Vector3(0, 1, 0)));",
    );
    expect([...inlineCallback.values()]).toEqual(["inside"]);

    const namedCallback = analyzeAddForce(
      "const tick = (dt: number) => { $.addForce(new Vector3(0, 1, 0)); };\n$.onPhysicsUpdate(tick);",
    );
    expect([...namedCallback.values()]).toEqual(["inside"]);
  });

  it("marks top-level calls and calls in other callbacks as outside", () => {
    const contexts = analyzeAddForce(
      "$.addForce(new Vector3(0, 1, 0));\n$.onUpdate(() => $.addForce(new Vector3(0, 1, 0)));",
    );

    expect([...contexts.values()]).toEqual(["outside", "outside"]);
  });

  it("marks nested helper functions as unverified", () => {
    const contexts = analyzeAddForce(
      "$.onPhysicsUpdate(() => {\n  const applyForce = () => $.addForce(new Vector3(0, 1, 0));\n  applyForce();\n});",
    );

    expect([...contexts.values()]).toEqual(["unverified"]);
  });

  it("does not treat comments or strings as API calls", () => {
    const contexts = analyzeAddForce(
      '// $.addForce(new Vector3(0, 1, 0));\nconst example = "$.addForce()";',
    );

    expect(contexts.size).toBe(0);
  });
});
