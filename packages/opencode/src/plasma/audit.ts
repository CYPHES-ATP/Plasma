import path from "node:path"
import { readFile } from "node:fs/promises"
import { generateObject, type ModelMessage } from "ai"
import { Effect, Schema } from "effect"
import { Provider } from "@/provider/provider"
import { analyzeReentrancy } from "./analyzer"
import { compileProject } from "./compiler"
import { selectPlasmaModel } from "./model"
import { AuditOutput, type AuditRecord, type Finding } from "./schema"
import { PlasmaStorage } from "./storage"

const SECRET_PATH = /(^|\/)(?:\.env(?:\.|$)|.*(?:private[-_]?key|keystore|wallet|credentials?).*)/i

function mergeFindings(staticFindings: Finding[], modelFindings: readonly Finding[]) {
  const seen = new Set<string>()
  return [...staticFindings, ...modelFindings].filter((finding) => {
    const key = `${finding.file}:${finding.line}:${finding.title.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function auditProject(directory: string, provider: Provider.Interface) {
  return Effect.gen(function* () {
    const build = yield* Effect.tryPromise(() => compileProject(directory))
    if (!build.success || !build.fingerprint) {
      return yield* Effect.fail(new Error("Audit aborted because Solidity compilation failed."))
    }

    const uniqueFiles = [...new Set(build.sources.map((source) => source.workspacePath))].filter(
      (file) => !SECRET_PATH.test(file),
    )
    const sources = yield* Effect.tryPromise(() =>
      Promise.all(
        uniqueFiles.map(async (file) => ({
          file,
          content: await readFile(path.resolve(directory, file), "utf8"),
        })),
      ),
    )
    const model = yield* selectPlasmaModel(provider)
    const language = yield* provider.getLanguage(model)
    const messages: ModelMessage[] = [
      {
        role: "system",
        content: `You are CYPHES, Plasma's Solidity security copilot.
Audit only reentrancy:
- external calls before state updates
- missing or ineffective reentrancy protection
- cross-function reentrancy paths

Use the compiled source context. Report concrete, exploitable flows only. Return structured JSON matching the schema.
Do not claim the contract is safe beyond this focused reentrancy audit.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          compiler: {
            version: build.compilerVersion,
            settings: build.compilerSettings,
            fingerprint: build.fingerprint,
          },
          contracts: build.artifacts.map((artifact) => ({
            id: artifact.id,
            abi: artifact.abi,
            bytecodeHash: artifact.bytecodeHash,
          })),
          sources,
        }),
      },
    ]
    const output = yield* Effect.tryPromise(() =>
      generateObject({
        model: language,
        temperature: 0,
        messages,
        schema: Object.assign(Schema.toStandardSchemaV1(AuditOutput), Schema.toStandardJSONSchemaV1(AuditOutput)),
      }).then((result) => result.object),
    )

    const sourceLines = new Map(sources.map((source) => [source.file, source.content.split(/\r?\n/).length]))
    for (const finding of output.findings) {
      const lines = sourceLines.get(finding.file)
      if (!lines) {
        return yield* Effect.fail(new Error(`Audit model returned a finding for an unknown file: ${finding.file}`))
      }
      if (finding.line > lines) {
        return yield* Effect.fail(
          new Error(`Audit model returned an invalid line for ${finding.file}: ${finding.line}`),
        )
      }
    }

    const staticFindings = sources.flatMap((source) => analyzeReentrancy(source.file, source.content))
    const findings = mergeFindings(staticFindings, output.findings)
    const record: AuditRecord = {
      fingerprint: build.fingerprint,
      timestamp: new Date().toISOString(),
      provider: model.providerID,
      model: model.id,
      bytecodeHashes: Object.fromEntries(build.artifacts.map((artifact) => [artifact.id, artifact.bytecodeHash])),
      findings,
    }
    yield* Effect.tryPromise(() => PlasmaStorage.writeAudit(directory, record))
    return record
  })
}
