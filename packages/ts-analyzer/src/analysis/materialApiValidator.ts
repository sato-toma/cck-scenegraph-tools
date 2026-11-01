import { Component, SceneGraph, ValidationIssue } from "../domain/types";
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
const RENDERER_MATERIAL_GUIDS_PROPERTY = "Renderer_Material_Guids";
const SET_EMISSION_COLOR = "setEmissionColor";
const MATERIAL_ID_PATTERN = /^[A-Za-z0-9',._-]{1,64}$/;

export class MaterialApiValidator {
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

      const callToken = tokens[index + 2]!;
      const args = getCallArguments(tokens, index + 3);
      const idArgument =
        args?.length === 1 ? getStringArgument(args[0]) : undefined;
      if (!idArgument || idArgument.value === undefined) {
        issues.push(
          createSourceIssue(
            source,
            callToken,
            "warning",
            "UNVERIFIED_MATERIAL_ID",
            "$.material must receive a statically verifiable string ID; dynamic or escaped IDs cannot be checked.",
            "material",
          ),
        );
        continue;
      }

      if (!MATERIAL_ID_PATTERN.test(idArgument.value)) {
        issues.push(
          createSourceIssue(
            source,
            idArgument.token,
            "error",
            "INVALID_MATERIAL_ID",
            "Material IDs must contain 1-64 letters, digits, apostrophes, commas, hyphens, periods, or underscores.",
            "material",
          ),
        );
        continue;
      }

      const targets = SceneGraphParser.findGameObjectsForScriptableItemSourceFile(
        sceneGraphPath,
        sceneGraph,
        sourceFilePath,
      );
      if (targets.length !== 1) {
        issues.push(
          createSourceIssue(
            source,
            callToken,
            "warning",
            "UNVERIFIED_MATERIAL_ID",
            "Could not verify the material ID because this source is not mapped to exactly one ScriptableItem.",
            "material",
          ),
        );
        continue;
      }

      const target = targets[0]!;
      const materialGuid = this.findMaterialGuid(
        target.components,
        idArgument.value,
      );
      if (materialGuid === undefined) {
        const hasEnabledList = target.components.some(
          (component) =>
            component.enabled &&
            component.type === ITEM_MATERIAL_SET_LIST_TYPE,
        );
        if (hasEnabledList) {
          issues.push(
            createSourceIssue(
              source,
              idArgument.token,
              "error",
              "MATERIAL_ID_NOT_REGISTERED",
              `Material ID "${idArgument.value}" is not registered in this Item's enabled ItemMaterialSetList.`,
              "material",
            ),
          );
        }
        continue;
      }

      this.validateRendererAssignment(
        source,
        idArgument.token,
        sceneGraph,
        target,
        materialGuid,
        issues,
      );

      const emissionUsages = this.findSetEmissionColorUsages(tokens, index);
      if (emissionUsages.length === 0) {
        continue;
      }

      const material = sceneGraph.materials?.find(
        (candidate) => candidate.guid === materialGuid,
      );
      for (const usage of emissionUsages) {
        if (!material) {
          issues.push(
            createSourceIssue(
              source,
              usage,
              "warning",
              "UNVERIFIED_IMPLICIT_MATERIAL_EMISSION",
              "Could not check the implicit Emission convention because this Material is missing from SceneGraph.materials; re-export the scene.",
              SET_EMISSION_COLOR,
            ),
          );
        } else if (!material.emissionEnabled) {
          issues.push(
            createSourceIssue(
              source,
              usage,
              "warning",
              "IMPLICIT_MATERIAL_EMISSION_DISABLED",
              `Implicit rule based on observed behavior: setEmissionColor may not affect the rendered color while Material "${material.name}" has the _EMISSION keyword disabled. This is not an official ClusterScript API requirement.`,
              SET_EMISSION_COLOR,
            ),
          );
        }
      }
    }

    return issues;
  }

  private static validateRendererAssignment(
    source: string,
    idToken: Token,
    sceneGraph: SceneGraph,
    target: SceneGraph["gameObjects"][number],
    materialGuid: string,
    issues: ValidationIssue[],
  ): void {
    const itemObjects = [
      target,
      ...SceneGraphParser.getGameObjectDescendants(sceneGraph, target),
    ];
    const renderers = itemObjects.flatMap((gameObject) =>
      gameObject.components.filter(
        (component) =>
          component.enabled && this.isRendererComponent(component),
      ),
    );
    if (renderers.length === 0) {
      return;
    }

    const rendererProperties = renderers.map(
      (renderer) => renderer.properties?.[RENDERER_MATERIAL_GUIDS_PROPERTY],
    );
    if (
      rendererProperties.some(
        (value) =>
          !Array.isArray(value) ||
          !value.every((material) => typeof material === "string"),
      )
    ) {
      issues.push(
        createSourceIssue(
          source,
          idToken,
          "warning",
          "UNVERIFIED_MATERIAL_RENDERER_ASSIGNMENT",
          "Could not verify that this ItemMaterialSetList Material is assigned to a Renderer; re-export with Renderer material references.",
          "material",
        ),
      );
      return;
    }

    const assigned = rendererProperties.some(
      (value) =>
        Array.isArray(value) && value.some((material) => material === materialGuid),
    );
    if (!assigned) {
      issues.push(
        createSourceIssue(
          source,
          idToken,
          "error",
          "MATERIAL_NOT_ASSIGNED_TO_RENDERER",
          `Material ID is registered, but its Material is not assigned to a Renderer on "${target.path}" or a descendant.`,
          "material",
        ),
      );
    }
  }

  private static isRendererComponent(component: Component): boolean {
    return (
      component.type === "UnityEngine.MeshRenderer" ||
      component.type === "UnityEngine.SkinnedMeshRenderer" ||
      component.type === "UnityEngine.SpriteRenderer" ||
      component.type === "UnityEngine.LineRenderer" ||
      component.type === "UnityEngine.TrailRenderer" ||
      component.type === "UnityEngine.ParticleSystemRenderer" ||
      component.type === "UnityEngine.Tilemaps.TilemapRenderer"
    );
  }

  private static findSetEmissionColorUsages(
    tokens: Token[],
    materialIndex: number,
  ): Token[] {
    const openParenIndex = materialIndex + 3;
    const closingIndex = findClosingParenIndex(tokens, openParenIndex);
    if (closingIndex === undefined) {
      return [];
    }

    const usages: Token[] = [];
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

  private static isMethodCallAt(tokens: Token[], index: number): boolean {
    return (
      tokens[index]?.text === "." &&
      tokens[index + 1]?.text === SET_EMISSION_COLOR &&
      tokens[index + 2]?.text === "("
    );
  }

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
