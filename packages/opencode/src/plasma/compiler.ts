import { createHash } from "node:crypto"
import path from "node:path"
import { access, readFile } from "node:fs/promises"
import { glob } from "glob"
import solc from "solc"
import { readConfig } from "./config"
import { PlasmaStorage } from "./storage"
import type { BuildRecord, BuildSource, ContractArtifact, Diagnostic, PlasmaConfig } from "./schema"

type SourceUnit = {
  compilerPath: string
  workspacePath: string
  diskPath: string
  content: string
}

type SourceCollection = {
  units: SourceUnit[]
  inputFingerprint: string
}

const IMPORT_PATTERN =
  /\bimport\s+(?:(?:[^"']*?\s+from\s+)?["']([^"']+)["']|(?:\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+["']([^"']+)["'])\s*;/g

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function posix(value: string) {
  return value.split(path.sep).join("/")
}

function normalizeCompilerPath(value: string) {
  return path.posix.normalize(value.replaceAll("\\", "/")).replace(/^\.\/+/, "")
}

async function isFile(file: string) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function readRemappings(directory: string) {
  const file = path.join(directory, "remappings.txt")
  let text = ""
  try {
    text = await readFile(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .flatMap((line) => {
      const index = line.indexOf("=")
      if (index <= 0) return []
      return [{ prefix: line.slice(0, index), target: line.slice(index + 1) }]
    })
    .sort((a, b) => b.prefix.length - a.prefix.length)
}

function imports(content: string) {
  const out: string[] = []
  IMPORT_PATTERN.lastIndex = 0
  for (const match of content.matchAll(IMPORT_PATTERN)) {
    const value = match[1] ?? match[2]
    if (value) out.push(value)
  }
  return out
}

async function resolveImport(input: {
  directory: string
  importer: SourceUnit
  specifier: string
  remappings: Awaited<ReturnType<typeof readRemappings>>
}) {
  const { directory, importer, specifier, remappings } = input
  if (path.isAbsolute(specifier)) throw new Error(`Absolute Solidity import is not allowed: ${specifier}`)

  const compilerPath = specifier.startsWith(".")
    ? normalizeCompilerPath(path.posix.join(path.posix.dirname(importer.compilerPath), specifier))
    : normalizeCompilerPath(specifier)

  const candidates: string[] = []
  if (specifier.startsWith(".")) {
    candidates.push(path.resolve(path.dirname(importer.diskPath), specifier))
  } else {
    const remapping = remappings.find((item) => specifier.startsWith(item.prefix))
    if (remapping) {
      candidates.push(path.resolve(directory, remapping.target, specifier.slice(remapping.prefix.length)))
    }
    candidates.push(
      path.resolve(directory, specifier),
      path.resolve(directory, "node_modules", specifier),
      path.resolve(directory, "lib", specifier),
    )
    const [packageName, ...rest] = specifier.split("/")
    if (packageName) {
      candidates.push(
        path.resolve(directory, "lib", packageName, rest.join("/")),
        path.resolve(directory, "lib", packageName, "src", rest.join("/")),
        path.resolve(directory, "lib", packageName, "contracts", rest.join("/")),
      )
    }
  }

  for (const candidate of candidates) {
    if (await isFile(candidate)) return { compilerPath, diskPath: candidate }
  }
  throw new Error(`Unable to resolve import "${specifier}" from ${importer.workspacePath}.`)
}

export async function collectSources(directory: string, config?: PlasmaConfig): Promise<SourceCollection> {
  const resolvedConfig = config ?? (await readConfig(directory))
  const remappings = await readRemappings(directory)
  const entries = (
    await glob(resolvedConfig.contracts, {
      cwd: directory,
      absolute: true,
      nodir: true,
      dot: false,
      ignore: [".plasma/**", "out/**", "cache/**", "broadcast/**"],
    })
  ).toSorted()
  if (entries.length === 0) {
    throw new Error(`No Solidity sources matched: ${resolvedConfig.contracts.join(", ")}`)
  }

  const byCompilerPath = new Map<string, SourceUnit>()
  const visit = async (compilerPath: string, diskPath: string) => {
    const key = normalizeCompilerPath(compilerPath)
    if (byCompilerPath.has(key)) return
    const content = await readFile(diskPath, "utf8")
    const relative = posix(path.relative(directory, diskPath))
    const unit = {
      compilerPath: key,
      workspacePath: relative,
      diskPath,
      content,
    }
    byCompilerPath.set(key, unit)
    for (const specifier of imports(content)) {
      const dependency = await resolveImport({
        directory,
        importer: unit,
        specifier,
        remappings,
      })
      await visit(dependency.compilerPath, dependency.diskPath)
    }
  }

  for (const file of entries) {
    await visit(posix(path.relative(directory, file)), file)
  }

  const units = [...byCompilerPath.values()].toSorted((a, b) => a.compilerPath.localeCompare(b.compilerPath))
  const compilerSettings = {
    version: resolvedConfig.compiler.version,
    optimizer: {
      enabled: resolvedConfig.compiler.optimizer,
      runs: resolvedConfig.compiler.runs,
    },
    evmVersion: resolvedConfig.compiler.evmVersion,
  }
  const inputFingerprint = sha256(
    canonical({
      compilerSettings,
      sources: units.map((unit) => ({
        compilerPath: unit.compilerPath,
        workspacePath: unit.workspacePath,
        contentHash: sha256(unit.content),
      })),
    }),
  )
  return { units, inputFingerprint }
}

function sourcePosition(content: string, byteOffset: number) {
  const before = Buffer.from(content, "utf8").subarray(0, Math.max(0, byteOffset)).toString("utf8")
  const lines = before.split("\n")
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  }
}

function diagnostics(output: any, sources: Map<string, SourceUnit>): Diagnostic[] {
  return (Array.isArray(output.errors) ? output.errors : []).map((item: any) => {
    const compilerPath = item.sourceLocation?.file as string | undefined
    const unit = compilerPath ? sources.get(compilerPath) : undefined
    const position =
      unit && Number.isInteger(item.sourceLocation?.start)
        ? sourcePosition(unit.content, item.sourceLocation.start)
        : undefined
    return {
      ...(unit ? { file: unit.workspacePath } : compilerPath ? { file: compilerPath } : {}),
      ...position,
      severity: item.severity === "error" ? "error" : item.severity === "warning" ? "warning" : "info",
      message: item.message ?? item.formattedMessage ?? "Unknown Solidity compiler diagnostic",
    }
  })
}

function buildArtifacts(output: any, sources: Map<string, SourceUnit>): ContractArtifact[] {
  const artifacts: ContractArtifact[] = []
  for (const [compilerPath, contracts] of Object.entries(output.contracts ?? {})) {
    for (const [name, value] of Object.entries(contracts as Record<string, any>)) {
      const bytecodeObject = value.evm?.bytecode?.object ?? ""
      if (!bytecodeObject) continue
      const bytecode = `0x${bytecodeObject}`
      const workspacePath = sources.get(compilerPath)?.workspacePath ?? compilerPath
      artifacts.push({
        id: `${workspacePath}:${name}`,
        file: workspacePath,
        name,
        abi: Array.isArray(value.abi) ? value.abi : [],
        bytecode,
        deployedBytecode: `0x${value.evm?.deployedBytecode?.object ?? ""}`,
        sourceMap: value.evm?.bytecode?.sourceMap ?? "",
        deployedSourceMap: value.evm?.deployedBytecode?.sourceMap ?? "",
        bytecodeHash: sha256(bytecode),
      })
    }
  }
  return artifacts.toSorted((a, b) => a.id.localeCompare(b.id))
}

export async function compileProject(directory: string): Promise<BuildRecord> {
  const config = await readConfig(directory)
  const sourceCollection = await collectSources(directory, config)
  const sourceMap = new Map(sourceCollection.units.map((unit) => [unit.compilerPath, unit]))
  const settings = {
    optimizer: {
      enabled: config.compiler.optimizer,
      runs: config.compiler.runs,
    },
    ...(config.compiler.evmVersion ? { evmVersion: config.compiler.evmVersion } : {}),
    outputSelection: {
      "*": {
        "*": [
          "abi",
          "evm.bytecode.object",
          "evm.bytecode.sourceMap",
          "evm.deployedBytecode.object",
          "evm.deployedBytecode.sourceMap",
        ],
      },
    },
  }
  const input = {
    language: "Solidity",
    sources: Object.fromEntries(sourceCollection.units.map((unit) => [unit.compilerPath, { content: unit.content }])),
    settings,
  }

  const output = JSON.parse(
    solc.compile(JSON.stringify(input), {
      import: (specifier: string) => ({ error: `Unresolved import in Standard JSON input: ${specifier}` }),
    }),
  )
  const normalizedDiagnostics = diagnostics(output, sourceMap)
  const success = !normalizedDiagnostics.some((item) => item.severity === "error")
  const artifacts = success ? buildArtifacts(output, sourceMap) : []
  const sources: BuildSource[] = sourceCollection.units.map((unit) => ({
    compilerPath: unit.compilerPath,
    workspacePath: unit.workspacePath,
    contentHash: sha256(unit.content),
  }))
  const fingerprint = success
    ? sha256(
        canonical({
          inputFingerprint: sourceCollection.inputFingerprint,
          compilerVersion: config.compiler.version,
          settings,
          bytecode: artifacts.map((artifact) => ({
            id: artifact.id,
            creation: artifact.bytecode,
            deployed: artifact.deployedBytecode,
          })),
        }),
      )
    : undefined
  const record: BuildRecord = {
    success,
    timestamp: new Date().toISOString(),
    compilerVersion: config.compiler.version,
    compilerSettings: settings,
    inputFingerprint: sourceCollection.inputFingerprint,
    fingerprint,
    diagnostics: normalizedDiagnostics,
    sources,
    artifacts,
  }
  await PlasmaStorage.writeBuild(directory, record)
  return record
}

export async function currentInputFingerprint(directory: string) {
  const config = await readConfig(directory)
  return (await collectSources(directory, config)).inputFingerprint
}
