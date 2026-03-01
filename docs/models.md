# Models

Current supported model in the settings drawer:

- `Xenova/distilgpt2`
- Legacy aliases remapped automatically at runtime:
  - `onnx-community/gemma-3-1b-it-ONNX-GQA` -> `Xenova/distilgpt2`
  - `onnx-community/gemma-3-1b-ONNX-GQA` -> `Xenova/distilgpt2`

Notes:

- The model is downloaded at runtime by Transformers.js and cached in-browser for reuse.
- Model assets are not committed to this repository.
