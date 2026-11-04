import { describe, expect, it } from "vitest";
import { ClusterScriptDefinitions } from "../../src/rules/clusterScriptDefinitions";
import { ruleSets } from "../../src/rules";

describe("ClusterScript API rule definitions", () => {
  it("keeps method and property names unique across categories", () => {
    const methods = Object.values(ruleSets).flatMap((ruleSet) =>
      ruleSet.methods.map((method) => method.name),
    );
    const properties = Object.values(ruleSets).flatMap((ruleSet) =>
      ruleSet.properties.map((property) => property.name),
    );

    expect(new Set(methods).size).toBe(methods.length);
    expect(new Set(properties).size).toBe(properties.length);
    expect(ClusterScriptDefinitions.getAllMethodNames().sort()).toEqual(
      [...methods].sort(),
    );
    expect(ClusterScriptDefinitions.getAllPropertyNames().sort()).toEqual(
      [...properties].sort(),
    );
  });
});
