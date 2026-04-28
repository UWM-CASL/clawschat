# Operations

This guide explains how to run, test, inspect, reset, and deploy the app.

The project is a static Vite app. There is no backend service to start.

## Prerequisites

- Node.js 22 in CI; use a current Node.js version locally.
- pnpm 10.17.1, as declared in `package.json`.
- A current browser capable of running Web Workers, WASM, IndexedDB, and the app's bundled model/runtime assets.
- Chromium installed by Playwright for e2e and a11y tests.

Install dependencies:

```sh
pnpm install
```

Install Playwright browsers when needed:

```sh
pnpm exec playwright install chromium
```

CI installs Chromium with system dependencies:

```sh
pnpm exec playwright install --with-deps chromium
```

## Local Development

Run the dev server:

```sh
pnpm dev
```

Build static assets:

```sh
pnpm build
```

Preview the built app:

```sh
pnpm preview
```

The build emits static assets to `dist/`. Do not edit `dist/` directly.

## Scripts

- `pnpm dev`: start the Vite development server.
- `pnpm build`: build static assets.
- `pnpm preview`: serve the built static site locally.
- `pnpm lint`: run ESLint.
- `pnpm format`: run Prettier.
- `pnpm typecheck`: run TypeScript checking over JS/TS.
- `pnpm test`: run unit tests with Vitest.
- `pnpm test:e2e`: run Playwright e2e tests.
- `pnpm test:a11y`: run Playwright tests tagged `@a11y`.

## Environment Variables

`VITE_BASE_PATH`

Controls the Vite base path for static assets. Use this for GitHub Pages subpath deploys.

Example:

```sh
VITE_BASE_PATH=/browser-llm-runner/ pnpm build
```

`PLAYWRIGHT_BASE_PATH`

Controls the base path used by Playwright when serving built assets.

Example:

```sh
PLAYWRIGHT_BASE_PATH=/browser-llm-runner/ pnpm exec playwright test tests/e2e/base-path.spec.js --project=desktop-chromium
```

`PLAYWRIGHT_PORT`

Overrides the local static-server port used by Playwright.

`CI`

When truthy, Playwright forbids focused tests, uses CI retry settings, and avoids local assumptions.

## Verification Gates

Minimum gate for most code changes:

```sh
pnpm lint
pnpm typecheck
pnpm test
```

For UI changes:

```sh
pnpm test:a11y
pnpm test:e2e
```

For routing, asset path, or deployment changes:

```sh
$env:PLAYWRIGHT_BASE_PATH='/browser-llm-runner/'
$env:PLAYWRIGHT_PORT='4174'
pnpm exec playwright test tests/e2e/base-path.spec.js --project=desktop-chromium
```

On non-Windows shells, use `PLAYWRIGHT_BASE_PATH=/browser-llm-runner/ PLAYWRIGHT_PORT=4174` before the command.

## Inspecting Runtime Behavior

The app exposes a user-facing debug log in `Settings -> Debug`.

Use it for:

- raw model output before parsing
- tool-call parsing issues
- MCP transport failures
- CORS/proxy diagnostics
- cancellation events
- provider model-list inspection failures

Browser devtools are still useful for network and storage inspection, but maintainers should keep important diagnostics visible in the app when failures affect users.

## Resetting Local State

Use in-app controls first:

- `Settings -> System -> Clear Downloaded Model Files`
- `Settings -> Conversation -> Delete Conversations`
- provider, MCP, skill, and orchestration remove actions in their settings panels

For a full local browser reset during development, clear site data for the local origin in browser devtools. This removes `localStorage`, IndexedDB, Cache Storage, and OPFS data for that origin.

Be careful when testing GitHub Pages or deployed URLs. Clearing site data there removes real browser-local user data for that deployment.

## Deployment

Deployment uses GitHub Pages.

Important requirements:

- Build output must be static assets only.
- The app must work under `https://<user>.github.io/<repo>/`.
- `VITE_BASE_PATH` must be set to `/<repo>/` for Pages builds.
- Routing is hash-based, so no server rewrite is required for normal app routes.

The deployment workflow:

1. Runs the shared verify workflow.
2. Builds with `VITE_BASE_PATH: /${{ github.event.repository.name }}/`.
3. Uploads `dist/` as the Pages artifact.
4. Deploys with `actions/deploy-pages`.

## Secrets and Credentials

Do not put secrets in source code, config files, tests, or docs.

The app has optional browser-local cloud-provider API keys. They are entered by the user at runtime and stored in browser-local IndexedDB with WebCrypto encryption when supported. This is not a server-side secret vault and must be described honestly in user-facing text.

Do not add default API keys, remote inference shortcuts, analytics tokens, or credential-bearing examples.

## Troubleshooting

Model load fails:

- Clear downloaded model files and reload.
- Check `docs/engine-selection.md` for engine-specific constraints.
- Check `Settings -> Debug` for worker or device-loss details.

Local generation appears stalled:

- Local prefill can be slow.
- The app should report coarse generation phases in the status region.
- If no worker activity is reported within the configured timeout, the client should recover with an actionable error.

GitHub Pages assets fail:

- Confirm `VITE_BASE_PATH` is `/<repo>/`.
- Run the base-path Playwright smoke test.
- Check for root-relative URLs that assume `/`.

MCP or web lookup fails:

- Confirm the endpoint is browser-reachable.
- Check CORS/proxy diagnostics in `Settings -> Debug`.
- Confirm no credentials or private-network targets are being sent through a remote proxy.

Playwright tests fail locally:

- Install Chromium with `pnpm exec playwright install chromium`.
- Make sure another process is not already using the configured port.
- Delete stale local browser state when the test depends on a fresh origin.
