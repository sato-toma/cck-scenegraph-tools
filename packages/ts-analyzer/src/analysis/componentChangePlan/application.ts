import type { ComponentProperty } from "../../domain/types";
import { getApprovedComponentChanges } from "./approval";
import type { ComponentChangePlan } from "./index";

export interface UnityComponentApplicationTarget {
  handle: string;
  globalObjectId: string;
  hierarchyPath: string;
  componentPresent: boolean;
}

export interface UnityComponentApplicationBridge {
  inspectTarget(
    globalObjectId: string,
    componentType: string,
  ): Promise<UnityComponentApplicationTarget[]>;
  addComponent(
    target: Pick<UnityComponentApplicationTarget, "handle" | "globalObjectId">,
    componentType: string,
  ): Promise<void>;
  setComponentProperties(
    target: Pick<UnityComponentApplicationTarget, "handle" | "globalObjectId">,
    componentType: string,
    properties: ComponentProperty,
  ): Promise<void>;
}

export interface ComponentChangeApplicationRecord {
  actionId: string;
  componentType: string;
  phase: "before" | "add-component" | "set-properties" | "after";
  result: "observed" | "added" | "applied" | "skipped" | "verified" | "failed";
  target?: {
    globalObjectId: string;
    hierarchyPath: string;
  };
  componentPresent?: boolean;
  settings?: ComponentProperty;
  message?: string;
}

