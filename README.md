# browser-llm-runner

Student-facing browser chat UI with local model inference.

## Runtime behavior

- Inference runs in-browser via Transformers.js inside a Web Worker.
- On initial load, the app shows a welcome/setup panel where users select a model and explicitly click `Load model` before chat.
- Backend selection supports:
  - `Auto (WebGPU then CPU)`
  - `WebGPU only`
  - `CPU only`
- `Auto` attempts WebGPU first and falls back to CPU if unavailable or initialization fails.
- The selected backend and model are stored in `localStorage`.
- Debug status history is available in `Settings -> Debug info` (accordion).

## Supported model

- `onnx-community/gemma-3-1b-ONNX-GQA`
- Legacy stored ID `onnx-community/gemma-3-1b-it-ONNX-GQA` is automatically remapped to the supported model.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
