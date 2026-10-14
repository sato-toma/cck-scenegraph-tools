import { ConstraintValidator } from "../../validation/constraintValidator";
import { SceneGraphParser } from "../../sceneGraph/sceneGraphParser";
import {
  ComponentConstraint,
  ComponentRequirementRequest,
  ComponentRequirementTarget,
  SceneGraph,
} from "../../domain/types";

/** Resolves a request to its owning ScriptableItem and validates it. */
export class ComponentRequirementValidator {
  static validate(
    requests: ComponentRequirementRequest[],
    sceneGraphPath: string,
    sceneGraph: SceneGraph,
    sourceFilePath: string,
  ): ComponentRequirementRequest[] {
    const targets = SceneGraphParser.findGameObjectsForSourceFile(
      sceneGraphPath,
      sceneGraph,
      sourceFilePath,
    );

    return requests.map((request) => {
      if (targets.length > 1) {
        const verificationStatus =
          request.verificationStatus === "unsupported"
            ? "unsupported"
            : request.api === "$.getUnityComponent"
              ? "unverified"
              : "ambiguous";
        const verificationReason =
          verificationStatus === "ambiguous"
            ? "Multiple ScriptableItem GameObjects reference this source file; the target cannot be determined."
            : request.occurrences[0]?.evidence;
        return this.withStatus(
          request,
          verificationStatus,
          {
            kind: "current-scriptable-item",
            resolution: "ambiguous",
            candidates: targets.map(({ id, path }) => ({
              gameObjectId: id,
              gameObjectPath: path,
            })),
          },
          verificationReason,
        );
      }

      const target = targets[0];
      if (!target) {
        const verificationReason =
          request.verificationStatus === "unverified"
            ? "No ScriptableItem GameObject could be mapped to this source file."
            : request.occurrences[0]?.evidence;
        return this.withStatus(
          request,
          request.verificationStatus,
          {
            kind: "current-scriptable-item",
            resolution: "unresolved",
          },
          verificationReason,
        );
      }

      const resolvedTarget: ComponentRequirementTarget = {
        kind: "current-scriptable-item" as const,
        resolution: "resolved" as const,
        gameObjectId: target.id,
        gameObjectPath: target.path,
      };

      if (request.verificationStatus === "unsupported") {
        return this.withStatus(
          request,
          "unsupported",
          resolvedTarget,
          request.occurrences[0]?.evidence,
        );
      }

      if (request.api === "$.getUnityComponent") {
        return this.withStatus(
          request,
          "unverified",
          resolvedTarget,
          "A component lookup does not establish that the component is required.",
        );
      }

      if (
        request.componentTypes.length === 0 ||
        request.componentMatch === "unknown"
      ) {
        return this.withStatus(
          request,
          "unsupported",
          resolvedTarget,
          "The extracted component requirement has no supported type match.",
        );
      }

      const constraints = this.toConstraints(request);
      const validation = ConstraintValidator.validateGameObject(
        target,
        constraints,
        sceneGraph,
      );
      const matchedComponents = SceneGraphParser.getGameObjectsInHierarchy(
        sceneGraph,
        target,
      ).flatMap((gameObject) =>
        gameObject.components
          .filter(
            (component) =>
              component.enabled &&
              request.componentTypes.includes(component.type),
          )
          .map((component) => ({
            gameObjectId: gameObject.id,
            gameObjectPath: gameObject.path,
            componentId: component.id,
            componentType: component.type,
          })),
      );
      const availableTypes = new Set(
        matchedComponents.map((component) => component.componentType),
      );
      const presentComponentTypes = request.componentTypes.filter((type) =>
        availableTypes.has(type),
      );
      const missingComponentTypes =
        request.componentMatch === "any" && presentComponentTypes.length > 0
          ? []
          : request.componentTypes.filter((type) => !availableTypes.has(type));

      return {
        ...request,
        target: resolvedTarget,
        verificationStatus: validation.isValid ? "satisfied" : "missing",
        validation: {
          presentComponentTypes,
          missingComponentTypes,
          matchedComponents,
        },
      };
    });
  }

  private static toConstraints(
    request: ComponentRequirementRequest,
  ): ComponentConstraint[] {
    if (request.componentMatch === "any") {
      return [
        {
          componentType: request.componentTypes,
          requirement: "required",
        },
      ];
    }

    return request.componentTypes.map((componentType) => ({
      componentType,
      requirement: "required",
    }));
  }

  private static withStatus(
    request: ComponentRequirementRequest,
    verificationStatus: ComponentRequirementRequest["verificationStatus"],
    target: ComponentRequirementTarget,
    verificationReason?: string,
  ): ComponentRequirementRequest {
    const result: ComponentRequirementRequest = {
      ...request,
      target,
      verificationStatus,
      validation: {
        presentComponentTypes: [],
        missingComponentTypes: [],
        matchedComponents: [],
      },
    };

    if (verificationReason === undefined) {
      delete result.verificationReason;
    } else {
      result.verificationReason = verificationReason;
    }

    return result;
  }
}
