import { SceneGraph } from "./types";

const SPAWN_POINT_TYPE =
  "ClusterVR.CreatorKit.World.Implements.SpawnPoints.SpawnPoint";
const DESPAWN_HEIGHT_TYPE =
  "ClusterVR.CreatorKit.World.Implements.DespawnHeights.DespawnHeight";

export class WorldUploadValidator {
  static validate(sceneGraph: SceneGraph): string[] {
    const components = sceneGraph.gameObjects.flatMap(
      (gameObject) => gameObject.components,
    );
    const entranceSpawnPoints = components.filter(
      (component) =>
        component.type === SPAWN_POINT_TYPE &&
        component.enabled &&
        component.properties?.Spawn_Type === "Entrance",
    );
    const despawnHeights = components.filter(
      (component) => component.type === DESPAWN_HEIGHT_TYPE,
    );
    const issues: string[] = [];

    if (entranceSpawnPoints.length === 0) {
      issues.push(
        'At least one enabled SpawnPoint with Spawn_Type = "Entrance" is required.',
      );
    }
    if (despawnHeights.length !== 1) {
      issues.push(
        `Exactly one DespawnHeight component is required; found ${despawnHeights.length}.`,
      );
    } else if (!despawnHeights[0]!.enabled) {
      issues.push("The DespawnHeight component must be enabled.");
    }

    return issues;
  }
}
