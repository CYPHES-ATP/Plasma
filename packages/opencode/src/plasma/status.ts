import { evaluateGate } from "./gate"
import { PlasmaStorage } from "./storage"

export async function plasmaStatus(directory: string) {
  const [build, audit, deployments, localGate, sepoliaGate] = await Promise.all([
    PlasmaStorage.readBuild(directory),
    PlasmaStorage.readAudit(directory),
    PlasmaStorage.readDeployments(directory),
    evaluateGate(directory, "local"),
    evaluateGate(directory, "sepolia"),
  ])
  return {
    build,
    audit,
    gate: {
      local: localGate,
      sepolia: sepoliaGate,
    },
    deployments,
  }
}
