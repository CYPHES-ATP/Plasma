import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import type { AuditRecord, BuildRecord, DeploymentRecord } from "./schema"

const STATE_DIR = ".plasma"
const BUILD_FILE = "build.json"
const AUDIT_FILE = "audit.json"
const DEPLOYMENTS_FILE = "deployments.json"

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
}

async function writeJson(directory: string, name: string, value: unknown) {
  const root = path.join(directory, STATE_DIR)
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export const PlasmaStorage = {
  readBuild: (directory: string) => readJson<BuildRecord>(path.join(directory, STATE_DIR, BUILD_FILE)),
  writeBuild: (directory: string, value: BuildRecord) => writeJson(directory, BUILD_FILE, value),
  readAudit: (directory: string) => readJson<AuditRecord>(path.join(directory, STATE_DIR, AUDIT_FILE)),
  writeAudit: (directory: string, value: AuditRecord) => writeJson(directory, AUDIT_FILE, value),
  readDeployments: async (directory: string) =>
    (await readJson<DeploymentRecord[]>(path.join(directory, STATE_DIR, DEPLOYMENTS_FILE))) ?? [],
  appendDeployment: async (directory: string, value: DeploymentRecord) => {
    const current = (await readJson<DeploymentRecord[]>(path.join(directory, STATE_DIR, DEPLOYMENTS_FILE))) ?? []
    await writeJson(directory, DEPLOYMENTS_FILE, [...current, value])
  },
}
