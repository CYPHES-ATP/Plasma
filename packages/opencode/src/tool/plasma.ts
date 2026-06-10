import path from "node:path"
import { createTwoFilesPatch } from "diff"
import { Effect, Schema } from "effect"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { Provider } from "@/provider/provider"
import { auditProject } from "@/plasma/audit"
import { compileProject } from "@/plasma/compiler"
import { deployLocal, prepareSepolia } from "@/plasma/deploy"
import { proposeFix } from "@/plasma/fix"
import { initializeProject } from "@/plasma/project"
import { plasmaStatus } from "@/plasma/status"
import { FSUtil } from "@opencode-ai/core/fs-util"
import * as Tool from "./tool"

const Empty = Schema.Struct({})
const FixParameters = Schema.Struct({
  finding: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).annotate({
    description: "Zero-based finding index from plasma_status or plasma_audit.",
  }),
})
const DeployParameters = Schema.Struct({
  target: Schema.Literals(["local", "sepolia"]),
  contract: Schema.optional(Schema.String).annotate({
    description: "Compiled artifact ID, for example contracts/Starter.sol:Starter.",
  }),
  args: Schema.optional(Schema.Array(Schema.Unknown)).annotate({
    description: "Constructor arguments in ABI order.",
  }),
})

function json(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export const PlasmaNewTool = Tool.define(
  "plasma_new",
  Effect.succeed({
    description: "Initialize a secure Foundry-style Solidity project with plasma.json and a tested Starter contract.",
    parameters: Empty,
    execute: (_params, ctx) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        yield* ctx.ask({
          permission: "edit",
          patterns: [
            "contracts/**",
            "test/**",
            "script/**",
            "lib/**",
            "plasma.json",
            ".gitignore",
            "foundry.toml",
            "remappings.txt",
          ],
          always: ["*"],
          metadata: {
            filepath: instance.directory,
            diff: "Create the Plasma Solidity starter project.",
          },
        })
        const result = yield* Effect.tryPromise(() => initializeProject(instance.directory))
        return {
          title: "Plasma project initialized",
          metadata: {},
          output: json(result),
        }
      }).pipe(Effect.orDie),
  }),
)

export const PlasmaCompileTool = Tool.define(
  "plasma_compile",
  Effect.succeed({
    description:
      "Compile the current Solidity workspace with solc Standard JSON and save deterministic fingerprinted artifacts.",
    parameters: Empty,
    execute: () =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const result = yield* Effect.tryPromise(() => compileProject(instance.directory))
        return {
          title: result.success ? "Solidity compile passed" : "Solidity compile failed",
          metadata: {},
          output: json(result),
        }
      }).pipe(Effect.orDie),
  }),
)

export const PlasmaAuditTool = Tool.define(
  "plasma_audit",
  Effect.gen(function* () {
    const provider = yield* Provider.Service
    return {
      description:
        "Run Plasma's focused reentrancy audit using the configured model layer and bind findings to the exact build fingerprint.",
      parameters: Empty,
      execute: () =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const result = yield* auditProject(instance.directory, provider)
          return {
            title: "Reentrancy audit complete",
            metadata: {},
            output: json(result),
          }
        }).pipe(Effect.orDie),
    }
  }),
)

export const PlasmaStatusTool = Tool.define(
  "plasma_status",
  Effect.succeed({
    description: "Show Plasma compile, audit, deployment-gate, and deployment-history state.",
    parameters: Empty,
    execute: () =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const result = yield* Effect.tryPromise(() => plasmaStatus(instance.directory))
        return {
          title: `Plasma gate: ${result.gate.local.state}`,
          metadata: {},
          output: json(result),
        }
      }).pipe(Effect.orDie),
  }),
)

export const PlasmaFixTool = Tool.define(
  "plasma_fix",
  Effect.gen(function* () {
    const provider = yield* Provider.Service
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description:
        "Propose a minimal edit for a selected reentrancy finding and request approval through the host edit permission flow before writing.",
      parameters: FixParameters,
      execute: (params: Schema.Schema.Type<typeof FixParameters>, ctx) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const proposal = yield* proposeFix(instance.directory, params.finding, provider)
          const relative = path.relative(instance.worktree, proposal.absoluteFile)
          const diff = createTwoFilesPatch(relative, relative, proposal.source, proposal.updated)
          yield* ctx.ask({
            permission: "edit",
            patterns: [relative],
            always: ["*"],
            metadata: {
              filepath: proposal.absoluteFile,
              diff,
            },
          })
          yield* fs.writeWithDirs(proposal.absoluteFile, proposal.updated)
          yield* events.publish(FileSystem.Event.Edited, { file: proposal.absoluteFile })
          yield* events.publish(Watcher.Event.Updated, {
            file: proposal.absoluteFile,
            event: "change",
          })
          return {
            title: `Applied approved fix to ${relative}`,
            metadata: {},
            output: json({
              file: relative,
              explanation: proposal.explanation,
              model: proposal.model,
              note: "The previous audit is now stale. Recompile and audit again.",
            }),
          }
        }).pipe(Effect.orDie),
    }
  }),
)

export const PlasmaDeployTool = Tool.define(
  "plasma_deploy",
  Effect.succeed({
    description:
      "Deploy an exact audited artifact to local Anvil, or prepare an exact audited Sepolia transaction for external wallet signing. Mainnet is not supported.",
    parameters: DeployParameters,
    execute: (params: Schema.Schema.Type<typeof DeployParameters>) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const result = yield* Effect.tryPromise(() =>
          params.target === "local"
            ? deployLocal(instance.directory, params.contract, [...(params.args ?? [])])
            : prepareSepolia(instance.directory, params.contract, [...(params.args ?? [])]),
        )
        return {
          title: params.target === "local" ? "Anvil deployment complete" : "Sepolia signing request ready",
          metadata: {},
          output: json(result),
        }
      }).pipe(Effect.orDie),
  }),
)
