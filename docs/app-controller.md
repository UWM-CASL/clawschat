# App Controller

The app control layer now lives in `src/state/app-controller.js`.

## Purpose

This module coordinates application actions that cross boundaries between:

- conversation state
- the engine client
- orchestration execution
- persistence triggers
- UI refresh callbacks

It currently owns the control flow for:

- engine initialization and deferred model loading
- explicit unload-before-reload behavior when model/backend selection changes
- generation start and stop
- regenerate and fix actions
- automatic rename orchestration

## Boundary

`app-controller.js` is not a DOM-rendering module.
It receives dependencies and callbacks from `src/main.js`, then drives state transitions through those injected functions.

That means:

- `src/main.js` still owns elements, focus, routing, and rendering details
- `src/state/app-controller.js` owns action sequencing and async lifecycle behavior
- `src/llm/orchestration-runner.js` owns orchestration step execution and prompt templating

## Testing intent

Controller tests should focus on action behavior and state transitions, not rendered markup.

Examples:

- initialization success/failure state transitions
- stop-generation cleanup
- rename/fix orchestration sequencing
- deferred model loading before first generation
