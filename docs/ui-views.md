# UI Views

Rendering-heavy DOM code is now split into small view modules under `src/ui/`.

## Current modules

- `src/ui/transcript-view.js`
  - transcript message rendering
  - user attachment rendering for images and text-backed files, including image attachments from either composer menu path, HTML-to-Markdown reference imports, and parser-derived PDF text attachments
  - per-message DOM updates for model and user rows
  - dedicated rendering for `summary` nodes inserted during agent-context compaction
  - suppression of edit/branch/regenerate/variant controls when the active conversation is an agent thread
  - long-transcript windowing with spacer-backed scroll preservation so older rows can drop out of the DOM until the user scrolls back
  - inline rendering for emitted tool calls and tool results inside the originating model card
  - transcript empty state
- `src/ui/conversation-list-view.js`
  - conversation sidebar list rendering
  - per-conversation type icon rendering (`file` for normal chats, `person` for agent chats)
- `src/ui/task-list-tray.js`
  - bottom-of-chat task list tray derived from the latest `tasklist` tool result on the visible branch
  - compact and expanded tray states
  - visual sorting that keeps completed items below pending items without changing LLM-facing state
- `src/ui/debug-log-view.js`
  - settings-page debug log rendering
  - newest-first pagination (20 entries per page)
  - accessible event/raw-output list structure plus CSV export controls
- `src/ui/terminal-view.js`
  - read-only xterm rendering for browser-local shell tool activity
  - rebuilds terminal output from the active conversation's visible shell-tool history
  - keeps the live prompt/cursor visible and resizes to the split workspace panel
## Boundary

These modules render and update DOM only.

They do not own:

- engine lifecycle
- persistence
- route state
- conversation mutation rules
- shell-level skip-link behavior, transcript-step navigation, route-safe focus jumps between top-level regions, or workspace side-panel state

Those responsibilities remain in:

- `src/state/conversation-model.js`
- `src/state/app-controller.js`
- `src/main.js`
- `src/app/composer-runtime.js`
- `src/app/transcript-navigation.js`
- `src/app/workspace-side-panels.js`
- `src/app/routing-shell.js`

## Tool-call rendering contract

Transcript rendering is intentionally aligned with the streaming controller contract.

- Tool calls are displayed inline on the same model card that emitted them.
- Narration emitted before the intercepted tool call remains visible.
- If the intercepted tool call was emitted during a visible thinking block, that thinking block ends before the tool action and any later continuation thinking is rendered as a new later block.
- Follow-up tool results and resumed model narration are folded back into that same visible card in chronological order.
- The underlying conversation still stores those steps as `tool` and later `model` messages.
- The transcript should not surface those folded tool-result or continuation-model steps as separate standalone visible transcript cards.

## Testing intent

View tests should validate rendered structure and state-driven visibility/labels with JSDOM.
They should avoid engine or orchestration behavior.
