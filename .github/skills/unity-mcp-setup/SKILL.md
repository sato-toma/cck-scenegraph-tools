---
name: unity-mcp-setup
description: "Use when setting up, verifying, or troubleshooting the Unity CLI MCP server for VS Code GitHub Copilot Agent mode, editing .mcp.json, or reading Unity scene data through MCP tools."
---

# Unity MCP Setup and Verification

Human-readable procedure: `docs/unity-mcp-setup.md`. Investigation results and SceneGraph mapping: `docs/unity-cli-mcp.md`. Read both before changing MCP configuration.

## Facts to rely on (verified 2026-10-12)

- Unity MCP is the server built into Unity CLI (`unity mcp`). Do not implement a custom MCP server.
- Verified versions: VS Code 1.141.0, Unity CLI 1.0.0-beta.13, Unity Editor 6000.2.6f2, `com.unity.pipeline` 0.8.0-exp.1.
- GitHub Copilot Chat (`GitHub.copilot-chat`) is bundled with VS Code and does not appear in `code --list-extensions`. Do not install the deprecated `GitHub.copilot`. No Unity-specific VS Code extension is needed.
- The server named `unity` is defined only in the root `.mcp.json` (`mcpServers`, relative project path). VS Code (Agent Host sessions started by `code chat --mode agent`) and Copilot CLI read it. Do not add `.vscode/mcp.json`: it duplicates the definition, and the VS Code docs mark it deprecated.
  - An Agent Host session did not see `unity` when only `.vscode/mcp.json` existed. With only `.mcp.json`, `unity` connected and its tools were discovered and requested.
- The MCP server exposes 160 tools including mutating ones, with no `readOnlyHint`. Connection does not imply safety.

## Workflow

1. Check prerequisites: `unity --version`, `unity mcp configure --list`, `unity editors list --json` (needs 6000.2.6f2), `code --version`.
2. If `unity` is missing, install with `winget install --id Unity.CLI --exact` and tell the user to reopen the terminal. Do not sign in on the user's behalf.
3. Install Pipeline into the sample: `unity pipeline install --project-path packages/unity-semantic-graph/Samples~`. This edits `Samples~/Packages/manifest.json` and `packages-lock.json`.
4. Open the Editor with `unity open packages/unity-semantic-graph/Samples~ --editor-version 6000.2.6f2`, then poll `unity pipeline list --json` until the project's `pipelineServer.isReachable` is `true`. Ask before opening the real sample if the user may already have it open.
5. Verify in order and report each level separately: CLI (`unity pipeline list`), MCP protocol (initialize, `tools/list`, one read-only call; use UTF-8 for subprocess pipes), then Agent mode (`code chat --mode agent` with a read-only prompt; confirm `MCP server 'unity' connected (ready)` and `Tool started: unity-<tool>` in `%APPDATA%\Code\logs\<session>\agenthost.log`).
6. After verification, close the Editor you opened (stop it by its specific PID after checking its path) and revert the two Samples~ files with `git restore`.

## Rules

- Use only read tools unless the user approves a plan: `list_open_scenes`, `get_scene_hierarchy`, `find_gameobjects`, `get_component_properties`, `get_serialized_fields`, `console_status`. Never call `add_*`, `create_*`, `delete_*`, `set_*`, `remove_*`, `save_*`, `eval`, `run_script`, `menu`, `write_text_file`, `build`, `quit`, or package tools without explicit approval of a concrete plan.
- When testing Agent mode, state "do not use workarounds; report if the unity tools are unavailable" in the prompt, otherwise the agent may spawn the server itself and hide a configuration problem.
- Never commit absolute paths, user names, tokens, or the `com.unity.pipeline` changes in `Samples~/Packages`.
- `unity mcp configure <client>` writes absolute paths. Use `--dry-run`, then rewrite to the committed form (`command: "unity"`, relative or `${workspaceFolder}` path) before committing.
- Do not re-add `.vscode/mcp.json`; `.mcp.json` is the single source. `.vscode/` stays ignored as a whole.
- Keep static analysis independent of MCP: `npm run verify` in `packages/ts-analyzer` must still work without Unity.
- Do not claim a level was verified unless you ran it. State which of CLI, protocol, and Agent mode were verified.

## SceneGraph mapping caveats

MCP data is not a drop-in `SceneGraph.toml`:

- `id`: GameObject and Component `GlobalObjectId` values match the exported TOML exactly.
- `path`: MCP returns `/onGrab`; TOML uses `onGrab` (no leading slash).
- `type`: MCP returns short names (`Item`); TOML uses full names (`ClusterVR.CreatorKit.Item.Implements.Item`). `find_gameobjects` accepts a full name filter, so full-name matching must go through that tool.
- `enabled`: not exposed by `get_component_properties` or `get_serialized_fields`.
- `properties`: MCP uses serialized field names (`itemName`); TOML uses display-style keys (`Item_Name`). Some values return `unsupported` (for example LayerMask).

Treat missing or unmappable fields as `Unsupported`/`NotVerified`, never as satisfied or missing.
