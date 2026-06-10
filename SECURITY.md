# Plasma Security Policy

## Reporting a Vulnerability

Do not open a public issue for an undisclosed vulnerability.

Use GitHub's private
[Report a vulnerability](https://github.com/CYPHES-ATP/Plasma/security/advisories/new)
flow and include:

- affected commit or release
- reproduction steps
- expected and observed behavior
- impact and realistic attack conditions
- proposed remediation, when available

Reports generated entirely by an automated scanner without a reproducible
impact may be closed.

## Supported Versions

Security fixes target the latest published release and the `main` branch.
Pre-release builds are supported on a best-effort basis.

## Trust Boundaries

Plasma runs an AI agent with file, terminal, provider, and optional network
tools. The permission UI improves user awareness but is not an operating-system
sandbox. Use a container or virtual machine when executing untrusted projects.

The Solidity audit is intentionally limited to reentrancy in the MVP. A passing
Plasma gate is not a complete smart contract security assessment.

Provider requests are governed by the selected provider's policies. Plasma
limits audit context to required Solidity sources and compiler context and does
not intentionally send `.env`, wallet files, credentials, or unrelated files.

The local HTTP server must be protected with `OPENCODE_SERVER_PASSWORD` when it
is exposed beyond loopback. The compatibility environment variable name is
retained from the OpenCode chassis.

## Deployment Controls

Plasma deployment functions:

- require successful compilation
- require an audit for the current fingerprint
- block unresolved configured severities
- reject stale source, dependency, compiler, or bytecode state
- verify selected bytecode against the audited artifact before broadcast
- support only Anvil and Sepolia
- never request pasted private keys
- do not support mainnet

These controls apply only to deployments performed through Plasma.

See [Security Model](docs/SECURITY-MODEL.md) for details.
