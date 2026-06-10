import path from "node:path"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, test } from "bun:test"
import { analyzeReentrancy } from "@/plasma/analyzer"
import { compileProject, currentInputFingerprint } from "@/plasma/compiler"
import { validateConfig } from "@/plasma/config"
import { deployLocal, prepareSepolia } from "@/plasma/deploy"
import { evaluateGate } from "@/plasma/gate"
import { initializeProject } from "@/plasma/project"
import { PlasmaStorage } from "@/plasma/storage"

const roots: string[] = []
const fixture = path.join(import.meta.dir, "../fixture/plasma-vault")

async function temp() {
  const root = await mkdtemp(path.join(tmpdir(), "plasma-test-"))
  roots.push(root)
  return root
}

async function vaultFixture() {
  const root = await temp()
  await cp(fixture, root, { recursive: true })
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("Plasma project initialization", () => {
  test("creates and compiles the secure Foundry-style starter", async () => {
    const root = await temp()
    const created = await initializeProject(root)
    expect(created.files).toContain("contracts/Starter.sol")
    expect(created.files).toContain("test/Starter.t.sol")
    expect(created.files).toContain("plasma.json")

    const build = await compileProject(root)
    expect(build.success).toBe(true)
    expect(build.diagnostics.filter((item) => item.severity === "error")).toHaveLength(0)
    expect(build.artifacts.some((artifact) => artifact.id === "contracts/Starter.sol:Starter")).toBe(true)
  })
})

describe("Plasma compiler and fingerprint", () => {
  test("produces deterministic artifacts and changes when source changes", async () => {
    const root = await vaultFixture()
    const first = await compileProject(root)
    const second = await compileProject(root)

    expect(first.success).toBe(true)
    expect(first.fingerprint).toBe(second.fingerprint)
    expect(first.artifacts.map((item) => item.bytecodeHash)).toEqual(second.artifacts.map((item) => item.bytecodeHash))

    const source = path.join(root, "contracts/VulnerableVault.sol")
    await writeFile(source, `${await readFile(source, "utf8")}\n// fingerprint change\n`)
    expect(await currentInputFingerprint(root)).not.toBe(first.inputFingerprint)

    const changed = await compileProject(root)
    expect(changed.fingerprint).not.toBe(first.fingerprint)
  })

  test("rejects unsafe or unsupported configuration", () => {
    expect(() =>
      validateConfig({
        contracts: [],
        compiler: { version: "0.9.0", optimizer: "yes", runs: -1 },
        audit: { blockOn: [] },
        networks: { local: { rpcUrl: "file:///tmp/rpc", chainId: 0 }, sepolia: { chainId: 1 } },
      }),
    ).toThrow("Invalid plasma.json")
  })
})

describe("Plasma focused reentrancy audit", () => {
  test("finds the vulnerable flow and accepts the patched checks-effects-interactions flow", async () => {
    const root = await vaultFixture()
    const vulnerable = await readFile(path.join(root, "contracts/VulnerableVault.sol"), "utf8")
    const patched = await readFile(path.join(root, "contracts/PatchedVault.sol"), "utf8")

    const findings = analyzeReentrancy("contracts/VulnerableVault.sol", vulnerable)
    expect(findings.some((item) => item.severity === "high" && item.title.includes("before state update"))).toBe(true)
    expect(findings.some((item) => item.title.includes("Cross-function reentrancy"))).toBe(true)
    expect(analyzeReentrancy("contracts/PatchedVault.sol", patched)).toHaveLength(0)
  })
})

describe("Plasma deployment gate", () => {
  test("blocks unaudited, vulnerable, and stale builds inside deployment functions", async () => {
    const root = await vaultFixture()
    const build = await compileProject(root)
    expect(build.fingerprint).toBeTruthy()
    expect((await evaluateGate(root, "local")).state).toBe("Audit required")
    await expect(deployLocal(root)).rejects.toThrow("Audit required")

    const source = await readFile(path.join(root, "contracts/VulnerableVault.sol"), "utf8")
    const findings = analyzeReentrancy("contracts/VulnerableVault.sol", source)
    await PlasmaStorage.writeAudit(root, {
      fingerprint: build.fingerprint!,
      timestamp: new Date().toISOString(),
      provider: "test/static-analyzer",
      model: "deterministic-reentrancy-guardrail",
      bytecodeHashes: Object.fromEntries(build.artifacts.map((item) => [item.id, item.bytecodeHash])),
      findings,
    })
    expect((await evaluateGate(root, "local")).state).toBe("Blocked")
    await expect(prepareSepolia(root)).rejects.toThrow("Blocked")

    await writeFile(
      path.join(root, "contracts/VulnerableVault.sol"),
      source.replace("balances[msg.sender] = 0;", "balances[msg.sender] = 0; // changed after audit"),
    )
    expect((await evaluateGate(root, "local")).state).toBe("Stale - code changed")
    await expect(deployLocal(root)).rejects.toThrow("Stale - code changed")
  })

  test("unlocks only the exact patched and audited artifact", async () => {
    const root = await vaultFixture()
    const configPath = path.join(root, "plasma.json")
    const config = JSON.parse(await readFile(configPath, "utf8"))
    config.contracts = ["contracts/PatchedVault.sol"]
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)

    const build = await compileProject(root)
    const source = await readFile(path.join(root, "contracts/PatchedVault.sol"), "utf8")
    const findings = analyzeReentrancy("contracts/PatchedVault.sol", source)
    expect(findings).toHaveLength(0)
    await PlasmaStorage.writeAudit(root, {
      fingerprint: build.fingerprint!,
      timestamp: new Date().toISOString(),
      provider: "test/static-analyzer",
      model: "deterministic-reentrancy-guardrail",
      bytecodeHashes: Object.fromEntries(build.artifacts.map((item) => [item.id, item.bytecodeHash])),
      findings,
    })

    expect(await evaluateGate(root, "local")).toMatchObject({
      state: "Ready for local deploy",
      allowed: true,
      fingerprint: build.fingerprint,
    })
    expect(await evaluateGate(root, "sepolia")).toMatchObject({
      state: "Ready for Sepolia",
      allowed: true,
      fingerprint: build.fingerprint,
    })

    const prepared = await prepareSepolia(root)
    expect(prepared).toMatchObject({
      network: "sepolia",
      fingerprint: build.fingerprint,
      signingRequest: {
        chainId: 11155111,
        value: "0",
      },
    })
    expect(prepared.signingRequest?.data.startsWith("0x")).toBe(true)
    expect(JSON.stringify(prepared)).not.toContain("privateKey")
  })
})
