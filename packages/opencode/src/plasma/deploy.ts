import { ContractFactory, JsonRpcProvider, type InterfaceAbi } from "ethers"
import { compileProject } from "./compiler"
import { readConfig } from "./config"
import { evaluateGate } from "./gate"
import type { ContractArtifact, DeploymentRecord } from "./schema"
import { PlasmaStorage } from "./storage"

function artifactByID(artifacts: ContractArtifact[], id?: string) {
  const artifact = id ? artifacts.find((item) => item.id === id) : artifacts[0]
  if (!artifact) throw new Error(id ? `Compiled contract not found: ${id}` : "No deployable contract was compiled.")
  return artifact
}

async function approvedArtifact(directory: string, target: "local" | "sepolia", contract?: string) {
  const build = await compileProject(directory)
  if (!build.success || !build.fingerprint) throw new Error("Deployment blocked: compilation failed.")
  const fingerprint = build.fingerprint
  const gate = await evaluateGate(directory, target)
  if (!gate.allowed) throw new Error(`Deployment blocked: ${gate.state}. ${gate.reason}`)
  const audit = await PlasmaStorage.readAudit(directory)
  if (!audit || audit.fingerprint !== build.fingerprint) {
    throw new Error("Deployment blocked: the exact compiled fingerprint has not been audited.")
  }
  const artifact = artifactByID(build.artifacts, contract)
  if (audit.bytecodeHashes[artifact.id] !== artifact.bytecodeHash) {
    throw new Error("Deployment blocked: selected bytecode does not match the audited artifact.")
  }
  return { build, artifact, fingerprint }
}

export async function deployLocal(directory: string, contract?: string, args: unknown[] = []) {
  const config = await readConfig(directory)
  const { artifact, fingerprint } = await approvedArtifact(directory, "local", contract)
  const provider = new JsonRpcProvider(config.networks.local.rpcUrl, config.networks.local.chainId, {
    staticNetwork: true,
  })
  let signer
  try {
    const network = await provider.getNetwork()
    if (Number(network.chainId) !== config.networks.local.chainId) {
      throw new Error(`Anvil returned chain ID ${network.chainId}; expected ${config.networks.local.chainId}.`)
    }
    signer = await provider.getSigner(0)
  } catch (error) {
    throw new Error(
      `Anvil is unavailable at ${config.networks.local.rpcUrl}. Start Anvil and retry. ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  const factory = new ContractFactory(artifact.abi as InterfaceAbi, artifact.bytecode, signer)
  const deployed = await factory.deploy(...args)
  const transaction = deployed.deploymentTransaction()
  if (!transaction) throw new Error("Anvil deployment did not return a transaction.")
  const receipt = await transaction.wait()
  if (!receipt) throw new Error("Anvil deployment receipt was not available.")
  const record: DeploymentRecord = {
    network: "local",
    contract: artifact.id,
    fingerprint,
    timestamp: new Date().toISOString(),
    address: await deployed.getAddress(),
    transactionHash: receipt.hash,
    gasUsed: receipt.gasUsed.toString(),
  }
  await PlasmaStorage.appendDeployment(directory, record)
  return record
}

export async function prepareSepolia(directory: string, contract?: string, args: unknown[] = []) {
  const config = await readConfig(directory)
  const { artifact, fingerprint } = await approvedArtifact(directory, "sepolia", contract)
  const factory = new ContractFactory(artifact.abi as InterfaceAbi, artifact.bytecode)
  const transaction = await factory.getDeployTransaction(...args)
  if (!transaction.data) throw new Error("Unable to encode the Sepolia deployment transaction.")
  const record: DeploymentRecord = {
    network: "sepolia",
    contract: artifact.id,
    fingerprint,
    timestamp: new Date().toISOString(),
    signingRequest: {
      chainId: config.networks.sepolia.chainId,
      data: transaction.data.toString(),
      value: (transaction.value ?? 0n).toString(),
    },
  }
  await PlasmaStorage.appendDeployment(directory, record)
  return record
}