export class ComponentChangeApplicationError extends Error {
  constructor(
    message: string,
    readonly actionId: string,
    readonly records: ComponentChangeApplicationRecord[],
    readonly cause: unknown,
  ) {
    super(message);
    this.name = "ComponentChangeApplicationError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(
  actionId: string,
  message: string,
  records: ComponentChangeApplicationRecord[],
  cause?: unknown,
): never {
  throw new ComponentChangeApplicationError(message, actionId, [...records], cause);
}

async function inspectUniqueTarget(
  actionId: string,
  targetId: string,
  targetPath: string,
  componentType: string,
  phase: "before" | "after",
  bridge: UnityComponentApplicationBridge,
  records: ComponentChangeApplicationRecord[],
): Promise<UnityComponentApplicationTarget> {
  let candidates: UnityComponentApplicationTarget[];
  try {
    candidates = await bridge.inspectTarget(targetId, componentType);
  } catch (error) {
    records.push({
      actionId,
      componentType,
      phase,
      result: "failed",
      message: `Failed to inspect target: ${errorMessage(error)}`,
    });
    return fail(
      actionId,
      `Failed to inspect target for component change action ${actionId}.`,
      records,
      error,
    );
  }

  if (candidates.length !== 1) {
    records.push({
      actionId,
      componentType,
      phase,
      result: "failed",
      message: `Expected one target, found ${candidates.length}.`,
    });
    return fail(
      actionId,
      `Target is missing or ambiguous for component change action ${actionId}.`,
      records,
    );
  }

  const [target] = candidates;
  if (
    !target ||
    target.globalObjectId !== targetId ||
    target.hierarchyPath !== targetPath
  ) {
    records.push({
      actionId,
      componentType,
      phase,
      result: "failed",
      ...(target
        ? {
            target: {
              globalObjectId: target.globalObjectId,
              hierarchyPath: target.hierarchyPath,
            },
          }
        : {}),
      message: "Target identity or hierarchy path changed.",
    });
    return fail(
      actionId,
      `Target identity changed for component change action ${actionId}.`,
      records,
    );
  }

  records.push({
    actionId,
    componentType,
    phase,
    result: "observed",
    target: {
      globalObjectId: target.globalObjectId,
      hierarchyPath: target.hierarchyPath,
    },
    componentPresent: target.componentPresent,
  });
  return target;
}

async function recordStateAfterFailure(
  actionId: string,
  targetId: string,
  targetPath: string,
  componentType: string,
  bridge: UnityComponentApplicationBridge,
  records: ComponentChangeApplicationRecord[],
): Promise<void> {
  try {
    const candidates = await bridge.inspectTarget(targetId, componentType);
    const [target] = candidates;
    if (
      candidates.length !== 1 ||
      !target ||
      target.globalObjectId !== targetId ||
      target.hierarchyPath !== targetPath
    ) {
      records.push({
        actionId,
        componentType,
        phase: "after",
        result: "failed",
        message: "Unable to uniquely verify the target after the failed operation.",
      });
      return;
    }
    records.push({
      actionId,
      componentType,
      phase: "after",
      result: "observed",
      target: {
        globalObjectId: target.globalObjectId,
        hierarchyPath: target.hierarchyPath,
      },
      componentPresent: target.componentPresent,
    });
  } catch (error) {
    records.push({
      actionId,
      componentType,
      phase: "after",
      result: "failed",
      message: `Failed to inspect state after the failed operation: ${errorMessage(error)}`,
    });
  }
}

export async function applyApprovedComponentChangePlan(
  plan: ComponentChangePlan,
  bridge: UnityComponentApplicationBridge,
): Promise<ComponentChangeApplicationRecord[]> {
  const approved = getApprovedComponentChanges(plan);
  const records: ComponentChangeApplicationRecord[] = [];

  for (const [index, change] of approved.changes.entries()) {
    const action = plan.actions[index];
    if (!action) {
      throw new Error("Approved component change plan is inconsistent.");
    }

    const target = await inspectUniqueTarget(
      action.id,
      change.target.gameObjectId,
      change.target.gameObjectPath,
      change.componentType,
      "before",
      bridge,
      records,
    );

    if (target.componentPresent) {
      records.push({
        actionId: action.id,
        componentType: change.componentType,
        phase: "after",
        result: "skipped",
        target: {
          globalObjectId: target.globalObjectId,
          hierarchyPath: target.hierarchyPath,
        },
        componentPresent: true,
        message: "Component already exists; duplicate addition was prevented.",
      });
      continue;
    }

    try {
      await bridge.addComponent(
        { handle: target.handle, globalObjectId: target.globalObjectId },
        change.componentType,
      );
      records.push({
        actionId: action.id,
        componentType: change.componentType,
        phase: "add-component",
        result: "added",
        target: {
          globalObjectId: target.globalObjectId,
          hierarchyPath: target.hierarchyPath,
        },
      });
    } catch (error) {
      records.push({
        actionId: action.id,
        componentType: change.componentType,
        phase: "add-component",
        result: "failed",
        target: {
          globalObjectId: target.globalObjectId,
          hierarchyPath: target.hierarchyPath,
        },
        message: errorMessage(error),
      });
      await recordStateAfterFailure(
        action.id,
        change.target.gameObjectId,
        change.target.gameObjectPath,
        change.componentType,
        bridge,
        records,
      );
      fail(
        action.id,
        `MCP add_component failed for action ${action.id}; remaining changes were not applied.`,
        records,
        error,
      );
    }

    if (Object.keys(change.settings).length > 0) {
      try {
        await bridge.setComponentProperties(
          { handle: target.handle, globalObjectId: target.globalObjectId },
          change.componentType,
          { ...change.settings },
        );
        records.push({
          actionId: action.id,
          componentType: change.componentType,
          phase: "set-properties",
          result: "applied",
          target: {
            globalObjectId: target.globalObjectId,
            hierarchyPath: target.hierarchyPath,
          },
          settings: { ...change.settings },
        });
      } catch (error) {
        records.push({
          actionId: action.id,
          componentType: change.componentType,
          phase: "set-properties",
          result: "failed",
          target: {
            globalObjectId: target.globalObjectId,
            hierarchyPath: target.hierarchyPath,
          },
          settings: { ...change.settings },
          message: errorMessage(error),
        });
        await recordStateAfterFailure(
          action.id,
          change.target.gameObjectId,
          change.target.gameObjectPath,
          change.componentType,
          bridge,
          records,
        );
        fail(
          action.id,
          `MCP set_component_properties failed for action ${action.id}; remaining changes were not applied.`,
          records,
          error,
        );
      }
    }

    const after = await inspectUniqueTarget(
      action.id,
      change.target.gameObjectId,
      change.target.gameObjectPath,
      change.componentType,
      "after",
      bridge,
      records,
    );
    if (!after.componentPresent) {
      records.push({
        actionId: action.id,
        componentType: change.componentType,
        phase: "after",
        result: "failed",
        target: {
          globalObjectId: after.globalObjectId,
          hierarchyPath: after.hierarchyPath,
        },
        componentPresent: false,
        message: "Component was not found after the add operation.",
      });
      fail(
        action.id,
        `Component addition could not be verified for action ${action.id}; remaining changes were not applied.`,
        records,
      );
    }
    records.push({
      actionId: action.id,
      componentType: change.componentType,
      phase: "after",
      result: "verified",
      target: {
        globalObjectId: after.globalObjectId,
        hierarchyPath: after.hierarchyPath,
      },
      componentPresent: true,
    });
  }

  return records;
}
