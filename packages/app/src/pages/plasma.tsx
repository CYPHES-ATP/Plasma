import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { PlasmaMark } from "@/components/plasma-mark"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { decodeDirectory } from "@/pages/directory-layout"
import { showToast } from "@/utils/toast"

type Diagnostic = {
  file?: string
  line?: number
  column?: number
  severity: "error" | "warning" | "info"
  message: string
}

type Artifact = {
  id: string
  file: string
  name: string
  abi: unknown[]
  bytecode: string
  deployedBytecode: string
}

type Build = {
  success: boolean
  timestamp: string
  compilerVersion: string
  fingerprint?: string
  diagnostics: Diagnostic[]
  artifacts: Artifact[]
}

type Finding = {
  severity: "critical" | "high" | "medium" | "low" | "info"
  title: string
  file: string
  line: number
  description: string
  exploitPath: string[]
  fix: string
}

type Audit = {
  fingerprint: string
  timestamp: string
  provider: string
  model: string
  findings: Finding[]
}

type Gate = {
  state:
    | "Not evaluated"
    | "Compile failed"
    | "Audit required"
    | "Blocked"
    | "Ready for local deploy"
    | "Ready for Sepolia"
    | "Stale - code changed"
  allowed: boolean
  reason: string
  blockingFindings: Finding[]
}

type Deployment = {
  network: "local" | "sepolia"
  contract: string
  fingerprint: string
  timestamp: string
  address?: string
  transactionHash?: string
  gasUsed?: string
  explorerUrl?: string
  signingRequest?: {
    chainId: number
    data: string
    value: string
  }
}

type Status = {
  build?: Build
  audit?: Audit
  gate: {
    local: Gate
    sepolia: Gate
  }
  deployments: Deployment[]
}

type EthereumProvider = {
  request(input: { method: string; params?: unknown[] }): Promise<unknown>
}

type EthereumReceipt = {
  contractAddress?: string
  gasUsed?: string
  status?: string
  transactionHash?: string
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

const EMPTY_GATE: Gate = {
  state: "Not evaluated",
  allowed: false,
  reason: "Compile and audit this workspace to evaluate the deployment gate.",
  blockingFindings: [],
}

async function waitForWalletReceipt(ethereum: EthereumProvider, hash: string) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const receipt = (await ethereum.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    })) as EthereumReceipt | null
    if (receipt) return receipt
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error("Timed out waiting for the Sepolia transaction receipt.")
}

function badgeClass(state: Gate["state"]) {
  if (state.startsWith("Ready")) return "bg-success/10 text-text-success border-border-success"
  if (state === "Not evaluated" || state === "Audit required") {
    return "bg-warning/10 text-text-warning border-border-warning"
  }
  return "bg-critical/10 text-text-critical border-border-critical"
}

function severityClass(severity: Finding["severity"]) {
  if (severity === "critical" || severity === "high") return "text-text-critical bg-critical/10"
  if (severity === "medium") return "text-text-warning bg-warning/10"
  return "text-text-weak bg-surface-raised-base"
}

