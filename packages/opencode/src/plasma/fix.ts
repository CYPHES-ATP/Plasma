import path from "node:path"
import { readFile } from "node:fs/promises"
import { generateObject, type ModelMessage } from "ai"
import { Effect, Schema } from "effect"
import { Provider } from "@/provider/provider"
import { selectPlasmaModel } from "./model"
import { PlasmaStorage } from "./storage"

const FixOutput = Schema.Struct({
  file: Schema.String,
  search: Schema.String,
  replacement: Schema.String,
  explanation: Schema.String,
})
export type FixProposal = Schema.Schema.Type<typeof FixOutput>

export function proposeFix(directory: string, findingIndex: number, provider: Provider.Interface) {
  return Effect.gen(function* () {
    const [audit, build] = yield* Effect.tryPromise(() =>
      Promise.all([PlasmaStorage.readAudit(directory), PlasmaStorage.readBuild(directory)]),
    )
    if (!audit || !build?.fingerprint) {
      return yield* Effect.fail(new Error("Run a successful compile and audit before requesting a fix."))
    }
    if (audit.fingerprint !== build.fingerprint) {
      return yield* Effect.fail(new Error("The audit is stale. Recompile and audit before fixing."))
    }
    const finding = audit.findings[findingIndex]
    if (!finding) return yield* Effect.fail(new Error(`Finding ${findingIndex} does not exist.`))
    const file = path.resolve(directory, finding.file)
    const source = yield* Effect.tryPromise(() => readFile(file, "utf8"))
    const model = yield* selectPlasmaModel(provider)
    const language = yield* provider.getLanguage(model)
    const messages: ModelMessage[] = [
      {
        role: "system",
        content:
          "You are CYPHES. Produce one minimal Solidity edit for the selected reentrancy finding. Preserve public behavior where possible. Return an exact search string copied from the file and its replacement. Do not edit unrelated code.",
      },
      {
        role: "user",
        content: JSON.stringify({ finding, source }),
      },
    ]
    const proposal = yield* Effect.tryPromise(() =>
      generateObject({
        model: language,
        temperature: 0,
        messages,
        schema: Object.assign(Schema.toStandardSchemaV1(FixOutput), Schema.toStandardJSONSchemaV1(FixOutput)),
      }).then((result) => result.object),
    )
    if (proposal.file !== finding.file) return yield* Effect.fail(new Error("Fix proposal targeted a different file."))
    if (!proposal.search || proposal.search === proposal.replacement) {
      return yield* Effect.fail(new Error("Fix proposal did not contain a valid edit."))
    }
    const matches = source.split(proposal.search).length - 1
    if (matches !== 1) {
      return yield* Effect.fail(new Error(`Fix search text must match exactly once; matched ${matches} times.`))
    }
    return {
      ...proposal,
      absoluteFile: file,
      source,
      updated: source.replace(proposal.search, proposal.replacement),
      model: `${model.providerID}/${model.id}`,
    }
  })
}
