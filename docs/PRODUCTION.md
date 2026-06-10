# Production Readiness

## Implemented

- intentional Plasma branding across desktop, web, TUI, CLI, prompts, and
  updater copy
- dark-first application and terminal defaults
- secure project initialization
- Solidity Standard JSON compilation
- deterministic build and bytecode fingerprints
- focused structured reentrancy audit
- approval-gated fix generation
- fail-closed deployment enforcement
- local Anvil deployment
- Sepolia external signing preparation
- mainnet rejection
- vulnerable and patched demo fixture
- focused automated tests
- fork-safe CI and tagged CLI release workflow
- install, architecture, security, and release documentation

## Required Before Public Production

The following require organization credentials, external review, or live
infrastructure and cannot be completed in source code alone:

1. Protect `main` and require Plasma CI.
2. Configure GitHub environments for release approval.
3. Add Apple signing and notarization credentials.
4. Add Windows code-signing credentials.
5. Perform an independent application and smart-contract security review.
6. Run a funded Sepolia acceptance deployment through each supported wallet.
7. Publish and verify signed desktop artifacts on clean machines.
8. Publish a tagged CLI release and verify installer hashes.
9. Define incident response, vulnerability triage, and rollback owners.
10. Review provider privacy terms and publish the supported-provider policy.
11. Add telemetry only with an explicit privacy decision and disclosure.
12. Establish an upstream OpenCode merge and regression cadence.

## Release Acceptance

A release candidate is acceptable only when:

```bash
bun run verify:plasma
bun run typecheck
bun --cwd packages/app test:unit
bun --cwd packages/app build
bun --cwd packages/desktop build
bun run build:cli
bash -n install
```

also pass in CI, and the manual checks below succeed:

- Plasma branding appears on first launch
- dark mode is active on a clean profile
- vulnerable fixture is blocked
- approved patch changes the fingerprint
- old audit becomes stale
- patched fixture passes a new audit
- exact artifact deploys to Anvil
- Sepolia wallet confirms chain ID `11155111`
- mainnet cannot be selected
- no secret is included in logs or audit payloads
