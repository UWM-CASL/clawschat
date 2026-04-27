# Maintainer FAQ

## Why is this a static app?

The project is meant to run on GitHub Pages with no backend. That keeps deployment simple and keeps prompts, outputs, and browser-local files under the user's control by default.

Any backend requirement would change the project contract and needs explicit approval.

## Why is local inference the default?

Privacy. Students should be able to use the app without sending prompts to a remote inference service by default.

Cloud providers are optional, user-configured, and browser-mediated. They should never become an invisible fallback.

## Why is `src/main.js` still so large?

It is currently the composition root and still owns too much wiring: DOM references, route/focus behavior, persistence hooks, model settings glue, status/debug helpers, MathJax/Markdown coordination, and controller construction.

Future refactors should extract cohesive helpers without changing behavior. Do not replace it with a vague mega-service. Keep `main.js` as the shell that wires well-named modules together.

## Where should I add a new feature?

Start with the behavior boundary:

- Conversation data rules: `src/state/`.
- User interaction or settings flow: `src/app/`.
- DOM rendering: `src/ui/`.
- Inference/runtime behavior: `src/llm/` and `src/workers/`.
- Model or orchestration catalog: `src/config/`.
- Browser-local files: `src/workspace/`.

If a feature crosses several boundaries, put orchestration in a controller and keep each boundary's logic local.

## Where do I add tests?

Add tests at the closest stable boundary:

- Pure state/domain logic: `tests/unit/*conversation*`, `tests/unit/*app-state*`, or a new focused unit file.
- Engine client behavior: `tests/unit/engine-client.test.js`.
- Worker behavior: worker unit tests or worker harness e2e tests.
- UI rendering: JSDOM unit tests for `src/ui/` behavior.
- Full user workflows: Playwright tests under `tests/e2e/`.
- Accessibility: tests tagged `@a11y`.

Avoid testing a small pure function only through a slow e2e path.

## Why are some features declarative JSON?

Models and orchestrations are partly declarative because humans need to inspect and change those catalogs without reading control flow first.

Declarative config is acceptable only when the runtime validates or normalizes it and when the docs explain the schema.

## Should I convert everything to TypeScript?

Not as one broad change.

The repo currently uses JavaScript with JSDoc and TypeScript checking. Prefer strengthening public typedefs and migrating one stable boundary at a time. A broad conversion would create review noise and obscure behavior changes.

## Should I add a new UI framework?

No, unless explicitly approved.

Bootstrap 5 is the standard UI framework. New UI dependencies must justify their maintenance cost and accessibility behavior.

## How should I handle accessibility?

Treat accessibility as part of the feature, not a final check.

Use native controls, visible focus, meaningful labels, keyboard reachability, explicit focus restoration, and separate status live regions. Do not stream tokens into an `aria-live` transcript.

For UI changes, add or update a11y tests and run `pnpm test:a11y`.

## How should I handle model output?

Treat model output as untrusted.

Be careful when parsing tool calls, rendering Markdown, rendering MathJax, copying text, exporting content, or feeding model output back into another prompt. Prefer conservative parsing and explicit failure behavior.

## Why is tool calling model-specific?

The supported models emit different tool-call formats. The runtime uses per-model metadata and detectors instead of pretending one universal syntax works everywhere.

When adding a model, confirm its tool format and update tests before exposing tool calling.

## Why are MCP servers and commands disabled by default?

MCP calls send arguments to user-configured remote endpoints. Importing a server should not automatically expose every command to the model.

The user must enable the server and specific commands before they enter the prompt or execution path.

## What should I avoid changing casually?

Avoid casual changes to:

- worker cancellation
- prompt construction
- conversation branch pruning
- workspace path resolution
- cloud-provider secret storage
- CORS proxy safety checks
- transcript semantics
- base-path routing
- model config defaults and limits

These areas affect privacy, user data, accessibility, or runtime reliability.

## How do I debug a model-load problem?

Check:

1. Model config in `src/config/models.json`.
2. Engine selection in `docs/engine-selection.md`.
3. Worker debug entries in `Settings -> Debug`.
4. Browser console/network failures.
5. Browser storage/cache state.
6. Whether WebGPU or CPU mode is actually selected.

Then add a focused regression test around the layer that failed.

## How do I debug a tool-call problem?

Check:

1. The raw model output in `Settings -> Debug`.
2. The selected model's tool-call format metadata.
3. Whether tool calling is enabled for the conversation.
4. Whether the specific tool, MCP server, or command is enabled.
5. The compact tool envelope returned to the model.

Malformed model output should usually be rejected, not guessed into shape.

## When is duplication acceptable?

Duplication is acceptable when it keeps separate user workflows readable and the repeated code is small.

Extract only when the shared concept is stable and the abstraction makes future changes easier to reason about.

## What is the next best maintainability investment?

Documented, behavior-preserving extraction:

1. Split `src/main.js` by responsibility.
2. Split shell command parsing/execution from individual command implementations.
3. Split tool prompt building from tool execution and parsing.
4. Split large CSS by surface.
5. Split the largest test files to match the new boundaries.

Each step should leave the repo easier for an entry-level maintainer to navigate.

