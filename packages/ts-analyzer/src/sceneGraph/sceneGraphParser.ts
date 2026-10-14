import { parse as parseToml } from "@iarna/toml";
import * as fs from "fs";
import * as path from "path";
import {
  SceneGraph,
  GameObject,
  Component,
  ComponentPropertyValue,
} from "../domain/types";

type TomlRecord = Record<string, unknown>;

function isTomlRecord(value: unknown): value is TomlRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function requireTomlRecord(value: unknown, location: string): TomlRecord {
  if (!isTomlRecord(value)) {
    throw new Error(`${location} must be a TOML table`);
  }
  return value;
}

function requireString(
  record: TomlRecord,
  key: string,
  location: string,
  allowEmpty = false,
): string {
  const value = record[key];
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.trim().length === 0)
  ) {
    throw new Error(`${location}.${key} must be a non-empty string`);
  }
  return value;
}

function parsePropertyValue(
  value: unknown,
  location: string,
): ComponentPropertyValue {
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      parsePropertyValue(item, `${location}[${index}]`),
    );
  }
  throw new Error(`${location} contains an unsupported TOML value`);
}

/**
 * SceneGraph.toml ファイルを解析
 */
export class SceneGraphParser {
  /**
   * TOMLファイルをパース
   */
  static parseFile(filePath: string): SceneGraph {
    const content = fs.readFileSync(filePath, "utf-8");
    return this.parse(content);
  }

  /**
   * TOML文字列をパース
   */
  static parse(content: string): SceneGraph {
    const parsed = requireTomlRecord(
      parseToml(content) as unknown,
      "SceneGraph",
    );
    const project = requireString(parsed, "project", "SceneGraph");
    const rawGameObjects = parsed.gameObjects ?? [];
    if (!Array.isArray(rawGameObjects)) {
      throw new Error("SceneGraph.gameObjects must be an array");
    }

    const sceneGraph: SceneGraph = {
      project,
      gameObjects: this.parseGameObjects(rawGameObjects),
    };

    return sceneGraph;
  }

  /**
   * GameObjectsを抽出・変換
   */
  private static parseGameObjects(rawObjects: unknown[]): GameObject[] {
    return rawObjects.map((rawObject, index) => {
      const location = `SceneGraph.gameObjects[${index}]`;
      const obj = requireTomlRecord(rawObject, location);
      const rawComponents = obj.components ?? [];
      if (!Array.isArray(rawComponents)) {
        throw new Error(`${location}.components must be an array`);
      }

      return {
        id: requireString(obj, "id", location),
        path: requireString(obj, "path", location),
        name: requireString(obj, "name", location),
        parent: requireString(obj, "parent", location, true),
        components: this.parseComponents(rawComponents, location),
      };
    });
  }

  /**
   * Componentsを抽出・変換
   */
  private static parseComponents(
    rawComponents: unknown[],
    gameObjectLocation: string,
  ): Component[] {
    return rawComponents.map((rawComponent, index) => {
      const location = `${gameObjectLocation}.components[${index}]`;
      const comp = requireTomlRecord(rawComponent, location);
      const id = comp.id;
      if (id !== undefined && typeof id !== "string") {
        throw new Error(`${location}.id must be a string`);
      }

      const rawProperties = comp.properties ?? {};
      const propertiesRecord = requireTomlRecord(
        rawProperties,
        `${location}.properties`,
      );
      const properties = Object.fromEntries(
        Object.entries(propertiesRecord).map(([key, value]) => [
          key,
          parsePropertyValue(value, `${location}.properties.${key}`),
        ]),
      );

      if (typeof comp.enabled !== "boolean") {
        throw new Error(`${location}.enabled must be a boolean`);
      }

      return {
        id: id ?? "",
        type: requireString(comp, "type", location),
        enabled: comp.enabled,
        properties,
      };
    });
  }

  /**
   * GameObjectをIDで取得
   */
  static getGameObjectById(
    sceneGraph: SceneGraph,
    id: string,
  ): GameObject | null {
    return sceneGraph.gameObjects.find((obj) => obj.id === id) || null;
  }

  /**
   * GameObjectをパスで取得
   */
  static getGameObjectByPath(
    sceneGraph: SceneGraph,
    pathPattern: string,
  ): GameObject[] {
    const regex = new RegExp(pathPattern);
    return sceneGraph.gameObjects.filter((obj) => regex.test(obj.path));
  }

  /**
   * 指定オブジェクトの祖先を取得する
   */
  static getGameObjectAncestors(
    sceneGraph: SceneGraph,
    gameObject: GameObject,
  ): GameObject[] {
    const ancestors: GameObject[] = [];
    let current = gameObject;

    while (current.parent) {
      // parent in SceneGraph may be an id or a name; try both
      let parent = this.getGameObjectById(sceneGraph, current.parent);
      if (!parent) {
        parent = sceneGraph.gameObjects.find((obj) => obj.name === current.parent) || null;
      }
      if (!parent) {
        break;
      }
      ancestors.push(parent);
      current = parent;
    }

    return ancestors;
  }

