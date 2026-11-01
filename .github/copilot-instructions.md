# Repository Instructions

## Project context

This repository exports Unity Cluster Creator Kit scene data to `SceneGraph.toml` and analyzes ClusterScript TypeScript against Unity component constraints.

## Working rules

- Write user-facing documentation in Japanese unless the task requests another language.
- Write code comments and commit messages in English.
- Keep changes focused on the owning package and update cross-package contract files when TOML changes.
- Treat `SceneGraph.toml` as a structured dump of the Unity project written by the exporter; the TypeScript analyzer performs static analysis based on its structure, so changing the structure affects both packages.
- Prefer exact Unity component full names for constraint matching.
- Do not silently change analyzer exit-code behavior or report formats; document and test such changes.
- Add or update tests for parser, validator, analyzer, and exporter behavior affected by a change.
- Do not replace the current regex parser with AST parsing incrementally without fixtures for both supported and unsupported syntax.

## Git workflow

- Check the current branch, working tree, and upstream before starting changes and before committing.
- Never commit task changes directly to `main`; create or switch to a task-specific development branch first.
- Ensure pushes target the development branch, not `origin/main`. Set the branch's upstream to its matching remote branch before using plain `git push`.
- Before creating a PR, confirm the remote head branch exists and contains commits not already in the base branch.

## Validation

- For TypeScript changes, run `npm run verify` from `packages/ts-analyzer`.
- For TOML changes, validate a fixture with both `SceneGraphParser` and the analyzer.
- For Unity exporter changes, run Unity Edit Mode tests when a Unity environment is available and inspect a generated TOML fixture.
- Before a PR, check that docs, schema examples, and sample data agree with the implementation.

## Review focus

Reviewers should first check data-contract compatibility, object-to-script resolution, enabled component handling, false positives from source detection, and CI exit status.
