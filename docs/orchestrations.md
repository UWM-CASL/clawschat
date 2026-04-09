# Orchestrations

This project uses transparent, JSON-defined orchestrations for small follow-up tasks.

## Files

- `src/config/orchestrations/rename-chat.json`
  - Generates a 2-5 word conversation title from the first user/model exchange (single step).
- `src/config/orchestrations/fix-response.json`
  - Critiques, revises, and validates a model response against the originating user prompt (multi-step).
- `src/config/orchestrations/agent-follow-up.json`
  - Handles each scheduled agent heartbeat and decides whether to post one short proactive follow-up.
- `src/config/orchestrations/summarize-conversation.json`
  - Compresses older agent-context turns into a durable memory summary and explicitly relists uploaded files.
- `src/config/orchestrations/pdf-to-markdown.json`
  - Prepares extracted document text for future PDF-to-Markdown conversion using chunking, per-chunk conversion, and a final merge pass.
  - The current shipped PDF attachment import is still deterministic parser-first extraction; this orchestration is the intended next-stage semantic conversion path.

## Runtime behavior

- Orchestration step execution lives in `src/llm/orchestration-runner.js`.
- Orchestrations are step arrays (`steps`) where each step defines a `type`.
  - `prompt` is the default if `type` is omitted.
- Prompt steps can define:
  - `stepName`
  - `prompt`
  - `parameters`
  - `outputKey` (optional variable name for later step prompts)
  - `responseFormat`
  - `outputProcessing` (optional post-processing options)
- Utility steps are deterministic local operations that prepare or combine orchestration data without calling the model.
  - `transform`
    - Runs a named local transform and writes its result to `outputKey`.
    - Current built-in transform: `chunkText`
  - `forEach`
    - Iterates over an array input and runs one prompt template per item.
    - Collects outputs into an array under `outputKey`.
  - `join`
    - Joins an array input into one string and writes it to `outputKey`.
- `outputProcessing.stripThinking: true` removes model thinking sections (for example `<think>...</think>`) from that step output before it is stored in `finalOutput`, `previousStepOutput`, `stepNOutput`, and any `outputKey`.
- Prompt templates use `{{...}}` placeholders.
  - Nested paths such as `{{chunk.text}}` are supported.
  - Array values render as paragraph-separated text when possible, otherwise JSON.
- The app renders prompt templates and sends prompt/forEach prompt steps through `LLMEngineClient` in order.
- `src/state/app-controller.js` calls the orchestration runner for rename/fix flows, while `src/main.js` coordinates agent follow-up and summary-compaction runs around the active conversation lifecycle.
- Each completed step output is available to later steps via:
  - `{{previousStepOutput}}` and `{{lastStepOutput}}`
  - `{{step1Output}}`, `{{step2Output}}`, etc.
  - `{{<outputKey>}}` if that step defines `outputKey`
- Array-producing steps also expose:
  - `previousStepOutputs`
  - `lastStepOutputs`
  - `step1Outputs`, `step2Outputs`, etc.
  - `{{<outputKey>}}` for the full array value when that step defines `outputKey`
- `Fix` executes all preparation steps first, then streams the final step output into the transcript as a new response variant.
- `Fix` creates a new model variant at the same turn (like regenerate), so prior variants stay navigable.
- Agent follow-up orchestration runs only while the matching agent conversation is the loaded chat and not paused, writes each heartbeat into the transcript before the model reviews it, and the active-chat header surfaces that schedule with a visible next-heartbeat countdown beside the pause/resume control.
- Agent summary-compaction orchestration inserts a visible `summary` node into the conversation tree, then later prompt assembly drops older turns before that node while exports still preserve the full transcript.

## Utility step contract

### `transform`

Use `transform` for deterministic data shaping that should remain local code rather than model work.

Example:

```json
{
  "type": "transform",
  "stepName": "Chunk extracted document text",
  "transform": "chunkText",
  "source": "documentPages",
  "outputKey": "documentChunks",
  "parameters": {
    "maxChars": 5000,
    "overlapChars": 400,
    "textField": "text",
    "pageField": "pageNumber"
  }
}
```

Current built-in transform:

- `chunkText`
  - Accepts either:
    - a string source, or
    - an array of strings/objects
  - Produces chunk objects with stable metadata for later prompt steps:
    - `id`
    - `text`
    - `chunkIndex`
    - `chunkCount`
    - `startPage`
    - `endPage`
    - `pageLabel`
    - `sourceItems`

### `forEach`

Use `forEach` when the orchestration should run the same prompt against a list of prepared inputs.

Example:

```json
{
  "type": "forEach",
  "stepName": "Convert each chunk to Markdown",
  "input": "documentChunks",
  "itemName": "chunk",
  "outputKey": "chunkMarkdown",
  "prompt": "Convert the extracted chunk below into compact Markdown.\nPreserve meaning, page markers, and equations when possible.\nDo not summarize.\n\nChunk {{chunk.chunkIndex}} of {{chunkCount}} ({{chunk.pageLabel}}):\n{{chunk.text}}",
  "responseFormat": {
    "type": "plain_text",
    "instructions": "Return Markdown only."
  },
  "outputProcessing": {
    "stripThinking": true
  }
}
```

During each iteration the prompt receives:

- the root orchestration variables
- the current item under `itemName` (default `item`)
- `itemIndex`
- `itemNumber`
- `itemCount`

### `join`

Use `join` to combine prior array outputs into one string for a later prompt or final output.

Example:

```json
{
  "type": "join",
  "stepName": "Combine chunk Markdown",
  "source": "chunkMarkdown",
  "outputKey": "combinedMarkdown",
  "separator": "\n\n"
}
```

## PDF preparation workflow

The intended PDF pipeline is:

1. Deterministic PDF parsing extracts page text and any recoverable metadata.
2. A `transform` step chunks the extracted content into prompt-sized units.
3. A `forEach` step has the LLM convert each chunk into conservative Markdown.
4. A `join` or final `prompt` step merges chunk outputs into the `llmText` representation used for attachment consumption.

This keeps the parser responsible for extraction and the orchestration responsible for semantic Markdown conversion.