export default function Plasma() {
  const params = useParams<{ dir: string }>()
  const [searchParams, setSearchParams] = useSearchParams<{ initialize?: string }>()
  const navigate = useNavigate()
  const server = useServer()
  const platform = usePlatform()
  const directory = createMemo(() => decodeDirectory(params.dir) ?? "")
  const [status, setStatus] = createSignal<Status>()
  const [busy, setBusy] = createSignal<string>()
  const [error, setError] = createSignal<string>()
  const [selectedContract, setSelectedContract] = createSignal("")
  const [constructorArgs, setConstructorArgs] = createSignal("[]")
  const [walletDeployments, setWalletDeployments] = createSignal<Deployment[]>([])
  const [signingRequest, setSigningRequest] = createSignal<Deployment>()

  const build = createMemo(() => status()?.build)
  const audit = createMemo(() => status()?.audit)
  const artifacts = createMemo(() => build()?.artifacts ?? [])
  const selected = createMemo(() => selectedContract() || artifacts()[0]?.id || "")
  const findings = createMemo(() => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
    return [...(audit()?.findings ?? [])].sort((a, b) => rank[a.severity] - rank[b.severity])
  })

  function requestHeaders(json = false) {
    const headers = new Headers()
    if (json) headers.set("content-type", "application/json")
    const current = server.current
    if (current?.http.username || current?.http.password) {
      headers.set("authorization", `Basic ${btoa(`${current.http.username ?? ""}:${current.http.password ?? ""}`)}`)
    }
    return headers
  }

  async function api<T>(path: string, init?: RequestInit) {
    const current = server.current
    if (!current) throw new Error("No Plasma server is connected.")
    const url = new URL(path, `${current.http.url.replace(/\/+$/, "")}/`)
    url.searchParams.set("directory", directory())
    const fetcher = platform.fetch ?? globalThis.fetch
    const response = await fetcher(url.toString(), {
      ...init,
      headers: init?.headers ?? requestHeaders(Boolean(init?.body)),
    })
    const body = (await response.json().catch(() => undefined)) as
      | T
      | { data?: { message?: string }; message?: string }
      | undefined
    if (!response.ok) {
      const detail =
        body && typeof body === "object" && "data" in body
          ? body.data?.message
          : body && typeof body === "object" && "message" in body
            ? body.message
            : undefined
      throw new Error(detail ?? `Plasma request failed (${response.status}).`)
    }
    return body as T
  }

  async function refresh(silent = false) {
    if (!silent) setBusy("status")
    try {
      const next = await api<Status>("/plasma/status")
      setStatus(next)
      setError(undefined)
      if (!selectedContract() && next.build?.artifacts[0]) setSelectedContract(next.build.artifacts[0].id)
    } catch (cause) {
      setStatus({
        gate: { local: EMPTY_GATE, sepolia: EMPTY_GATE },
        deployments: [],
      })
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (!silent) setBusy(undefined)
    }
  }

  async function run<T>(name: string, action: () => Promise<T>, message: string) {
    setBusy(name)
    setError(undefined)
    try {
      const result = await action()
      showToast({ variant: "success", title: message })
      await refresh(true)
      return result
    } catch (cause) {
      const description = cause instanceof Error ? cause.message : String(cause)
      setError(description)
      showToast({ variant: "error", title: `${message} failed`, description })
    } finally {
      setBusy(undefined)
    }
  }

  function args() {
    const parsed = JSON.parse(constructorArgs()) as unknown
    if (!Array.isArray(parsed)) throw new Error("Constructor arguments must be a JSON array.")
    return parsed
  }

  function openFinding(finding: Finding) {
    const query = new URLSearchParams({
      plasmaFile: finding.file,
      plasmaLine: String(finding.line),
    })
    navigate(`/${params.dir}/session?${query.toString()}`)
  }

  function requestFix(index: number) {
    navigate(`/${params.dir}/session?prompt=${encodeURIComponent(`/plasma fix ${index}`)}`)
  }

  async function deploySepolia() {
    const prepared = await run(
      "deploy-sepolia",
      () =>
        api<Deployment>("/plasma/deploy/sepolia", {
          method: "POST",
          body: JSON.stringify({ contract: selected(), args: args() }),
        }),
      "Sepolia transaction prepared",
    )
    if (!prepared?.signingRequest) return
    setSigningRequest(prepared)
    const ethereum = window.ethereum
    if (!ethereum) return

    setBusy("wallet")
    try {
      const request = prepared.signingRequest
      const chain = `0x${request.chainId.toString(16)}`
      await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain }] })
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[]
      const from = accounts[0]
      if (!from) throw new Error("The wallet did not provide a signing account.")
      const hash = (await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, data: request.data, value: `0x${BigInt(request.value).toString(16)}` }],
      })) as string
      showToast({ title: "Sepolia transaction submitted", description: hash })
      const receipt = await waitForWalletReceipt(ethereum, hash)
      if (receipt.status && BigInt(receipt.status) !== 1n) {
        throw new Error(`Sepolia deployment transaction reverted: ${hash}`)
      }
      const complete: Deployment = {
        ...prepared,
        address: receipt.contractAddress,
        transactionHash: receipt.transactionHash ?? hash,
        gasUsed: receipt.gasUsed ? BigInt(receipt.gasUsed).toString() : undefined,
        explorerUrl: `https://sepolia.etherscan.io/tx/${hash}`,
      }
      setWalletDeployments((items) => [complete, ...items])
      showToast({
        variant: "success",
        title: "Contract deployed to Sepolia",
        description: receipt.contractAddress ?? hash,
      })
    } catch (cause) {
      const description = cause instanceof Error ? cause.message : String(cause)
      setError(description)
      showToast({ variant: "error", title: "Wallet signing failed", description })
    } finally {
      setBusy(undefined)
    }
  }

  onMount(() => {
    const timer = window.setInterval(() => {
      if (busy()) return
      void refresh(true)
    }, 2000)
    onCleanup(() => window.clearInterval(timer))
    void (async () => {
      if (searchParams.initialize === "1") {
        setSearchParams({ initialize: undefined }, { replace: true })
        await run(
          "initialize",
          () => api("/plasma/new", { method: "POST", headers: requestHeaders() }),
          "Secure Solidity project initialized",
        )
        await run(
          "compile",
          () => api("/plasma/compile", { method: "POST", headers: requestHeaders() }),
          "Solidity build completed",
        )
        return
      }
      await refresh()
    })()
  })

  return (
    <div class="m-2 min-h-0 flex-1 overflow-y-auto rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]">
      <main class="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-6 py-8">
        <header class="flex flex-col gap-4 border-b border-border-weak-base pb-6 md:flex-row md:items-center md:justify-between">
          <div class="flex items-center gap-4">
            <PlasmaMark class="size-12 text-text-strong" />
            <div>
              <div class="text-20-medium text-text-strong">Plasma Security Workspace</div>
              <div class="text-13-regular text-text-weak">Create, compile, audit, gate, and deploy Solidity.</div>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button variant="ghost" icon="prompt" onClick={() => navigate(`/${params.dir}/session`)}>
              CYPHES
            </Button>
            <Button variant="ghost" icon="reset" disabled={Boolean(busy())} onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>
        </header>

        <Show when={error()}>
          {(message) => (
            <div class="rounded-md border border-border-critical bg-critical/10 px-4 py-3 text-13-regular text-text-critical">
              {message()}
            </div>
          )}
        </Show>

        <section class="grid gap-6 lg:grid-cols-2">
          <article class="rounded-lg border border-border-weak-base bg-surface-base p-5">
            <div class="mb-4 flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <Icon name="code" />
                <h2 class="text-16-medium text-text-strong">Compile</h2>
              </div>
              <Button
                disabled={Boolean(busy())}
                onClick={() =>
                  void run(
                    "compile",
                    () => api("/plasma/compile", { method: "POST", headers: requestHeaders() }),
                    "Solidity build completed",
                  )
                }
              >
                {busy() === "compile" ? "Compiling..." : "Compile"}
              </Button>
            </div>
            <div class="grid grid-cols-2 gap-3 text-12-regular">
              <div class="rounded-md bg-surface-raised-base p-3">
                <div class="text-text-weak">State</div>
                <div class="mt-1 text-text-strong">
                  {build() ? (build()?.success ? "Passed" : "Failed") : "Not run"}
                </div>
              </div>
              <div class="rounded-md bg-surface-raised-base p-3">
                <div class="text-text-weak">Compiler</div>
                <div class="mt-1 text-text-strong">{build()?.compilerVersion ?? "0.8.26 configured"}</div>
              </div>
            </div>
            <label class="mt-4 flex flex-col gap-1 text-12-regular text-text-weak">
              Selected contract
              <select
                class="h-9 rounded-md border border-border-weak-base bg-surface-panel px-3 text-text-strong outline-none"
                value={selected()}
                onChange={(event) => setSelectedContract(event.currentTarget.value)}
              >
                <For each={artifacts()}>{(artifact) => <option value={artifact.id}>{artifact.id}</option>}</For>
              </select>
            </label>
            <Show when={build()?.fingerprint}>
              {(fingerprint) => (
                <div class="mt-3 break-all font-mono text-[11px] text-text-weak">Fingerprint: {fingerprint()}</div>
              )}
            </Show>
            <div class="mt-4 flex flex-col gap-2">
              <For each={build()?.diagnostics ?? []}>
                {(diagnostic) => (
                  <div class="rounded-md border border-border-weak-base px-3 py-2 text-12-regular">
                    <div class={diagnostic.severity === "error" ? "text-text-critical" : "text-text-warning"}>
                      {diagnostic.severity.toUpperCase()}
                      {diagnostic.file ? ` · ${diagnostic.file}:${diagnostic.line ?? 1}:${diagnostic.column ?? 1}` : ""}
                    </div>
                    <div class="mt-1 text-text-base">{diagnostic.message}</div>
                  </div>
                )}
              </For>
              <Show when={build()?.success && (build()?.diagnostics.length ?? 0) === 0}>
                <div class="text-12-regular text-text-success">ABI and creation/deployed bytecode are available.</div>
              </Show>
            </div>
          </article>

          <article class="rounded-lg border border-border-weak-base bg-surface-base p-5">
            <div class="mb-4 flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <Icon name="shield" />
                <h2 class="text-16-medium text-text-strong">Audit</h2>
              </div>
              <Button
                disabled={Boolean(busy()) || !build()?.success}
                onClick={() =>
                  void run(
                    "audit",
                    () => api("/plasma/audit", { method: "POST", headers: requestHeaders() }),
                    "Reentrancy audit completed",
                  )
                }
              >
                {busy() === "audit" ? "Auditing..." : "Audit Reentrancy"}
              </Button>
            </div>
            <Show
              when={audit()}
              fallback={<div class="text-13-regular text-text-weak">No audit exists for this workspace.</div>}
            >
              {(record) => (
                <>
                  <div class="mb-3 text-12-regular text-text-weak">
                    {record().provider}/{record().model} · {new Date(record().timestamp).toLocaleString()}
                  </div>
                  <div class="flex max-h-[430px] flex-col gap-3 overflow-y-auto">
                    <For
                      each={findings()}
                      fallback={<div class="text-13-regular text-text-success">No reentrancy findings reported.</div>}
                    >
                      {(finding, index) => (
                        <div class="rounded-md border border-border-weak-base p-3">
                          <div class="flex items-start justify-between gap-3">
                            <button type="button" class="min-w-0 text-left" onClick={() => openFinding(finding)}>
                              <span
                                class={`mr-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${severityClass(finding.severity)}`}
                              >
                                {finding.severity}
                              </span>
                              <span class="text-13-medium text-text-strong">{finding.title}</span>
                              <div class="mt-1 font-mono text-[11px] text-text-weak">
                                {finding.file}:{finding.line}
                              </div>
                            </button>
                            <Button size="small" variant="ghost" onClick={() => requestFix(index())}>
                              Propose fix
                            </Button>
                          </div>
                          <p class="mt-2 text-12-regular text-text-base">{finding.description}</p>
                          <div class="mt-2 text-12-regular text-text-weak">Fix: {finding.fix}</div>
                        </div>
                      )}
                    </For>
                  </div>
                </>
              )}
            </Show>
          </article>

          <article class="rounded-lg border border-border-weak-base bg-surface-base p-5">
            <div class="mb-4 flex items-center gap-2">
              <Icon name="status" />
              <h2 class="text-16-medium text-text-strong">Gate</h2>
            </div>
            <div class="flex flex-col gap-3">
              <For
                each={
                  [
                    ["Local Anvil", status()?.gate.local ?? EMPTY_GATE],
                    ["Sepolia", status()?.gate.sepolia ?? EMPTY_GATE],
                  ] as const
                }
              >
                {([label, gate]) => (
                  <div class="rounded-md border border-border-weak-base p-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="text-13-medium text-text-strong">{label}</span>
                      <span class={`rounded border px-2 py-1 text-[11px] font-medium ${badgeClass(gate.state)}`}>
                        {gate.state}
                      </span>
                    </div>
                    <div class="mt-2 text-12-regular text-text-weak">{gate.reason}</div>
                  </div>
                )}
              </For>
            </div>
            <div class="mt-4 text-12-regular text-text-weak">
              Deployment is enforced against the current fingerprint and selected bytecode inside the deploy function.
            </div>
          </article>

          <article class="rounded-lg border border-border-weak-base bg-surface-base p-5">
            <div class="mb-4 flex items-center gap-2">
              <Icon name="cloud-upload" />
              <h2 class="text-16-medium text-text-strong">Deploy</h2>
            </div>
            <label class="flex flex-col gap-1 text-12-regular text-text-weak">
              Constructor arguments (JSON array)
              <input
                class="h-9 rounded-md border border-border-weak-base bg-surface-panel px-3 font-mono text-text-strong outline-none"
                value={constructorArgs()}
                onInput={(event) => setConstructorArgs(event.currentTarget.value)}
              />
            </label>
            <div class="mt-4 grid grid-cols-2 gap-2">
              <Button
                disabled={Boolean(busy()) || !status()?.gate.local.allowed}
                onClick={() =>
                  void run(
                    "deploy-local",
                    () =>
                      api("/plasma/deploy/local", {
                        method: "POST",
                        body: JSON.stringify({ contract: selected(), args: args() }),
                      }),
                    "Contract deployed to Anvil",
                  )
                }
              >
                Deploy Local
              </Button>
              <Button
                disabled={Boolean(busy()) || !status()?.gate.sepolia.allowed}
                onClick={() => void deploySepolia()}
              >
                Deploy Sepolia
              </Button>
            </div>
            <div class="mt-2 text-11-regular text-text-weak">
              Mainnet is disabled. Sepolia uses an injected wallet when available, otherwise Plasma prepares an external
              signing request.
            </div>
            <Show when={signingRequest()?.signingRequest && !window.ethereum}>
              {(request) => (
                <div class="mt-3 rounded-md border border-border-warning bg-warning/10 p-3">
                  <div class="text-12-medium text-text-warning">External wallet signing required</div>
                  <pre class="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] text-text-base">
                    {JSON.stringify(request(), null, 2)}
                  </pre>
                </div>
              )}
            </Show>
            <div class="mt-5">
              <div class="mb-2 text-12-medium text-text-strong">Current session history</div>
              <div class="flex max-h-48 flex-col gap-2 overflow-y-auto">
                <For
                  each={[...walletDeployments(), ...(status()?.deployments ?? [])]}
                  fallback={<div class="text-12-regular text-text-weak">No deployments yet.</div>}
                >
                  {(deployment) => (
                    <div class="rounded-md bg-surface-raised-base p-3 text-11-regular">
                      <div class="flex items-center justify-between text-text-strong">
                        <span>{deployment.network.toUpperCase()}</span>
                        <span>{deployment.contract}</span>
                      </div>
                      <Show when={deployment.address}>
                        <div class="mt-1 break-all font-mono text-text-weak">Address: {deployment.address}</div>
                      </Show>
                      <Show when={deployment.transactionHash}>
                        <div class="mt-1 break-all font-mono text-text-weak">
                          Transaction:{" "}
                          <Show when={deployment.explorerUrl} fallback={<span>{deployment.transactionHash}</span>}>
                            {(url) => (
                              <button class="underline" type="button" onClick={() => platform.openLink(url())}>
                                {deployment.transactionHash}
                              </button>
                            )}
                          </Show>
                        </div>
                      </Show>
                      <Show when={deployment.gasUsed}>
                        <div class="mt-1 text-text-weak">Gas used: {deployment.gasUsed}</div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}
