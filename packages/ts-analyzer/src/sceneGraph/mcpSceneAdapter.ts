export interface McpSceneSnapshot {
  sceneName: string;
  scenePath: string;
  isActive: boolean;
  isDirty: boolean;
  gameObjects: McpGameObject[];
}

export interface McpGameObject {
  globalId: string;
  hierarchyPath: string;
  name: string;
  activeSelf: boolean;
  components: McpComponent[];
}

export interface McpComponent {
  shortTypeName: string;
  enabled: {
    status: "unsupported";
    reason: string;
  };
}

export interface McpSceneDiagnostic {
  code:
    | "missing-global-id"
    | "missing-instance-id"
    | "missing-identity-match"
    | "hierarchy-path-mismatch"
    | "not-in-hierarchy";
  hierarchyPath: string;
  message: string;
}

export interface McpSceneAdapterResult {
  snapshot: McpSceneSnapshot;
  diagnostics: McpSceneDiagnostic[];
}

export class McpSceneAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpSceneAdapterError";
  }
}

const ENABLED_UNSUPPORTED_REASON =
  "Unity CLI MCP hierarchy and serialized-property tools do not expose component enabled state.";

interface HierarchyNode {
  name: string;
  instanceId: number;
  hierarchyPath: string;
  activeSelf: boolean;
  components: string[];
  children: HierarchyNode[];
}

interface FoundGameObject {
  globalId?: string;
  instanceId?: number;
  hierarchyPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  location: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new McpSceneAdapterError(`${location}.${key} must be a non-empty string`);
  }
  return value;
}

function requiredBoolean(
  record: Record<string, unknown>,
  key: string,
  location: string,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new McpSceneAdapterError(`${location}.${key} must be a boolean`);
  }
  return value;
}

function requiredInstanceId(
  record: Record<string, unknown>,
  location: string,
): number {
  const value = record.instanceId;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new McpSceneAdapterError(`${location}.instanceId must be a safe integer`);
  }
  return value;
}

function parseHierarchyNode(value: unknown, location: string): HierarchyNode {
  if (!isRecord(value)) {
    throw new McpSceneAdapterError(`${location} must be an object`);
  }

  const components = value.components;
  if (
    !Array.isArray(components) ||
    !components.every(
      (component) => typeof component === "string" && component.length > 0,
    )
  ) {
    throw new McpSceneAdapterError(`${location}.components must be an array of names`);
  }

  const childrenValue = value.children;
  if (!Array.isArray(childrenValue)) {
    throw new McpSceneAdapterError(`${location}.children must be an array`);
  }

  return {
    name: requiredString(value, "name", location),
    instanceId: requiredInstanceId(value, location),
    hierarchyPath: requiredString(value, "hierarchyPath", location),
    activeSelf: requiredBoolean(value, "activeSelf", location),
    components,
    children: childrenValue.map((child, index) =>
      parseHierarchyNode(child, `${location}.children[${index}]`),
    ),
  };
}

function parseFoundGameObject(value: unknown, index: number): FoundGameObject {
  const location = `find_gameobjects.gameObjects[${index}]`;
  if (!isRecord(value)) {
    throw new McpSceneAdapterError(`${location} must be an object`);
  }

  const globalId = value.globalId;
  if (globalId !== undefined && typeof globalId !== "string") {
    throw new McpSceneAdapterError(`${location}.globalId must be a string when present`);
  }

  const instanceId = value.instanceId;
  if (
    instanceId !== undefined &&
    (typeof instanceId !== "number" || !Number.isSafeInteger(instanceId))
  ) {
    throw new McpSceneAdapterError(`${location}.instanceId must be a safe integer when present`);
  }

  return {
    ...(globalId === undefined ? {} : { globalId }),
    ...(instanceId === undefined ? {} : { instanceId }),
    hierarchyPath: requiredString(value, "hierarchyPath", location),
  };
}

function flattenHierarchy(
  node: HierarchyNode,
  flattened: HierarchyNode[],
): void {
  flattened.push(node);
  for (const child of node.children) {
    flattenHierarchy(child, flattened);
  }
}

