---
name: unity-sample-maintenance
description: "Use when inspecting or maintaining Unity sample scenes, GameObjects, components, ScriptableItem wiring, or verifying ClusterScript behavior through Unity CLI MCP."
---

# Unity Sample Maintenance

## Scope

This Skill owns changes to the Unity sample project's scenes and Unity-authored content, including GameObjects, components, and ScriptableItem references. It also owns the sample-scene portion of ClusterScript API verification.

- Use [unity-mcp-setup](../unity-mcp-setup/SKILL.md) for Unity CLI MCP installation, configuration, and connection troubleshooting.
- Use [scenegraph-change](../scenegraph-change/SKILL.md) for exporter, SceneGraph TOML, analyzer, API-rule, fixture, and cross-package contract changes.
- Keep API requirements and verification results in `docs/analysis-rule-backlog.md`. The generic `Samples~/Assets/Script/README.md` is for general setup/build information; do not add API-specific findings or test instructions there.

## Safety and Authorization

1. Check Unity CLI MCP status before using Unity tools. Follow `unity-mcp-setup` for setup and connection checks.
2. Use MCP tools for Unity scene inspection and maintenance. Discover current tool names and supported operations; do not guess tool capabilities.
3. Treat MCP as read-only by default. Before any mutating tool call, present the concrete scene, object, component, and script-reference changes and obtain explicit approval.
4. If the MCP server, required tool, or approved operation is unavailable, stop. Report the blocker and ask before changing workflows.
5. Never edit `.unity` scene files directly, generate one-off Unity Editor scripts to fabricate scene content, or use another workaround for unavailable MCP operations.

## API Verification Workflow

1. Inspect existing ClusterScript source files and corresponding objects in `Samples~/Assets/test.unity` before proposing changes.
2. Prefer an existing script and scene object that isolate the API condition. Do not invent standalone sample code merely because a rule needs more evidence.
3. If existing samples cannot isolate the condition, explain why and ask before adding a sample script or Unity object. An approved new script must be connected to the actual Unity sample workflow; never leave an unwired sample script.
4. After approval, use Unity MCP to configure the selected sample object and its ScriptableItem reference. Do not change unrelated scene content.
5. If approved sample TypeScript source changes, build it from `packages/unity-semantic-graph/Samples~/Assets/Script` and use the resulting `Assets/Script/dist` output for the scene reference.
6. Verify a negative configuration and a satisfying configuration. Restore the scene to the successful configuration at the end.
7. Use `npm run scenegraph:analyze` with the target Unity project, scene, and script. It runs the batch exporter, `WorldUploadValidator` upload checks, and TypeScript analysis. Confirm the intended object and components appear in the export. For manual exports, run `WorldUploadValidator` before claiming the scene is uploadable.
8. Record Unity observations separately from official API/component requirements in `docs/analysis-rule-backlog.md`. Do not claim Cluster runtime verification unless it was actually performed. Do not publish or upload a world unless explicitly requested.
9. Report MCP operations performed, scene changes, export and analyzer results, and any unverified Unity/Cluster behavior.

## Export and Analysis

Use the repository's documented batch export command after approved scene changes:

```powershell
& "<UnityEditorPath>\Unity.exe" -batchmode -quit `
  -projectPath "packages/unity-semantic-graph/Samples~" `
  -executeMethod UnitySemanticGraph.Editor.Exporter.SelectiveComponentTomlExporter.ExportGraphToToml `
  -scenePath "Assets/test.unity" `
  -outputPath "Assets/SceneGraph.toml"
```

Exit code `0` indicates a successful export; exit code `1` indicates failure. Consult the Unity log for the cause. The generated `Samples~/Assets/SceneGraph.toml` is local and untracked. Analyze it with the relevant TypeScript source using the procedure in `docs/repository-guide.md`.
