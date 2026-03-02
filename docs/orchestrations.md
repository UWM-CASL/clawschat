# Orchestrations

This project uses transparent, JSON-defined one-step orchestrations for small follow-up tasks.

## Files

- `src/config/orchestrations/rename-chat.json`
  - Generates a 2-5 word conversation title from the first user/model exchange.
- `src/config/orchestrations/fix-response.json`
  - Revises a model response to correct obvious errors while preserving correct content.

## Runtime behavior

- Both orchestrations are single-step arrays (`steps[0]`) with:
  - `stepName`
  - `prompt`
  - `parameters`
  - `responseFormat`
- The app renders prompt templates with `{{...}}` placeholders and sends the resulting prompt through `LLMEngineClient`.
- `Fix` creates a new model variant at the same turn (like regenerate), so prior variants stay navigable.
