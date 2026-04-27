# Conventions

This document describes how code and documentation should feel in this repo.

The goal is not uniformity for its own sake. The goal is that a human maintainer can predict where behavior belongs and how to change it safely.

## General Code Style

- Prefer explicit modules and plain functions.
- Use classes only for objects with meaningful state, lifecycle, or interchangeable implementations.
- Keep functions focused enough that their name can describe one job.
- Prefer readable names over abbreviations.
- Keep variables close to where they are used.
- Do not hide user-visible behavior behind clever indirection.
- Add comments for constraints, tradeoffs, or surprising browser/runtime behavior.
- Do not add comments that simply restate the next line of code.

## Files and Naming

- Domain/state helpers live under `src/state/`.
- Browser-facing controllers live under `src/app/`.
- DOM renderers live under `src/ui/`.
- Engine/runtime helpers live under `src/llm/`.
- Worker entrypoints live under `src/workers/`.
- Static and deployment assets live under `public/`.
- Configuration lives under `src/config/`.
- Tests should mirror the behavior boundary they protect.

Prefer names that explain the boundary:

- `*-events.js` for modules that bind DOM events.
- `*-view.js` for DOM rendering modules.
- `*-store.js` for browser-local persistence modules.
- `*-controller.js` for modules that coordinate stateful workflows.
- `*-config.js` or JSON config for declarative catalogs.

## State and Domain Logic

Pure domain modules should not depend on:

- DOM APIs
- Bootstrap
- workers
- `localStorage`
- IndexedDB
- global runtime state

State changes should be testable without real models, real WebGPU, or real browser storage when practical.

Derived state should live in selectors or focused helpers instead of being recalculated differently across the UI.

## UI Conventions

- Use native controls with Bootstrap styling.
- Preserve semantic labels and accessible names.
- Icon-only buttons must have `aria-label` or equivalent visible labeling.
- Do not make the transcript an `aria-live` token stream.
- Use separate status regions for coarse updates.
- Keep focus changes explicit and tested.
- Respect `prefers-reduced-motion`.
- UI text should be useful to students, not an implementation lecture.

Settings and panels should follow the existing pattern:

1. Markup and persistent shell regions in `index.html`.
2. Rendering or controller logic in `src/app/` or `src/ui/`.
3. Event binding in a focused `*-events.js` module when the surface grows.
4. Tests for labels, visibility, persistence, and failure behavior.

## Engine and Worker Conventions

- UI code talks to `LLMEngineClient`, not worker implementations.
- Engine drivers are selected from normalized model config.
- Worker messages must remain explicit and cancellable.
- Runtime-specific behavior belongs in the relevant driver or worker, not in generic UI code.
- Automatic fallback behavior must be documented and tested.
- A generation path that streams must support stop/cancel.

## Tooling Conventions

Built-in tools, MCP helpers, and skills are model-facing surfaces. Treat them as contracts.

- Validate tool input before execution.
- Return compact, useful envelopes to the model.
- Keep browser-local file access behind the workspace filesystem abstraction.
- Preserve `/workspace` boundaries for shell/file tools.
- Document supported syntax and unsupported syntax.
- Add tests for malformed model-shaped payloads, not only happy paths.

## Error Handling

Errors should be visible and recoverable where possible.

- User-facing errors should include a next action.
- Debug logs should preserve useful context without exposing secrets.
- Expected failures should not become raw exceptions in the UI.
- Security-sensitive failures should fail closed.
- Silent catches need a documented reason.

Examples of useful recovery guidance:

- retry the operation
- switch to CPU mode
- clear downloaded model files
- reduce attachment size
- remove a proxy or provider configuration
- reload after cross-origin isolation changes

## Configuration

Important settings should be declarative, documented, and normalized before use.

- Model behavior belongs in `src/config/models.json` or normalized runtime model catalogs.
- Built-in orchestration definitions belong in `src/config/orchestrations/`.
- Build and test base paths come from environment variables.
- Browser-saved preferences should be named clearly and migrated deliberately.

When adding config, document:

- what it controls
- its default
- valid values
- whether it affects static build, browser runtime, tests, or user data

## Testing Conventions

Tests are maintenance documentation with enforcement.

- Unit tests should describe behavior at one boundary.
- Mock model/runtime dependencies instead of requiring WebGPU or real model downloads.
- E2E tests should cover student-visible workflows.
- A11y tests should cover changed screens and interaction states.
- Base-path tests should cover routing or asset-path changes.
- Storage changes need migration, cleanup, and malformed-data tests.
- Tool changes need input validation, disabled-tool, and malformed-model-output tests.

Test names should describe the behavior protected, not the implementation detail exercised.

## Documentation Conventions

Documentation must stay synchronized with code.

Update docs when changing:

- commands or scripts
- deployment assumptions
- model catalog behavior
- engine selection or fallback
- storage shape
- user-facing settings
- tool syntax
- accessibility patterns
- common change paths
- known risks

Large behavior lists should live in focused docs. The README should orient readers and link to deeper material.

## Abstractions

An abstraction is welcome when it makes a real boundary easier to change or test.

Before adding one, be able to answer:

- What maintenance problem does it solve?
- What simpler shape was considered?
- What complexity does it add?
- How will a new maintainer trace what runs?
- When should it be simplified or removed?

Do not add registries, factories, classes, or event systems because they look more engineered. Add them only when they make future change safer.

