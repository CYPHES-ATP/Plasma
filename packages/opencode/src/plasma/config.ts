import path from "node:path"
import { readFile } from "node:fs/promises"
import type { PlasmaConfig, Severity } from "./schema"

export const CONFIG_FILE = "plasma.json"
export const SUPPORTED_SOLC_VERSION = "0.8.26"

export const DEFAULT_CONFIG: PlasmaConfig = {
  contracts: ["contracts/**/*.sol"],
  compiler: {
    version: SUPPORTED_SOLC_VERSION,
    optimizer: true,
    runs: 200,
  },
  audit: {
    blockOn: ["critical", "high"],
  },
  networks: {
    local: {
      rpcUrl: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    sepolia: {
      chainId: 11155111,
    },
  },
}

const severities = new Set<Severity>(["critical", "high", "medium", "low", "info"])

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  return value as Record<string, unknown>
}

export function validateConfig(value: unknown): PlasmaConfig {
  const errors: string[] = []
  const root = record(value)
  if (!root) throw new Error("plasma.json must contain a JSON object.")

  const contracts = Array.isArray(root.contracts)
    ? root.contracts.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : []
  if (contracts.length === 0) errors.push("contracts must contain at least one Solidity glob.")

  const compiler = record(root.compiler)
  const version = typeof compiler?.version === "string" ? compiler.version : ""
  if (!version) errors.push("compiler.version is required.")
  if (version && version !== SUPPORTED_SOLC_VERSION) {
    errors.push(`compiler.version ${version} is not bundled; this build supports ${SUPPORTED_SOLC_VERSION}.`)
  }
  const optimizer = compiler?.optimizer
  if (typeof optimizer !== "boolean") errors.push("compiler.optimizer must be true or false.")
  const runs = compiler?.runs
  if (!Number.isInteger(runs) || Number(runs) < 0) errors.push("compiler.runs must be a non-negative integer.")
  const evmVersion = compiler?.evmVersion
  if (evmVersion !== undefined && typeof evmVersion !== "string") {
    errors.push("compiler.evmVersion must be a string when provided.")
  }

  const audit = record(root.audit)
  const blockOn = Array.isArray(audit?.blockOn)
    ? audit.blockOn.filter((item): item is Severity => typeof item === "string" && severities.has(item as Severity))
    : []
  if (blockOn.length === 0) errors.push("audit.blockOn must contain at least one valid severity.")

  const networks = record(root.networks)
  const local = record(networks?.local)
  const sepolia = record(networks?.sepolia)
  const rpcUrl = typeof local?.rpcUrl === "string" ? local.rpcUrl : ""
  if (!/^https?:\/\//.test(rpcUrl)) errors.push("networks.local.rpcUrl must be an http(s) URL.")
  const localChainId = local?.chainId
  if (!Number.isInteger(localChainId) || Number(localChainId) <= 0) {
    errors.push("networks.local.chainId must be a positive integer.")
  }
  const sepoliaChainId = sepolia?.chainId
  if (sepoliaChainId !== 11155111) errors.push("networks.sepolia.chainId must be 11155111.")

  if (errors.length > 0) {
    throw new Error(`Invalid plasma.json:\n- ${errors.join("\n- ")}`)
  }

  return {
    contracts,
    compiler: {
      version,
      optimizer: optimizer as boolean,
      runs: runs as number,
      ...(typeof evmVersion === "string" && evmVersion ? { evmVersion } : {}),
    },
    audit: {
      blockOn,
    },
    networks: {
      local: {
        rpcUrl,
        chainId: localChainId as number,
      },
      sepolia: {
        chainId: sepoliaChainId as number,
      },
    },
  }
}

export async function readConfig(directory: string) {
  const file = path.join(directory, CONFIG_FILE)
  let text: string
  try {
    text = await readFile(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No ${CONFIG_FILE} found in ${directory}. Run /plasma new or add the configuration file.`)
    }
    throw error
  }
  try {
    return validateConfig(JSON.parse(text))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Invalid ${CONFIG_FILE}: ${error.message}`)
    throw error
  }
}
