# Semantic Memory

Browser-local semantic memory now lives outside the raw conversation transcript.

## Purpose

The semantic memory layer exists to keep durable, high-value context available without forcing every later prompt to replay the full transcript.

Current goals:

- keep memory local to the browser
- keep memory isolated to the conversation where it was learned
- stay explainable and inspectable
- avoid depending on model-emitted memory tool calls
- retrieve compact scaffolds rather than verbose prose

## Current behavior

- Memory is extracted from:
  - user-authored messages after a completed turn
  - agent summary nodes created during summary compaction
- Retrieval happens during prompt assembly, before generation, using the latest user message on the active branch as the query.
- Retrieval stays off until the estimated prompt for the active branch exceeds the selected model's configured context limit.
- Retrieval is hard-scoped to the active conversation; semantic memory from other conversations is not eligible, even when the wording overlaps.
- Retrieved memory is appended as a compact system-prompt section.
- Memory records are stored in IndexedDB separately from conversation/message/artifact records.
- Deleting a conversation removes the semantic memory sources that came from that conversation.
- Deleting all conversations also clears all semantic memory records.

## Record shape

Each record stores:

- normalized idea text
- domain (`self`, `users`, `people`, `home`, `world`)
- memory kind (`preference`, `plan`, `task`, `fact`, `relationship`, `summary`)
- semantic anchors
- dot-path hints
- temporal category
- strength and decay rate
- provenance back to source conversation/message ids

The dot paths are ranking/debug hints, not a canonical ontology.

## Architecture

- `src/memory/semantic-memory.js`
  - normalization
  - lightweight anchor extraction
  - path generation
  - temporal parsing
  - weighted retrieval ranking
- `src/app/semantic-memory.js`
  - memory lifecycle coordination
  - prompt-section construction
  - conversation-linked cleanup
- `src/state/semantic-memory-store.js`
  - IndexedDB persistence

## Current limits

- Memory commits are app-controlled, not model-controlled.
- The first pass favors user-authored statements and compaction summaries; it does not trust arbitrary model narration as durable memory by default.
- Retrieval is heuristic and token/anchor/path based. There are no embeddings in the current implementation.
- Memory is not yet exposed in Settings or export UI.

## Why this shape

This repo runs entirely in the browser and already uses controller/orchestration-driven lifecycle steps such as summary compaction.

For that architecture, semantic memory is more reliable when:

- retrieval is deterministic and app-driven before prompt assembly
- persistence stays browser-native
- summary compaction can feed memory without adding another runtime boundary

That is why the current implementation uses browser-local JavaScript plus IndexedDB instead of a Python/SQLite sidecar.
