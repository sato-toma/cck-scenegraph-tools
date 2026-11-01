import { SceneGraph } from "../domain/types";

const SPAWN_POINT_TYPE =
  "ClusterVR.CreatorKit.World.Implements.SpawnPoints.SpawnPoint";
const DESPAWN_HEIGHT_TYPE =
  "ClusterVR.CreatorKit.World.Implements.DespawnHeights.DespawnHeight";
const ITEM_TYPE = "ClusterVR.CreatorKit.Item.Implements.Item";

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
    const gameObjectsByPath = new Map(
      sceneGraph.gameObjects.map((gameObject) => [gameObject.path, gameObject]),
    );

    for (const gameObject of sceneGraph.gameObjects) {
      if (!gameObject.components.some((component) => component.type === ITEM_TYPE)) {
        continue;
      }

      const visitedPaths = new Set([gameObject.path]);
      let parentPath = gameObject.parent;
      while (parentPath && !visitedPaths.has(parentPath)) {
        visitedPaths.add(parentPath);
        const parent = gameObjectsByPath.get(parentPath);
        if (!parent) {
          break;
        }
        if (parent.components.some((component) => component.type === ITEM_TYPE)) {
          issues.push(
            `Item component at "${gameObject.path}" cannot be nested under an Item component at "${parent.path}".`,
          );
          break;
        }
        parentPath = parent.parent;
      }
    }

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
