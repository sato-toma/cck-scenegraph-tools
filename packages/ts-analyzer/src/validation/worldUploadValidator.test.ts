import * as path from "path";
import { describe, expect, it } from "vitest";
import { SceneGraphParser } from "../sceneGraph/sceneGraphParser";
import { WorldUploadValidator } from "./worldUploadValidator";

const fixturePath = path.join(__dirname, "..", "fixtures", "scene-graph-export.toml");

describe("WorldUploadValidator", () => {
  it("accepts one Entrance SpawnPoint and exactly one enabled DespawnHeight", () => {
    const sceneGraph = SceneGraphParser.parseFile(fixturePath);

    expect(WorldUploadValidator.validate(sceneGraph)).toEqual([]);
  });

  it("reports missing Entrance SpawnPoint and missing DespawnHeight", () => {
    const sceneGraph = SceneGraphParser.parse(
      'project = "TestProject"',
    );

    expect(WorldUploadValidator.validate(sceneGraph)).toEqual([
      'At least one enabled SpawnPoint with Spawn_Type = "Entrance" is required.',
      "Exactly one DespawnHeight component is required; found 0.",
    ]);
  });

  it("rejects duplicate or disabled DespawnHeight components", () => {
    const sceneGraph = SceneGraphParser.parseFile(fixturePath);
    const system = sceneGraph.gameObjects.find(
      (gameObject) => gameObject.name === "System",
    )!;
    const despawnHeight = system.components.find((component) =>
      component.type.endsWith(".DespawnHeight"),
    )!;

    system.components.push({ ...despawnHeight, id: "duplicate" });
    expect(WorldUploadValidator.validate(sceneGraph)).toContain(
      "Exactly one DespawnHeight component is required; found 2.",
    );

    system.components.pop();
    despawnHeight.enabled = false;
    expect(WorldUploadValidator.validate(sceneGraph)).toContain(
      "The DespawnHeight component must be enabled.",
    );
  });

  it("does not accept a disabled or non-Entrance SpawnPoint", () => {
    const sceneGraph = SceneGraphParser.parseFile(fixturePath);
    const spawnPoint = sceneGraph.gameObjects
      .flatMap((gameObject) => gameObject.components)
      .find((component) => component.type.endsWith(".SpawnPoint"))!;

    spawnPoint.enabled = false;
    expect(WorldUploadValidator.validate(sceneGraph)).toContain(
      'At least one enabled SpawnPoint with Spawn_Type = "Entrance" is required.',
    );

    spawnPoint.enabled = true;
    spawnPoint.properties!.Spawn_Type = "OnStage1";
    expect(WorldUploadValidator.validate(sceneGraph)).toContain(
      'At least one enabled SpawnPoint with Spawn_Type = "Entrance" is required.',
    );
  });
});
