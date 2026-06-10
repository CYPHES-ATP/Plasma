import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Provider } from "@/provider/provider"
import * as InstanceState from "@/effect/instance-state"
import { auditProject } from "@/plasma/audit"
import { compileProject } from "@/plasma/compiler"
import { deployLocal, prepareSepolia } from "@/plasma/deploy"
import { evaluateGate } from "@/plasma/gate"
import { initializeProject } from "@/plasma/project"
import { plasmaStatus } from "@/plasma/status"
import { InstanceHttpApi } from "../api"
import { ApiPlasmaError } from "../groups/plasma"

function plasmaError(error: unknown) {
  const message = (() => {
    if (Provider.NoProvidersError.isInstance(error)) {
      return "No configured model provider is available. Connect a provider before running the reentrancy audit."
    }
    if (Provider.NoModelsError.isInstance(error)) {
      return `The configured provider ${error.providerID} has no available models.`
    }
    if (Provider.ModelNotFoundError.isInstance(error)) {
      return `The configured model ${error.providerID}/${error.modelID} is not available.`
    }
    if (Provider.InitError.isInstance(error)) {
      return `The configured provider ${error.providerID} could not be initialized.`
    }
    if (error instanceof Error && error.message) return error.message
    return String(error) || "The Plasma operation failed."
  })()
  return new ApiPlasmaError({
    name: "PlasmaError",
    data: {
      message,
    },
  })
}

function json<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function promise<T>(run: () => Promise<T>) {
  return Effect.tryPromise({
    try: run,
    catch: plasmaError,
  }).pipe(Effect.map(json))
}

function plasmaEffect<T, E, R>(effect: Effect.Effect<T, E, R>) {
  return effect.pipe(Effect.map(json), Effect.mapError(plasmaError))
}

export const plasmaHandlers = HttpApiBuilder.group(InstanceHttpApi, "plasma", (handlers) =>
  Effect.gen(function* () {
    const provider = yield* Provider.Service
    const directory = () => InstanceState.context.pipe(Effect.map((ctx) => ctx.directory))

    return handlers
      .handle("status", (ctx) =>
        Effect.gen(function* () {
          const root = yield* directory()
          if (ctx.query.target) return yield* promise(() => evaluateGate(root, ctx.query.target))
          return yield* promise(() => plasmaStatus(root))
        }),
      )
      .handle("initialize", () =>
        Effect.gen(function* () {
          const root = yield* directory()
          return yield* promise(() => initializeProject(root))
        }),
      )
      .handle("compile", () =>
        Effect.gen(function* () {
          const root = yield* directory()
          return yield* promise(() => compileProject(root))
        }),
      )
      .handle("audit", () =>
        Effect.gen(function* () {
          const root = yield* directory()
          return yield* plasmaEffect(auditProject(root, provider))
        }),
      )
      .handle("deployLocal", (ctx) =>
        Effect.gen(function* () {
          const root = yield* directory()
          return yield* promise(() => deployLocal(root, ctx.payload.contract, [...(ctx.payload.args ?? [])]))
        }),
      )
      .handle("prepareSepolia", (ctx) =>
        Effect.gen(function* () {
          const root = yield* directory()
          return yield* promise(() => prepareSepolia(root, ctx.payload.contract, [...(ctx.payload.args ?? [])]))
        }),
      )
  }),
)
