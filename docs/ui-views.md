# UI Views

Rendering-heavy DOM code is now split into small view modules under `src/ui/`.

## Current modules

- `src/ui/transcript-view.js`
  - transcript message rendering
  - user attachment rendering for images and text-backed files, including image attachments from either composer menu path, HTML-to-Markdown reference imports, and parser-derived PDF text attachments
  - per-message DOM updates for model and user rows
  - inline rendering for emitted tool calls and tool results inside the originating model card
  - transcript empty state
- `src/ui/conversation-list-view.js`
  - conversation sidebar list rendering
- `src/ui/task-list-tray.js`
  - bottom-of-chat task list tray derived from the latest `tasklist` tool result on the visible branch
  - compact and expanded tray states
  - visual sorting that keeps completed items below pending items without changing LLM-facing state

## Boundary

These modules render and update DOM only.

They do not own:

- engine lifecycle
- persistence
- route state
- conversation mutation rules

Those responsibilities remain in:

- `src/state/conversation-model.js`
- `src/state/app-controller.js`
- `src/main.js`

## Tool-call rendering contract

Transcript rendering is intentionally aligned with the streaming controller contract.

- Tool calls are displayed inline on the same model card that emitted them.
- Narration emitted before the intercepted tool call remains visible.
- Tool results are rendered inline for that card even though the underlying conversation still stores them as `tool` role messages.
- The transcript should not surface those tool results as separate standalone visible transcript cards.

## Testing intent

View tests should validate rendered structure and state-driven visibility/labels with JSDOM.
They should avoid engine or orchestration behavior.