  /**
   * 指定オブジェクトと祖先を含めた有効なコンポーネントを取得する
   */
  static getEnabledComponentsInHierarchy(
    sceneGraph: SceneGraph,
    gameObject: GameObject,
  ): Component[] {
    return this.getGameObjectsInHierarchy(sceneGraph, gameObject)
      .flatMap((item) => item.components)
      .filter((component) => component.enabled);
  }

  static getGameObjectsInHierarchy(
    sceneGraph: SceneGraph,
    gameObject: GameObject,
  ): GameObject[] {
    return [
      gameObject,
      ...this.getGameObjectAncestors(sceneGraph, gameObject),
      ...this.getGameObjectDescendants(sceneGraph, gameObject),
    ];
  }

  /**
   * 指定オブジェクトのすべての子孫 GameObject を再帰的に取得する
   */
  static getGameObjectDescendants(
    sceneGraph: SceneGraph,
    gameObject: GameObject,
  ): GameObject[] {
    const descendants: GameObject[] = [];

    // parent can be stored as id or name in the TOML; match either
    const children = sceneGraph.gameObjects.filter(
      (o) => o.parent === gameObject.id || o.parent === gameObject.name,
    );
    for (const child of children) {
      descendants.push(child);
      descendants.push(...this.getGameObjectDescendants(sceneGraph, child));
    }

    return descendants;
  }

  /**
   * 特定のコンポーネントを持つGameObjectをすべて取得
   */
  static getGameObjectsWithComponent(
    sceneGraph: SceneGraph,
    componentType: string,
  ): GameObject[] {
    return sceneGraph.gameObjects.filter((obj) =>
      obj.components.some(
        (comp) => comp.type === componentType && comp.enabled,
      ),
    );
  }

  /**
   * ScriptableItem の Source_Code_Asset を参照する GameObject を検索
   */
  static getGameObjectsWithScriptableItem(
    sceneGraph: SceneGraph,
  ): GameObject[] {
    return sceneGraph.gameObjects.filter((obj) =>
      obj.components.some(
        (comp) =>
          comp.type === "ClusterVR.CreatorKit.Item.Implements.ScriptableItem" &&
          comp.enabled,
      ),
    );
  }

  /**
   * 指定したソースファイルに対応する ScriptableItem GameObject を取得する。
   */
  static findGameObjectForSourceFile(
    sceneGraphPath: string,
    sceneGraph: SceneGraph,
    sourceFilePath: string,
  ): GameObject | null {
    const normalizedTargetPath = path.resolve(sourceFilePath);

    for (const gameObject of this.getGameObjectsWithScriptableItem(
      sceneGraph,
    )) {
      const resolvedPath = this.resolveScriptableItemSourcePath(
        sceneGraphPath,
        gameObject,
      );
      if (!resolvedPath) {
        continue;
      }

      const normalizedResolvedPath = path.resolve(resolvedPath);
      if (normalizedResolvedPath === normalizedTargetPath) {
        return gameObject;
      }

      const resolvedBaseName = path.basename(normalizedResolvedPath);
      const targetBaseName = path.basename(normalizedTargetPath);
      if (resolvedBaseName === targetBaseName) {
        return gameObject;
      }

      const sourceCodeAsset = gameObject.components.find(
        (comp) =>
          comp.type === "ClusterVR.CreatorKit.Item.Implements.ScriptableItem" &&
          comp.enabled,
      )?.properties?.Source_Code_Asset;

      if (
        typeof sourceCodeAsset === "string" &&
        sourceCodeAsset.length > 0 &&
        path.basename(sourceCodeAsset, path.extname(sourceCodeAsset)) ===
          path.basename(targetBaseName, path.extname(targetBaseName))
      ) {
        return gameObject;
      }
    }

    return null;
  }

  static findGameObjectsForSourceFile(
    sceneGraphPath: string,
    sceneGraph: SceneGraph,
    sourceFilePath: string,
  ): GameObject[] {
    const normalizedTargetPath = path.resolve(sourceFilePath);
    const scriptableObjects = this.getGameObjectsWithScriptableItem(sceneGraph);
    const resolvedPathMatches = scriptableObjects.filter((gameObject) => {
      const resolvedPath = this.resolveScriptableItemSourcePath(
        sceneGraphPath,
        gameObject,
      );
      return (
        resolvedPath !== null &&
        path.resolve(resolvedPath) === normalizedTargetPath
      );
    });
    if (resolvedPathMatches.length > 0) {
      return resolvedPathMatches;
    }

    const targetBaseName = path.basename(normalizedTargetPath);
    const resolvedBaseNameMatches = scriptableObjects.filter((gameObject) => {
      const resolvedPath = this.resolveScriptableItemSourcePath(
        sceneGraphPath,
        gameObject,
      );
      return (
        resolvedPath !== null &&
        path.basename(path.resolve(resolvedPath)) === targetBaseName
      );
    });
    if (resolvedBaseNameMatches.length > 0) {
      return resolvedBaseNameMatches;
    }

    const targetNameWithoutExtension = path.basename(
      targetBaseName,
      path.extname(targetBaseName),
    );
    return scriptableObjects.filter((gameObject) => {
      const sourceCodeAsset = gameObject.components.find(
        (component) =>
          component.type ===
            "ClusterVR.CreatorKit.Item.Implements.ScriptableItem" &&
          component.enabled,
      )?.properties?.Source_Code_Asset;

      return (
        typeof sourceCodeAsset === "string" &&
        sourceCodeAsset.length > 0 &&
        path.basename(sourceCodeAsset, path.extname(sourceCodeAsset)) ===
          targetNameWithoutExtension
      );
    });
  }

