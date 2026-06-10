# Contributing to Plasma

Plasma is a narrow security-focused fork. Changes should preserve OpenCode's
core architecture and keep Plasma-specific behavior isolated.

## Development Setup

```bash
git clone https://github.com/CYPHES-ATP/Plasma.git
cd Plasma
bun install --frozen-lockfile
bun run verify:plasma
```

Run the terminal application:

```bash
bun run dev .
```

Run desktop development:

```bash
bun run dev:desktop
```

## Engineering Rules

- Reuse existing OpenCode APIs and UI primitives.
- Do not broadly rename internal `@opencode-ai/*` packages or compatibility
  environment variables.
- Keep Solidity functionality under `packages/opencode/src/plasma` where
  practical.
- Never weaken the deployment gate for UI convenience.
- Never add private-key paste flows.
- Do not enable mainnet.
- Add tests for gate, fingerprint, audit, or deployment changes.
- Preserve OpenCode and third-party license notices.

## Required Checks

```bash
bun run typecheck
bun --cwd packages/opencode test test/plasma/plasma.test.ts
bun --cwd packages/app test:unit
bun --cwd packages/app build
bun --cwd packages/desktop build
bash -n install
```

For CLI changes:

```bash
bun run build:cli
```

## Pull Requests

Keep pull requests focused. Describe:

- user-visible behavior
- security impact
- compatibility impact
- tests performed
- any release or migration requirement

Changes to fingerprints, audit validity, gate decisions, signing, or deployment
must include a clear threat analysis.
