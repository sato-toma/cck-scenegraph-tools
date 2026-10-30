---
name: scenegraph-change
description: "Use when changing Unity SceneGraph TOML export, parsing, component constraints, ClusterScript analysis, fixtures, or cross-package integration."
---

# SceneGraph Change Workflow

1. Identify whether the change owns the Unity exporter, TOML parser/schema, TypeScript parser, rules, validator, CLI, or CI.
2. Read `docs/repository-guide.md`, `docs/architecture/data-flow.md`, and `docs/schema/scene-graph-toml.md` before changing a cross-package contract.
3. Keep the smallest compatible change. Preserve existing TOML keys unless an ADR describes the migration.
4. Add a focused fixture or test for the changed behavior. Include a negative case when the change affects static analysis.
5. For exporter changes, verify full export and selected/delta export separately.
6. For analyzer changes, run `npm run verify` in `packages/ts-analyzer`.
7. Update the schema document or ADR when behavior or compatibility changes, and update the related GitHub issue.
8. Report the changed contract, tests run, and any Unity-only validation that was unavailable.

## ClusterScript API rule scope

- Exclude APIs identified as beta in the official ClusterScript API documentation from rule implementation and API coverage by default.
- Check the current official API documentation before selecting an API; do not infer beta status from the API name alone.
- Handle beta APIs only when the user explicitly requests them.
- Keep this scope policy separate from the per-API backlog and rule definitions.

## Researching ClusterScript API rules

Before implementing or changing a rule, follow its method entry in the official [ClusterScript API reference](https://docs.cluster.mu/script/interfaces/ClusterScript.html) and inspect the corresponding declaration and documentation in `packages/unity-semantic-graph/Samples~/Assets/Script/external/index.d.ts`. The official reference is the current public contract; the local declaration helps verify callback signatures and supports the sample project's TypeScript build. If the two disagree, do not silently choose one: record the discrepancy and ask which contract to follow.

For each API, record the source links and separate:

1. Explicit API requirements (such as a required component or a top-level-only registration constraint).
2. Additional conditions documented by related Creator Kit component documentation.
3. Behaviors not explicitly required by the API docs and therefore not enforced by the analyzer.

Use the API-specific official documentation to establish its requirements. Follow each referenced Creator Kit component to its official component page and inspect required fields, dependencies, and hierarchy constraints. Use the repository's actual examples in `packages/unity-semantic-graph/Samples~/Assets/Script` and `packages/unity-semantic-graph/Samples~/Assets/test.unity`; do not embed API-specific example code in this Skill. Do not turn an inferred condition into a rule without evidence and a focused test. Tests should include a violating case and a satisfying case for each enforced condition. Keep the backlog's Unity verification notes distinct from requirements stated by the API and component references.

For Unity-backed rule verification, use the same flow as neighboring API-confirmation objects in `packages/unity-semantic-graph/Samples~/Assets/test.unity`: attach the TypeScript build output from `Assets/Script/dist` to a ScriptableItem on the matching GameObject, export SceneGraph from Unity, and analyze the source TypeScript against that export. Verify both a negative configuration and a successful configuration, and leave the final scene in the successful configuration. Record related component documentation and its constraints in `docs/analysis-rule-backlog.md`.

## Local re-export and analysis check

Use this flow whenever the sample Unity project (`packages/unity-semantic-graph/Samples~`) changes (new GameObject, new script wiring, new component) and you need to confirm `SceneGraph.toml` and the analyzer agree with it.

1. Add/change the GameObject or script in the Unity Editor GUI yourself (do not fabricate scene content via a one-off Editor C# script — edit the actual `.unity` scene through Unity).
2. Re-export `SceneGraph.toml` from the batch command documented in `docs/repository-guide.md`:
   ```powershell
   & "<UnityEditorPath>\Unity.exe" -batchmode -quit `
     -projectPath "packages/unity-semantic-graph/Samples~" `
     -executeMethod UnitySemanticGraph.Editor.Exporter.SelectiveComponentTomlExporter.ExportGraphToToml `
     -scenePath "Assets/test.unity" `
     -outputPath "Assets/SceneGraph.toml"
   ```
   Exit code `0` means success; `1` means the export failed (check the Unity log for the reason).
3. If the exporter method can't be found or the package won't resolve, check `Samples~/Packages/manifest.json`: the `com.azuki.unity-semantic-graph` dependency is a git URL pointing at this repository. If the repo was renamed on GitHub, update that URL (and the local `origin` remote) to match, then re-run step 2 so Unity re-resolves the package and regenerates `Samples~/Packages/packages-lock.json`.
4. Confirm the new/changed GameObject appears in `SceneGraph.toml` (e.g. `grep` for its path or script asset name). Note: `Samples~/Assets/SceneGraph.toml` is untracked (matched by `*~` in `.github/skills` context / gitignore) — it's a local fixture, not committed.
5. Run the TypeScript analyzer against the updated TOML and the relevant ClusterScript (see `docs/repository-guide.md` "Export and Analyze" section, or `npm run verify` in `packages/ts-analyzer` for the full unit-test suite) to confirm the constraint check passes/fails as expected.
6. Report: what scene content changed, the export exit code, the resulting TOML diff (GameObject/components), and the analyzer result.