  /**
   * SceneGraph に紐づく ScriptableItem のソースファイル一覧を取得する。
   */
  static getScriptableItemSourcePaths(
    sceneGraphPath: string,
    sceneGraph: SceneGraph,
  ): string[] {
    const paths = new Set<string>();

    for (const gameObject of sceneGraph.gameObjects) {
      const resolvedPath = this.resolveScriptableItemSourcePath(
        sceneGraphPath,
        gameObject,
      );
      if (resolvedPath) {
        paths.add(resolvedPath);
      }
    }

    return Array.from(paths);
  }

  /**
   * ScriptableItem コンポーネントの Source_Code_Asset を解決し、対応する TS ファイルのパスを返す。
   * 参照先が SceneGraph と同じディレクトリにある場合はそのパスを返し、そうでなければ
   * SceneGraph のディレクトリから相対解決する。
   */
  static resolveScriptableItemSourcePath(
    sceneGraphPath: string,
    gameObject: GameObject,
  ): string | null {
    const scriptableComponent = gameObject.components.find(
      (comp) =>
        comp.type === "ClusterVR.CreatorKit.Item.Implements.ScriptableItem" &&
        comp.enabled,
    );

    if (!scriptableComponent) {
      return null;
    }

    const sourceCodeAsset = scriptableComponent.properties?.Source_Code_Asset;
    if (typeof sourceCodeAsset !== "string" || sourceCodeAsset.length === 0) {
      return null;
    }

    const sceneGraphDir = path.dirname(sceneGraphPath);
    const baseName = path.basename(
      sourceCodeAsset,
      path.extname(sourceCodeAsset),
    );
    const candidatePaths = [
      path.resolve(sceneGraphDir, sourceCodeAsset),
      path.resolve(sceneGraphDir, `${sourceCodeAsset}.ts`),
      path.resolve(sceneGraphDir, `${sourceCodeAsset}.js`),
      path.resolve(sceneGraphDir, sourceCodeAsset.replace(/\.ts$/, "")),
      path.resolve(sceneGraphDir, `${baseName}.ts`),
      path.resolve(sceneGraphDir, `${baseName}.js`),
    ];

    for (const candidatePath of candidatePaths) {
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    const matchingFiles = this.findFilesByBasename(sceneGraphDir, baseName);
    if (matchingFiles.length > 0) {
      return matchingFiles[0] ?? null;
    }

    return null;
  }

  private static findFilesByBasename(
    rootDir: string,
    baseName: string,
  ): string[] {
    const results: string[] = [];

    if (!fs.existsSync(rootDir)) {
      return results;
    }

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.findFilesByBasename(fullPath, baseName));
      } else if (
        entry.isFile() &&
        (entry.name === `${baseName}.ts` || entry.name === `${baseName}.js`)
      ) {
        results.push(fullPath);
      }
    }

    return results;
  }

  /**
   * 特定のコンポーネントを持たないGameObjectをすべて取得
   */
  static getGameObjectsWithoutComponent(
    sceneGraph: SceneGraph,
    componentType: string,
  ): GameObject[] {
    return sceneGraph.gameObjects.filter(
      (obj) =>
        !obj.components.some(
          (comp) => comp.type === componentType && comp.enabled,
        ),
    );
  }

  /**
   * GameObjectのコンポーネント統計
   */
  static analyzeComponentDistribution(
    sceneGraph: SceneGraph,
  ): Map<string, number> {
    const distribution = new Map<string, number>();

    for (const obj of sceneGraph.gameObjects) {
      for (const comp of obj.components) {
        if (comp.enabled) {
          const count = distribution.get(comp.type) || 0;
          distribution.set(comp.type, count + 1);
        }
      }
    }

    return distribution;
  }

  /**
   * GameObjectの構造を可視化（デバッグ用）
   */
  static visualizeHierarchy(sceneGraph: SceneGraph): string {
    const lines: string[] = [];

    const roots = sceneGraph.gameObjects.filter((obj) => !obj.parent);

    const printNode = (obj: GameObject, depth: number = 0) => {
      const indent = "  ".repeat(depth);
      const componentNames = obj.components
        .filter((c) => c.enabled)
        .map((c) => c.type.split(".").pop())
        .join(", ");

      lines.push(
        `${indent}${obj.name}${componentNames ? ` [${componentNames}]` : ""}`,
      );

      const children = sceneGraph.gameObjects.filter(
        (o) => o.parent === obj.id,
      );
      for (const child of children) {
        printNode(child, depth + 1);
      }
    };

    for (const root of roots) {
      printNode(root);
    }

    return lines.join("\n");
  }
}
