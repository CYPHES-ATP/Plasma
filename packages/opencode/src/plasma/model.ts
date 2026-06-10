import { Effect } from "effect"
import { Provider } from "@/provider/provider"

export function selectPlasmaModel(provider: Provider.Interface) {
  return Effect.gen(function* () {
    const providers = yield* provider.list()
    const anthropic = providers["anthropic" as keyof typeof providers]
    if (anthropic) {
      const [model] = Provider.sort(Object.values(anthropic.models))
      if (model) return model
    }
    const fallback = yield* provider.defaultModel()
    return yield* provider.getModel(fallback.providerID, fallback.modelID)
  })
}
