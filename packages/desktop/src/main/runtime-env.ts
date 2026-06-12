import { join } from "node:path"

export const DESKTOP_SERVER_USERNAME = "plasma"

const DESKTOP_OWNED_ENV = [
  "OPENCODE_DB",
  "OPENCODE_PORT",
  "OPENCODE_SERVER_PASSWORD",
  "OPENCODE_SERVER_USERNAME",
  "PLASMA_SERVER_PASSWORD",
  "PLASMA_SERVER_USERNAME",
] as const

export function applyDesktopRuntimeEnv(
  target: NodeJS.ProcessEnv,
  shell: NodeJS.ProcessEnv | undefined,
  userDataPath: string,
) {
  Object.assign(target, shell)
  for (const key of DESKTOP_OWNED_ENV) delete target[key]

  Object.assign(target, {
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
    OPENCODE_CLIENT: "desktop",
    XDG_DATA_HOME: join(userDataPath, "data"),
    XDG_CONFIG_HOME: join(userDataPath, "config"),
    XDG_CACHE_HOME: join(userDataPath, "cache"),
    XDG_STATE_HOME: join(userDataPath, "state"),
  })
}
