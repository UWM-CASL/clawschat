# Failure Model

This document describes how `browser-llm-runner` can fail and what maintainers should protect.

The app runs entirely in the browser. Failures are often caused by browser capabilities, storage limits, blocked network access, slow local inference, malformed model output, or user-provided configuration.

## Core Assumptions

- The app can be served as static files from GitHub Pages.
- The app may be hosted under a repo subpath.
- Browser-local model execution may be unavailable, slow, or fail during generation.
- Local WASM/browser-default inference may be slow but should remain recoverable where supported.
- Browser storage may be missing, full, stale, or contain old schema shapes.
- Model output is untrusted.
- User-uploaded files are untrusted.
- Remote MCP servers, CORS proxies, and cloud-provider endpoints are untrusted.
- Prompt and response content should stay local unless the user explicitly configures a remote path.

## Browser Capability Failures

Possible failures:

- Browser model/runtime initialization fails.
- A browser graphics/runtime device is lost during generation.
- `SharedArrayBuffer` is unavailable because cross-origin isolation is not active.
- Web Workers fail to initialize.
- Browser storage APIs are blocked or quota-limited.

Expected behavior:

- Unsupported models are visibly disabled or explained.
- The app should not expose a local device selector or depend on a user-managed WebGPU/CPU mode.
- `Stop generating` must cancel pending initialization or generation.
- Errors should tell users what to try next.

## Model Download and Cache Failures

Possible failures:

- Network requests fail.
- Pinned model files are unavailable.
- Browser cache records are partial or stale.
- Storage quota is exceeded.
- A model config points to a runtime shape that the worker cannot load.

Expected behavior:

- Progress is visible during download/init.
- Cache clearing is available from settings.
- Model config changes are tested against the engine path they select.
- Runtime errors should not leave the UI stuck in a permanent loading state.

## Inference and Cancellation Failures

Possible failures:

- A worker becomes idle without completion.
- A model takes a long time before the first printable token.
- Cancellation races with worker initialization or tool-call continuation.
- A partial model response remains after cancellation.

Expected behavior:

- Streaming generation always has a visible stop control.
- Worker inactivity timeouts recover the app to a usable state.
- Cancellation prevents resumed tool continuation.
- Status, button labels, and focus return to a sane ready state.

## Storage and Migration Failures

Possible failures:

- IndexedDB open/read/write fails.
- Records are malformed or from an older version.
- Conversation branches refer to missing nodes.
- Workspace files referenced by attachments are missing.
- Secret-key storage is unsupported or unavailable.

Expected behavior:

- Malformed data is normalized or ignored safely.
- Deleting conversations also clears related local memories and artifacts.
- Export should preserve enough state to debug storage-shape issues.
- Secret storage warnings must remain honest about browser-only protection.

## Attachment and Workspace Failures

Possible failures:

- Files are too large.
- Files are malformed or mislabeled.
- PDF extraction fails or returns little useful text.
- Image/audio inputs exceed model limits.
- Workspace path resolution attempts to escape `/workspace`.
- File operations collide with existing paths or same-path moves.

Expected behavior:

- Attachment limits are enforced before expensive reads.
- Send is disabled while attachment preparation is pending.
- User-facing errors explain whether to reduce, convert, or remove a file.
- Workspace tools must preserve the `/workspace` boundary.

## Tool and MCP Failures

Possible failures:

- The model emits malformed tool calls.
- The model calls a disabled tool.
- The model calls an unknown MCP server or command.
- MCP endpoints are not browser-readable.
- A proxy is misconfigured or unsafe.
- Tool output is too large for prompt continuation.

Expected behavior:

- Disabled and unknown tools are rejected.
- Tool-call parsing is model-aware and conservative.
- Tool results use compact envelopes with status and recovery guidance.
- MCP imports start disabled.
- MCP commands start disabled.
- Remote proxying of local/private-network targets is rejected.
- Large tool results are trimmed for model context while preserving useful diagnostics.

## Cloud Provider Failures

Possible failures:

- `/models` inspection fails.
- CORS blocks provider requests.
- A saved proxy is required or later unavailable.
- API keys are invalid, expired, or missing.
- Provider streaming differs from OpenAI-compatible expectations.
- Provider limits differ from configured context/output settings.

Expected behavior:

- Providers are tested before save.
- Proxy-required providers are marked explicitly.
- Requests fail with actionable messages.
- API keys are never re-displayed after save.
- Remote requests are user-configured and never the default local inference path.

## Rendering and Accessibility Failures

Possible failures:

- Markdown or MathJax rendering produces unsafe or confusing DOM.
- Transcript virtualization hides focus targets.
- Status updates become token spam.
- Dialogs, panels, or mobile sheets trap focus.
- Icon-only buttons lose accessible names.
- Color or motion becomes the only cue.

Expected behavior:

- Transcript streaming is not an `aria-live` token stream.
- Status updates are coarse and polite.
- Dialogs restore focus.
- Keyboard-only navigation remains covered by tests.
- A11y regressions are treated as high severity.

## Routing and Static Hosting Failures

Possible failures:

- Assets assume root hosting.
- Help links leave the configured base path.
- Hash routes fail after refresh or back/forward navigation.
- Build output includes non-static assumptions.

Expected behavior:

- Vite base path is configurable.
- GitHub Pages deploys under `/<repo>/`.
- Base-path Playwright smoke tests cover navigation.
- Routing stays hash-based unless a documented static fallback strategy exists.

## Security and Privacy Risks

Current accepted risks are also tracked in `docs/security.md`.

High-value boundaries:

- model output rendered into DOM
- user prompts and uploaded files
- cloud-provider API keys
- MCP command arguments
- browser-local workspace files
- CORS proxy configuration
- downloaded model artifacts

The app should fail closed where a failure could leak private data, execute unexpected behavior, or send local/private information to a remote endpoint.

## Recovery Checklist

When debugging a failure:

1. Reproduce with a fresh browser origin if storage may be involved.
2. Check `Settings -> Debug` for app-level diagnostics.
3. Identify whether the failure is UI, state, storage, worker, network, or model config.
4. Add or update a focused test before changing risky behavior.
5. Update the relevant docs if the failure reveals a new assumption or recovery path.

## Unresolved Risks

Known risks that future work should reduce:

- No Content Security Policy yet.
- Some model artifacts are fetched from upstream providers at runtime.
- Browser-only cloud-provider secret storage is imperfect.
- `src/main.js`, tool-calling, shell-command, and style files remain large.
- Pyodide assets are loaded from a pinned CDN URL.
- OpenAI-compatible providers and MCP servers are user-configured external network surfaces.
