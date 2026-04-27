# Change Guide

This guide describes common change paths. Follow it before guessing.

Every substantial change should update code, tests, and docs together.

## Add or Update a Local Model

1. Update `src/config/models.json`.
2. Confirm the selected engine type and runtime hints match an existing driver.
3. Add or update generation defaults and browser-safe limits.
4. Add legacy alias handling if replacing an existing model ID.
5. Update `docs/models.md`.
6. Update `docs/engine-selection.md` if backend behavior changes.
7. Add or update tests in `tests/unit/model-settings.test.js` and worker/client tests as needed.
8. Run `pnpm typecheck`, `pnpm test`, and a relevant e2e smoke test.

Do not commit model weights.

## Add a New Engine Driver

1. Define the driver boundary under `src/llm/engines/`.
2. Add or update the worker entrypoint under `src/workers/`.
3. Keep the `LLMEngineClient` contract stable.
4. Add cancellation behavior before exposing streaming generation.
5. Add model config fields only after documenting and normalizing them.
6. Update `docs/engine-selection.md` and `docs/architecture.md`.
7. Add unit tests for driver selection, initialization, generate, cancel, timeout, and failure paths.
8. Add a mocked e2e path if the behavior reaches the UI.

Avoid letting UI code learn runtime-specific details.

## Add a Tool

1. Decide whether the feature belongs as a direct built-in tool, MCP support, or a skill playbook.
2. Add a narrow executor with validated inputs.
3. Return the standard compact model-facing envelope.
4. Gate prompt exposure behind settings or capability checks where appropriate.
5. Reject disabled or unknown tool calls.
6. Add malformed-input tests.
7. Update `docs/tools.md`.
8. Update `README.md` only if the user-visible feature list changes materially.

Tools are model-facing contracts. Treat prompt text, syntax, and result shape as public behavior.

## Add a Shell Command

1. Keep the command inside the browser-local workspace abstraction.
2. Preserve `/workspace` path boundaries.
3. Use explicit option parsing and arity checks.
4. Return deterministic `stdout`, `stderr`, and `exitCode`.
5. Document supported flags and unsupported behavior.
6. Update the command list and help payload.
7. Add tests for happy path, invalid options, missing paths, boundary enforcement, and malformed model-shaped input.
8. Update `docs/tools.md`.

Do not expose arbitrary shell access.

## Add a Settings Panel or Control

1. Add semantic markup in `index.html` only for persistent shell structure.
2. Put rendering/controller behavior in `src/app/` or `src/ui/`.
3. Put event binding in a focused events module if the panel grows.
4. Store preferences through existing storage patterns.
5. Add accessible names, help text, validation text, and status updates.
6. Add unit tests for state and rendering behavior.
7. Add a11y coverage for new interactive UI.
8. Update relevant docs and help text.

Settings must remain keyboard reachable and screen-reader understandable.

## Change Transcript Rendering

1. Read `docs/ui-views.md` and `docs/tools.md`.
2. Keep the transcript as structured message markup.
3. Do not make token streaming an `aria-live` feed.
4. Preserve speaker labels and per-message action labels.
5. Maintain inline tool-call rendering semantics.
6. Test with JSDOM for structure and Playwright for visible workflow.
7. Run `pnpm test:a11y`.

Transcript changes are high risk because they affect learning workflow, copy/export behavior, and accessibility.

## Add an Orchestration

1. Prefer declarative JSON under `src/config/orchestrations/` for built-in flows.
2. Keep deterministic parsing/chunking in code.
3. Keep semantic transformation in orchestration steps where appropriate.
4. Add validation or normalization if the schema expands.
5. Update `docs/orchestrations.md`.
6. Add tests for runner behavior and any UI that exposes it.
7. Confirm slash-command behavior if user-authored orchestrations are affected.

Do not bury important workflow rules inside prompts without documentation.

## Add an Attachment Type

1. Define size, type, and count limits before reading file contents.
2. Normalize content before it enters conversation state.
3. Write durable artifacts through the workspace abstraction.
4. Keep send disabled while preparation is pending.
5. Add model capability checks before exposing model-visible media inputs.
6. Add tests for limits, malformed files, cleanup, export, and prompt shaping.
7. Update `docs/failure-model.md`, `docs/conversation-domain.md`, and user help if visible.

Attachment parsing should not live in pure conversation-domain code.

## Change Storage Shape

1. Identify whether the data belongs in `localStorage`, IndexedDB, Cache Storage, or workspace storage.
2. Add normalization for older or malformed records.
3. Preserve cleanup paths for deletes and exports.
4. Avoid storing prompt/output text in logs or analytics.
5. Add migration and malformed-data tests.
6. Update `docs/operations.md` and subsystem docs.

Browser storage is user data. Treat data loss and accidental disclosure as high severity.

## Change Routing or Deployment

1. Preserve static hosting.
2. Preserve GitHub Pages subpath support.
3. Prefer hash routing.
4. Avoid root-relative asset assumptions.
5. Update `docs/operations.md`.
6. Run the base-path Playwright smoke test.

Do not introduce server routes.

## Refactor a Large Module

1. Add characterization tests for current behavior if coverage is weak.
2. Extract one responsibility at a time.
3. Keep public exports stable until callers are migrated.
4. Move tests to match the new boundary.
5. Update `docs/architecture.md` and any subsystem docs.
6. Avoid mixing broad renames with behavior changes.

Recommended refactor order:

1. `src/main.js`
2. `src/llm/shell-command-tool.js`
3. `src/llm/tool-calling.js`
4. `src/styles.css`
5. `tests/unit/tool-calling.test.js`

## Update Documentation

When behavior changes, ask which human-facing artifact changes:

- README front-door summary
- maintainer map
- architecture story
- conventions
- operations
- failure model
- common change path
- subsystem reference doc
- user help page

Documentation should explain the current truth and, where useful, the intended direction. It should not pretend target architecture already exists when it is only planned.

