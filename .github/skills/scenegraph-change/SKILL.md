---
name: scenegraph-change
description: "Use when changing SceneGraph TOML export or parsing, analyzer rules and constraints, fixtures, or cross-package contracts."
---

# SceneGraph and Analyzer Changes

## Scope

This Skill owns the Unity exporter code, SceneGraph TOML contract and parser, TypeScript analyzer, validation rules, tests, and cross-package integration. It does not own Unity Editor/MCP setup or changes to sample-scene content.

- Use [unity-mcp-setup](../unity-mcp-setup/SKILL.md) for Unity CLI MCP installation, configuration, and connection troubleshooting.
- Use [unity-sample-maintenance](../unity-sample-maintenance/SKILL.md) for inspecting or changing Unity sample scenes, components, script wiring, and Unity-backed API verification.

## Workflow

1. Identify whether the change owns the Unity exporter, TOML parser/schema, TypeScript parser, rules, validator, CLI, or CI.
2. Read `docs/repository-guide.md`, `docs/architecture/data-flow.md`, and `docs/schema/scene-graph-toml.md` before changing a cross-package contract.
3. Keep the smallest compatible change. Preserve existing TOML keys unless an ADR describes the migration.
4. Add focused tests for changed behavior. Static-analysis rules need both violating and satisfying cases.
5. For exporter changes, verify full export and selected/delta export separately.
6. For analyzer changes, run `npm run verify` in `packages/ts-analyzer`.
7. Update the schema document or ADR when behavior or compatibility changes, and update the related GitHub issue.
8. Report changed contracts, tests run, and any Unity-only validation that was unavailable.

## ClusterScript API Rule Research

- Exclude APIs identified as beta in the current official ClusterScript API documentation from rule implementation and API coverage by default. Handle beta APIs only when the user explicitly requests them.
- Before implementing or changing a rule, inspect the API entry in the official [ClusterScript API reference](https://docs.cluster.mu/script/interfaces/ClusterScript.html) and its declaration/documentation in `packages/unity-semantic-graph/Samples~/Assets/Script/external/index.d.ts`. The official reference is the public contract; the local declaration helps verify signatures and sample-project compatibility. If they disagree, record the discrepancy and ask which contract to follow.
- Inspect the related official Creator Kit component documentation for component dependencies, required fields, and hierarchy constraints.
- Keep separate in the analysis: explicit API requirements, additional component-documented conditions, and behaviors not required by the API docs and therefore not enforced by the analyzer.
- Do not infer a constraint from an API name or from a sample that only demonstrates the successful configuration. Do not add a rule until the condition has evidence and focused tests.
- Use existing scripts and objects as evidence. Do not invent API sample code as a substitute for missing verification.
- Record API sources, requirements, and Unity verification status in `docs/analysis-rule-backlog.md`. Keep verification observations distinct from official requirements; do not put API-specific test instructions or findings in the generic sample README.

## Unity Verification Handoff

When a rule needs Unity-backed evidence, follow [unity-sample-maintenance](../unity-sample-maintenance/SKILL.md) for all sample-scene inspection, setup, MCP operations, export, and dynamic verification. If the required condition cannot be established from sources or an approved Unity check, leave it unresolved and ask how to proceed rather than adding a speculative rule.
