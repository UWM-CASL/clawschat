# Engine Selection

Inference is selected through the engine client boundary and executes through a per-model engine driver in a dedicated Web Worker.

## Engine drivers

- Model config now declares an explicit engine via `models[].engine.type`.
- `src/llm/engine-client.js` reads that engine type from the selected model config and uses the matching engine descriptor from `src/llm/engines/`.
- The app currently ships:
  - `transformers-js` via `src/workers/llm.worker.js`
  - `mediapipe-genai` via `src/workers/mediapipe-llm.worker.js`
- Additional local or remote drivers can be added later without changing the UI/controller contract, as long as they implement the same client-facing `initialize` / `generate` / `cancel` lifecycle.

## Backends

- `auto`: tries `webgpu`, then falls back to the browser CPU path via `wasm`
- `webgpu`: WebGPU only
- `wasm`: WASM only
- `cpu`: CPU only, mapped to Transformers.js browser execution via `wasm`
- Models with `requiresWebGpu: true` only attempt WebGPU and do not fall back to WASM/CPU.
- `mediapipe-genai` models currently require WebGPU and reject `wasm` / `cpu` backend selection.
- Models with `multimodalGeneration: true` use a processor/model execution path in the worker instead of the text-generation pipeline.
- For multimodal models, the worker loads the `AutoProcessor` lazily on first generation and then reuses it for later requests.
- LiteRT-backed models may use engine-specific runtime hints such as `runtime.modelAssetPath` instead of Transformers.js-specific dtype settings.

The resolved backend is shown in the status region in the main UI.
Initialization is user-triggered on first message send in the chat workspace.
If model/backend settings change, the next message triggers a fresh load with updated settings.
If a backend change makes the current model unavailable, the UI switches to the first compatible model and announces that in the status region.
Generation settings (`maximum output tokens`, `maximum context size`, `temperature`, `top k`, `top p`) apply immediately when idle, or after the current generation completes.

## UI boundary

UI code does not call runtime-specific APIs directly.
It uses `LLMEngineClient` (`src/llm/engine-client.js`) as the single inference boundary.
