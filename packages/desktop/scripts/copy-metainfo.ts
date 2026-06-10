import { resolveChannel } from "./utils"
import { rm } from "node:fs/promises"

const arg = process.argv[2]
const channel = arg === "dev" || arg === "beta" || arg === "prod" ? arg : resolveChannel()

const appId = channel === "prod" ? "ai.cyphes.plasma" : `ai.cyphes.plasma.${channel}`
const productName = channel === "prod" ? "Plasma" : `Plasma ${channel.charAt(0).toUpperCase() + channel.slice(1)}`
const summary = `Security-first Solidity IDE${channel !== "prod" ? ` (${channel})` : ""}`
const legacyAppId = channel === "prod" ? "ai.opencode.desktop" : `ai.opencode.desktop.${channel}`

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${appId}</id>

  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>

  <name>${productName}</name>
  <summary>${summary}</summary>

  <developer id="ai.cyphes">
    <name>CYPHES</name>
  </developer>

  <description>
    <p>
      Plasma is a security-first IDE for compiling, auditing, gating, and deploying Solidity contracts.
    </p>
  </description>

  <launchable type="desktop-id">${appId}.desktop</launchable>

  <content_rating type="oars-1.1" />

  <url type="bugtracker">https://github.com/CYPHES-ATP/Plasma/issues</url>
  <url type="homepage">https://github.com/CYPHES-ATP/Plasma</url>
  <url type="vcs-browser">https://github.com/CYPHES-ATP/Plasma</url>
</component>
`

await rm(`resources/${legacyAppId}.metainfo.xml`, { force: true })
await Bun.write(`resources/${appId}.metainfo.xml`, xml)
console.log(`Generated metainfo for ${channel} at resources/${appId}.metainfo.xml`)
