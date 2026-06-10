import { Schema } from "effect"

export const Severity = Schema.Literals(["critical", "high", "medium", "low", "info"])
export type Severity = Schema.Schema.Type<typeof Severity>

export const Finding = Schema.Struct({
  severity: Severity,
  title: Schema.String,
  file: Schema.String,
  line: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  description: Schema.String,
  exploitPath: Schema.Array(Schema.String),
  fix: Schema.String,
})
export type Finding = Schema.Schema.Type<typeof Finding>

export const AuditOutput = Schema.Struct({
  findings: Schema.Array(Finding),
})
export type AuditOutput = Schema.Schema.Type<typeof AuditOutput>

export type PlasmaConfig = {
  contracts: string[]
  compiler: {
    version: string
    optimizer: boolean
    runs: number
    evmVersion?: string
  }
  audit: {
    blockOn: Severity[]
  }
  networks: {
    local: {
      rpcUrl: string
      chainId: number
    }
    sepolia: {
      chainId: number
    }
  }
}

export type Diagnostic = {
  file?: string
  line?: number
  column?: number
  severity: "error" | "warning" | "info"
  message: string
}

export type ContractArtifact = {
  id: string
  file: string
  name: string
  abi: unknown[]
  bytecode: string
  deployedBytecode: string
  sourceMap: string
  deployedSourceMap: string
  bytecodeHash: string
}

export type BuildSource = {
  compilerPath: string
  workspacePath: string
  contentHash: string
}

export type BuildRecord = {
  success: boolean
  timestamp: string
  compilerVersion: string
  compilerSettings: Record<string, unknown>
  inputFingerprint: string
  fingerprint?: string
  diagnostics: Diagnostic[]
  sources: BuildSource[]
  artifacts: ContractArtifact[]
}

export type AuditRecord = {
  fingerprint: string
  timestamp: string
  provider: string
  model: string
  bytecodeHashes: Record<string, string>
  findings: Finding[]
}

export type GateState =
  | "Not evaluated"
  | "Compile failed"
  | "Audit required"
  | "Blocked"
  | "Ready for local deploy"
  | "Ready for Sepolia"
  | "Stale - code changed"

export type GateResult = {
  state: GateState
  allowed: boolean
  reason: string
  fingerprint?: string
  blockingFindings: Finding[]
}

export type DeploymentRecord = {
  network: "local" | "sepolia"
  contract: string
  fingerprint: string
  timestamp: string
  address?: string
  transactionHash?: string
  gasUsed?: string
  explorerUrl?: string
  signingRequest?: {
    chainId: number
    data: string
    value: string
  }
}
