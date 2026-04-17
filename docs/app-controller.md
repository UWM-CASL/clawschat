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
- deferred reload when a saved conversation targets a different model; selection alone updates UI state and the swap happens on the next send
- generation start and stop
- streamed tool-call interception and continuation after tool execution
- regenerate and fix actions
- automatic rename orchestration
- custom slash-command orchestration execution from composer input
- coordination points where UI actions trigger orchestration-backed preparation or follow-up flows

## Boundary

`app-controller.js` is not a DOM-rendering module.
It receives dependencies and callbacks from `src/main.js`, then drives state transitions through those injected functions.

That means:

- `src/main.js` still owns elements, focus, routing, and rendering details
- `src/state/app-controller.js` owns action sequencing and async lifecycle behavior
- `src/llm/orchestration-runner.js` owns orchestration step execution, prompt templating, utility-step execution, and chunk-pipeline support

## Current orchestration relationship

Today the controller directly uses orchestration flows for:

- rename-chat
- fix-response
- saved custom slash-command orchestrations

The orchestration runtime itself is broader than those two current call sites.
It now supports:

- prompt steps
- deterministic utility steps (`transform`, `join`)
- per-item prompt loops (`forEach`)

That broader runtime is intended to support future parser-first document-prep flows, such as attachment conversion, without moving semantic transformation logic into the controller.

The controller should remain responsible for:

- deciding when an orchestration runs
- keeping UI state, status text, and persistence in sync around that run
- passing prepared inputs into the orchestration runner

For saved custom slash-command orchestrations, that includes:

- validating that the model is ready and the app is not already busy
- building invocation variables from the current conversation and the typed `/<command> ...` message
- deciding whether to stream a deferred orchestration `finalPrompt` through the normal generation path or write the orchestration `finalOutput` directly into the pending model turn

The controller should not become the place where chunking rules, prompt assembly internals, or document-conversion step sequencing are reimplemented.

## Tool-call interception

Tool calls now follow an agent-style interruption flow.

- While a model response is streaming, the controller watches for a complete tool call.
- When the first complete tool call is detected, the controller interrupts generation immediately.
- Narration emitted before that tool call stays visible on the model message.
- The continuation payload fed back into the conversation uses the raw tool call, not any extra visible narration.
- The requested tool executes before the turn is allowed to continue.
- After the tool result is appended to conversation state, the controller starts the next generation step.

This keeps the model from speaking as though it already knows the tool result before the tool has actually run.

## Testing intent

Controller tests should focus on action behavior and state transitions, not rendered markup.

Examples:

- initialization success/failure state transitions
- stop-generation cleanup
- streamed tool-call interruption and resume sequencing
- rename/fix orchestration sequencing
- orchestration-backed preparation flow state transitions when new call sites are added
- deferred model loading before first generation
