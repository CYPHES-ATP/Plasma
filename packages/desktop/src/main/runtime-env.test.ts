import { describe, expect, test } from "bun:test"
import { join } from "node:path"

import { applyDesktopRuntimeEnv, DESKTOP_SERVER_USERNAME } from "./runtime-env"

describe("desktop runtime environment", () => {
  test("isolates desktop state and removes inherited server overrides", () => {
    const target: NodeJS.ProcessEnv = {
      OPENCODE_DB: "/tmp/shared.db",
      OPENCODE_PORT: "4096",
      OPENCODE_SERVER_USERNAME: "opencode",
      OPENCODE_SERVER_PASSWORD: "shared",
      PLASMA_SERVER_USERNAME: "other",
      PLASMA_SERVER_PASSWORD: "other",
      XDG_DATA_HOME: "/tmp/shared-data",
    }
    const userDataPath = "/tmp/plasma-desktop"

    applyDesktopRuntimeEnv(target, { PATH: "/shell/bin", OPENCODE_PORT: "5000" }, userDataPath)

    expect(target.PATH).toBe("/shell/bin")
    expect(target.OPENCODE_DB).toBeUndefined()
    expect(target.OPENCODE_PORT).toBeUndefined()
    expect(target.OPENCODE_SERVER_USERNAME).toBeUndefined()
    expect(target.OPENCODE_SERVER_PASSWORD).toBeUndefined()
    expect(target.PLASMA_SERVER_USERNAME).toBeUndefined()
    expect(target.PLASMA_SERVER_PASSWORD).toBeUndefined()
    expect(target.XDG_DATA_HOME).toBe(join(userDataPath, "data"))
    expect(target.XDG_CONFIG_HOME).toBe(join(userDataPath, "config"))
    expect(target.XDG_CACHE_HOME).toBe(join(userDataPath, "cache"))
    expect(target.XDG_STATE_HOME).toBe(join(userDataPath, "state"))
    expect(target.OPENCODE_CLIENT).toBe("desktop")
  })

  test("uses the Plasma username for desktop server authentication", () => {
    expect(DESKTOP_SERVER_USERNAME).toBe("plasma")
  })
})