export class McpSceneAdapter {
  static normalize(
    hierarchyResponse: unknown,
    findGameObjectsResponse: unknown,
  ): McpSceneAdapterResult {
    if (!isRecord(hierarchyResponse)) {
      throw new McpSceneAdapterError("get_scene_hierarchy response must be an object");
    }
    if (!isRecord(findGameObjectsResponse)) {
      throw new McpSceneAdapterError("find_gameobjects response must be an object");
    }

    const rootsValue = hierarchyResponse.roots;
    if (!Array.isArray(rootsValue)) {
      throw new McpSceneAdapterError("get_scene_hierarchy.roots must be an array");
    }

    const nodes = rootsValue.flatMap((root, index) => {
      const parsedRoot = parseHierarchyNode(
        root,
        `get_scene_hierarchy.roots[${index}]`,
      );
      const flattened: HierarchyNode[] = [];
      flattenHierarchy(parsedRoot, flattened);
      return flattened;
    });

    const hierarchyByInstanceId = new Map<number, HierarchyNode>();
    for (const node of nodes) {
      if (hierarchyByInstanceId.has(node.instanceId)) {
        throw new McpSceneAdapterError(
          `Duplicate hierarchy instanceId ${node.instanceId}`,
        );
      }
      hierarchyByInstanceId.set(node.instanceId, node);
    }

    const foundValue = findGameObjectsResponse.gameObjects;
    if (!Array.isArray(foundValue)) {
      throw new McpSceneAdapterError(
        "find_gameobjects.gameObjects must be an array",
      );
    }

    const foundObjects = foundValue.map(parseFoundGameObject);
    const foundByInstanceId = new Map<number, FoundGameObject>();
    const seenGlobalIds = new Set<string>();
    for (const found of foundObjects) {
      if (found.globalId && seenGlobalIds.has(found.globalId)) {
        throw new McpSceneAdapterError(
          `Duplicate find_gameobjects globalId ${found.globalId}`,
        );
      }
      if (found.globalId) {
        seenGlobalIds.add(found.globalId);
      }
      if (found.instanceId === undefined) {
        continue;
      }
      if (foundByInstanceId.has(found.instanceId)) {
        throw new McpSceneAdapterError(
          `Duplicate find_gameobjects instanceId ${found.instanceId}`,
        );
      }
      foundByInstanceId.set(found.instanceId, found);
    }

    const diagnostics: McpSceneDiagnostic[] = [];
    const gameObjects: McpGameObject[] = [];

    for (const found of foundObjects) {
      if (found.instanceId === undefined) {
        diagnostics.push({
          code: "missing-instance-id",
          hierarchyPath: found.hierarchyPath,
          message: "find_gameobjects returned no instanceId; the result cannot be joined safely to the hierarchy.",
        });
      }
    }

    for (const node of nodes) {
      const found = foundByInstanceId.get(node.instanceId);
      if (!found) {
        diagnostics.push({
          code: "missing-identity-match",
          hierarchyPath: node.hierarchyPath,
          message: `No find_gameobjects result matched instanceId ${node.instanceId}; object omitted because its GlobalObjectId is unavailable.`,
        });
        continue;
      }
      if (!found.globalId?.trim()) {
        diagnostics.push({
          code: "missing-global-id",
          hierarchyPath: node.hierarchyPath,
          message: `find_gameobjects returned no GlobalObjectId for instanceId ${node.instanceId}; object omitted.`,
        });
        continue;
      }
      if (found.hierarchyPath !== node.hierarchyPath) {
        diagnostics.push({
          code: "hierarchy-path-mismatch",
          hierarchyPath: node.hierarchyPath,
          message: `The hierarchy path changed between MCP calls for instanceId ${node.instanceId}; object omitted.`,
        });
        continue;
      }

      gameObjects.push({
        globalId: found.globalId,
        hierarchyPath: node.hierarchyPath,
        name: node.name,
        activeSelf: node.activeSelf,
        components: node.components.map((shortTypeName) => ({
          shortTypeName,
          enabled: {
            status: "unsupported",
            reason: ENABLED_UNSUPPORTED_REASON,
          },
        })),
      });
    }

    for (const found of foundObjects) {
      if (
        found.instanceId !== undefined &&
        !hierarchyByInstanceId.has(found.instanceId)
      ) {
        diagnostics.push({
          code: "not-in-hierarchy",
          hierarchyPath: found.hierarchyPath,
          message: `find_gameobjects returned instanceId ${found.instanceId}, but it was absent from the hierarchy response.`,
        });
      }
    }

    return {
      snapshot: {
        sceneName: requiredString(hierarchyResponse, "sceneName", "get_scene_hierarchy"),
        scenePath: requiredString(hierarchyResponse, "scenePath", "get_scene_hierarchy"),
        isActive: requiredBoolean(hierarchyResponse, "isActive", "get_scene_hierarchy"),
        isDirty: requiredBoolean(hierarchyResponse, "isDirty", "get_scene_hierarchy"),
        gameObjects,
      },
      diagnostics,
    };
  }
}
