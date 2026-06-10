# Plasma Security Model

## Protected Decision

The deployment gate protects one decision: whether Plasma may deploy a specific
compiled contract artifact.

It does not prove that a contract is secure and does not govern deployments
performed through Foundry, Hardhat, Remix, scripts, wallets, or other tools.

## Gate States

| State                  | Deployment                  |
| ---------------------- | --------------------------- |
| Not evaluated          | Blocked                     |
| Compile failed         | Blocked                     |
| Audit required         | Blocked                     |
| Blocked                | Blocked                     |
| Stale - code changed   | Blocked                     |
| Ready for local deploy | Local only                  |
| Ready for Sepolia      | Sepolia signing may proceed |

## Fail-Closed Behavior

- compilation errors block
- missing audit blocks
- malformed or failed model responses do not pass
- a mismatched fingerprint blocks
- unresolved configured severities block
- selected bytecode hash mismatch blocks
- unavailable Anvil fails with a clear error
- unsupported Sepolia chain configuration is rejected

## Audit Scope

The MVP audit focuses on:

- external calls before state updates
- missing or ineffective reentrancy protection
- cross-function reentrancy paths

The audit does not cover every smart contract vulnerability class. Production
contracts should receive independent review and appropriate testing.

## Data Minimization

Audit requests include required Solidity files and compiler context. They must
not include:

- `.env`
- private keys
- seed phrases
- wallet files
- credentials
- unrelated workspace content

Provider processing remains subject to the configured provider's terms.

## Agent Boundary

Plasma's approval system is not an OS sandbox. Model-generated fixes require the
existing approval flow before files are edited, but untrusted repositories
should still be opened inside a container or VM.

## Deployment Boundary

Local deployment uses the first account exposed by the configured Anvil node.
Sepolia uses an external wallet or signing flow. Plasma does not accept pasted
private keys and does not support mainnet.
