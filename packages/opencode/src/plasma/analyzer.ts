import type { Finding } from "./schema"

type FunctionBlock = {
  name: string
  signature: string
  startLine: number
  lines: string[]
}

const EXTERNAL_CALL = /\.(?:call|delegatecall|staticcall)(?:\s*\{|\s*\()|\.send\s*\(|\.transfer\s*\(/
const STATE_UPDATE =
  /\b(?:balances?|shares?|credits?|deposits?|withdrawals?|claims?)\s*\[[^\]]+\]\s*(?:[-+*/]?=|\+\+|--)/

function functions(source: string): FunctionBlock[] {
  const lines = source.split(/\r?\n/)
  const out: FunctionBlock[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const match = /\bfunction\s+([A-Za-z_]\w*)\s*\([^)]*\)[^{;]*\{/.exec(line)
    if (!match) continue
    let depth = 0
    const body: string[] = []
    for (let cursor = index; cursor < lines.length; cursor++) {
      const current = lines[cursor]
      body.push(current)
      depth += (current.match(/\{/g) ?? []).length
      depth -= (current.match(/\}/g) ?? []).length
      if (depth !== 0) continue
      out.push({
        name: match[1],
        signature: line,
        startLine: index + 1,
        lines: body,
      })
      index = cursor
      break
    }
  }
  return out
}

function mappingNames(source: string) {
  return [...source.matchAll(/\bmapping\s*\([^;]+?\)\s+(?:public\s+|private\s+|internal\s+)?([A-Za-z_]\w*)\s*;/g)].map(
    (match) => match[1],
  )
}

export function analyzeReentrancy(file: string, source: string): Finding[] {
  const out: Finding[] = []
  const blocks = functions(source)
  const mappings = mappingNames(source)
  for (const fn of blocks) {
    if (!/\b(?:public|external)\b/.test(fn.signature)) continue
    const callIndex = fn.lines.findIndex((line) => EXTERNAL_CALL.test(line))
    if (callIndex === -1) continue
    const updateIndex = fn.lines.findIndex((line, index) => index > callIndex && STATE_UPDATE.test(line))
    const guarded = /\bnonReentrant\b/.test(fn.signature)
    if (updateIndex !== -1) {
      out.push({
        severity: "high",
        title: `External call before state update in ${fn.name}()`,
        file,
        line: fn.startLine + callIndex,
        description:
          "The function transfers control to an external address before updating accounting state. A callback can re-enter while the old balance is still valid.",
        exploitPath: [
          "Attacker acquires a withdrawable balance",
          `Attacker calls ${fn.name}()`,
          "Fallback re-enters before the balance update",
          "The same balance is withdrawn more than once",
        ],
        fix: "Apply checks-effects-interactions: update state before the external call and add an effective nonReentrant guard.",
      })
    }
    if (!guarded) {
      out.push({
        severity: "high",
        title: `Missing reentrancy protection on ${fn.name}()`,
        file,
        line: fn.startLine,
        description:
          "This externally callable function performs an external call without an explicit nonReentrant guard. The guard must cover every entry point into the vulnerable state transition.",
        exploitPath: [
          `Attacker enters ${fn.name}()`,
          "The contract performs an external call",
          "The callback reaches an unguarded entry point",
        ],
        fix: "Add a proven reentrancy guard and keep the state update before the external interaction.",
      })
    }

    const touched = mappings.filter((name) => fn.lines.some((line) => line.includes(name)))
    const sibling = blocks.find(
      (candidate) =>
        candidate !== fn &&
        /\b(?:public|external)\b/.test(candidate.signature) &&
        touched.some((name) => candidate.lines.some((line) => line.includes(name))),
    )
    if (!sibling) continue
    if (guarded && /\bnonReentrant\b/.test(sibling.signature)) continue
    out.push({
      severity: "high",
      title: `Cross-function reentrancy between ${fn.name}() and ${sibling.name}()`,
      file,
      line: fn.startLine + callIndex,
      description:
        "An external callback can reach another public function that observes or mutates the same accounting state before the first function completes.",
      exploitPath: [
        `Attacker calls ${fn.name}()`,
        "External control transfer invokes the attacker",
        `Attacker re-enters through ${sibling.name}()`,
        "Shared state is observed in an intermediate state",
      ],
      fix: "Use a contract-wide reentrancy guard for all shared-state entry points and complete state effects before interactions.",
    })
  }
  return out
}
