import { currentInputFingerprint } from "./compiler"
import { readConfig } from "./config"
import type { GateResult } from "./schema"
import { PlasmaStorage } from "./storage"

export async function evaluateGate(directory: string, target: "local" | "sepolia" = "local"): Promise<GateResult> {
  const [build, audit, config] = await Promise.all([
    PlasmaStorage.readBuild(directory),
    PlasmaStorage.readAudit(directory),
    readConfig(directory),
  ])
  if (!build) {
    return {
      state: "Not evaluated",
      allowed: false,
      reason: "Compile the project before deployment.",
      blockingFindings: [],
    }
  }
  if (!build.success || !build.fingerprint) {
    return {
      state: "Compile failed",
      allowed: false,
      reason: "The latest Solidity compilation failed.",
      blockingFindings: [],
    }
  }

  const inputFingerprint = await currentInputFingerprint(directory)
  if (inputFingerprint !== build.inputFingerprint) {
    return {
      state: audit ? "Stale - code changed" : "Audit required",
      allowed: false,
      reason: "Source, dependencies, or compiler settings changed after the saved build.",
      fingerprint: build.fingerprint,
      blockingFindings: [],
    }
  }
  if (!audit) {
    return {
      state: "Audit required",
      allowed: false,
      reason: "Run the focused reentrancy audit for this exact build fingerprint.",
      fingerprint: build.fingerprint,
      blockingFindings: [],
    }
  }
  if (audit.fingerprint !== build.fingerprint) {
    return {
      state: "Stale - code changed",
      allowed: false,
      reason: "The saved audit belongs to a different build fingerprint.",
      fingerprint: build.fingerprint,
      blockingFindings: [],
    }
  }

  const blockOn = new Set(config.audit.blockOn)
  const blockingFindings = audit.findings.filter((finding) => blockOn.has(finding.severity))
  if (blockingFindings.length > 0) {
    return {
      state: "Blocked",
      allowed: false,
      reason: `${blockingFindings.length} unresolved critical/high-risk finding(s) block deployment.`,
      fingerprint: build.fingerprint,
      blockingFindings,
    }
  }
  return {
    state: target === "sepolia" ? "Ready for Sepolia" : "Ready for local deploy",
    allowed: true,
    reason: "Compilation passed and the current fingerprint has no blocking reentrancy findings.",
    fingerprint: build.fingerprint,
    blockingFindings: [],
  }
}
