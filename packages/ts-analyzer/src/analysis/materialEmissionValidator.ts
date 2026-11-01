import {
  SceneGraph,
  ValidationIssue,
  Component,
  MaterialRecord,
} from "../domain/types";
import { SceneGraphParser } from "../sceneGraph/sceneGraphParser";
import {
  Token,
  createSourceIssue,
  findClosingParenIndex,
  getCallArguments,
  getStringArgument,
  tokenizeSource,
} from "./sourceTokens";

const ITEM_MATERIAL_SET_LIST_TYPE =
  "ClusterVR.CreatorKit.Item.Implements.ItemMaterialSetList";
const ITEM_MATERIAL_SETS_PROPERTY = "Item_Material_Sets";
const SET_EMISSION_COLOR = "setEmissionColor";

/**
 * $.material("<id>") で取得した Material に対する setEmissionColor の前提を検査する。
 * Material が _EMISSION キーワードを有効にしていない場合は警告する。
 */
export class MaterialEmissionValidator {
  static validate(
    source: string,
    sceneGraphPath: string,
    sceneGraph: SceneGraph,
    sourceFilePath: string,
  ): ValidationIssue[] {
    const tokens = tokenizeSource(source);
    const issues: ValidationIssue[] = [];

    for (let index = 0; index + 3 < tokens.length; index += 1) {
      if (
        tokens[index]?.text !== "$" ||
        tokens[index + 1]?.text !== "." ||
        tokens[index + 2]?.text !== "material" ||
        tokens[index + 3]?.text !== "("
      ) {
        continue;
      }

      const args = getCallArguments(tokens, index + 3);
      const idArgument =
        args?.length === 1 ? getStringArgument(args[0]) : undefined;
      if (!idArgument || idArgument.value === undefined) {
        continue;
      }

      const usages = this.findSetEmissionColorUsages(tokens, index);
      if (usages.length === 0) {
        continue;
      }

      const resolved = this.resolveMaterial(
        sceneGraphPath,
        sceneGraph,
        sourceFilePath,
        idArgument.value,
      );

      for (const usage of usages) {
        if (resolved.kind === "unverified") {
          issues.push(
            createSourceIssue(
              source,
              usage,
              "warning",
              "UNVERIFIED_MATERIAL_EMISSION",
              resolved.reason,
              SET_EMISSION_COLOR,
            ),
          );
        } else if (!resolved.material.emissionEnabled) {
          issues.push(
            createSourceIssue(
              source,
              usage,
              "warning",
              "MATERIAL_EMISSION_DISABLED",
              `setEmissionColor is called on material "${idArgument.value}" (${resolved.material.name}), but its _EMISSION keyword is disabled. Enable Emission on the Material.`,
              SET_EMISSION_COLOR,
            ),
          );
        }
      }
    }

    return issues;
  }

  /**
   * $.material(...) の直後のチェーン呼び出し、または代入先変数経由の setEmissionColor を探す。
   */
  private static findSetEmissionColorUsages(
    tokens: Token[],
    materialIndex: number,
  ): Token[] {
    const usages: Token[] = [];
    const openParenIndex = materialIndex + 3;
    const closingIndex = findClosingParenIndex(tokens, openParenIndex);
    if (closingIndex === undefined) {
      return usages;
    }

    if (this.isMethodCallAt(tokens, closingIndex + 1)) {
      usages.push(tokens[closingIndex + 2]!);
    }

    const variableName = this.getAssignedVariableName(tokens, materialIndex);
    if (variableName !== undefined) {
      for (let index = closingIndex + 1; index < tokens.length; index += 1) {
        if (
          tokens[index]?.text === variableName &&
          tokens[index - 1]?.text !== "." &&
          this.isMethodCallAt(tokens, index + 1)
        ) {
          usages.push(tokens[index + 2]!);
        }
      }
    }

    return usages.filter((token) => token.text === SET_EMISSION_COLOR);
  }

  /**
   * tokens[index] が "." "setEmissionColor" "(" の並びかを判定する。
   */
  private static isMethodCallAt(tokens: Token[], index: number): boolean {
    return (
      tokens[index]?.text === "." &&
      tokens[index + 1]?.text === SET_EMISSION_COLOR &&
      tokens[index + 2]?.text === "("
    );
  }

  /**
   * "const x = $.material(" の形から変数名 x を取り出す。
   */
  private static getAssignedVariableName(
    tokens: Token[],
    materialIndex: number,
  ): string | undefined {
    if (tokens[materialIndex - 1]?.text !== "=") {
      return undefined;
    }
    const name = tokens[materialIndex - 2]?.text;
    const keyword = tokens[materialIndex - 3]?.text;
    if (
      name === undefined ||
      !/^[A-Za-z_$][\w$]*$/.test(name) ||
      (keyword !== "const" && keyword !== "let" && keyword !== "var")
    ) {
      return undefined;
    }
    return name;
  }

  private static resolveMaterial(
    sceneGraphPath: string,
    sceneGraph: SceneGraph,
    sourceFilePath: string,
    materialId: string,
  ):
    | { kind: "resolved"; material: MaterialRecord }
    | { kind: "unverified"; reason: string } {
    const targets = SceneGraphParser.findGameObjectsForScriptableItemSourceFile(
      sceneGraphPath,
      sceneGraph,
      sourceFilePath,
    );
    if (targets.length !== 1) {
      return {
        kind: "unverified",
        reason:
          "Could not verify setEmissionColor because this script is not mapped to exactly one ScriptableItem.",
      };
    }

    const guid = this.findMaterialGuid(targets[0]!.components, materialId);
    if (guid === undefined) {
      return {
        kind: "unverified",
        reason: `Could not verify setEmissionColor because material id "${materialId}" was not found in an enabled ItemMaterialSetList.`,
      };
    }

    const material = sceneGraph.materials?.find(
      (candidate) => candidate.guid === guid,
    );
    if (!material) {
      return {
        kind: "unverified",
        reason: `Could not verify setEmissionColor because material "${guid}" is missing from SceneGraph.materials. Re-export the scene.`,
      };
    }

    return { kind: "resolved", material };
  }

  /**
   * ItemMaterialSetList の "<id>=<guid>" 形式の値から guid を取り出す。
   * guid に '=' は含まれないため、区切りは最後の '=' とする。
   */
  private static findMaterialGuid(
    components: Component[],
    materialId: string,
  ): string | undefined {
    for (const component of components) {
      if (
        !component.enabled ||
        component.type !== ITEM_MATERIAL_SET_LIST_TYPE
      ) {
        continue;
      }

      const entries = component.properties?.[ITEM_MATERIAL_SETS_PROPERTY];
      if (!Array.isArray(entries)) {
        continue;
      }

      for (const entry of entries) {
        if (typeof entry !== "string") {
          continue;
        }
        const separator = entry.lastIndexOf("=");
        if (separator <= 0) {
          continue;
        }
        if (entry.slice(0, separator) === materialId) {
          return entry.slice(separator + 1);
        }
      }
    }

    return undefined;
  }
}
