# Engine Selection

Inference is executed in a dedicated Web Worker (`src/workers/llm.worker.js`).

## Backends

- `auto`: tries `webgpu`, then falls back to `cpu`
- `webgpu`: WebGPU only
- `cpu`: CPU only

The resolved backend is shown in the status region in the main UI.

## UI boundary

UI code does not call runtime-specific APIs directly.
It uses `LLMEngineClient` (`src/llm/engine-client.js`) as the single inference boundary.
