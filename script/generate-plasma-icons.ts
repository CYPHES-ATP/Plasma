import { execFile } from "node:child_process"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import sharp from "sharp"

const execFileAsync = promisify(execFile)
const root = path.resolve(import.meta.dir, "..")
const canonical = path.join(root, "packages/ui/src/assets/brand/plasma-icon.png")
const supplied = process.argv[2] ? path.resolve(process.argv[2]) : undefined

async function ensureCanonical() {
  await mkdir(path.dirname(canonical), { recursive: true })
  if (!supplied) return

  const metadata = await sharp(supplied).metadata()
  if (!metadata.width || !metadata.height) throw new Error(`Unable to read icon dimensions: ${supplied}`)

  const side = Math.min(metadata.width, metadata.height)
  const left = Math.floor((metadata.width - side) / 2)
  const top = Math.floor((metadata.height - side) / 2)

  await sharp(supplied)
    .extract({ left, top, width: side, height: side })
    .resize(1024, 1024, { fit: "cover", kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile(canonical)
}

async function png(output: string, size: number) {
  await mkdir(path.dirname(output), { recursive: true })
  await sharp(canonical)
    .resize(size, size, { fit: "cover", kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: size <= 64 ? 0.7 : 0.35 })
    .png({ compressionLevel: 9 })
    .toFile(output)
}

async function ico(output: string, size: number) {
  const temp = `${output}.png`
  await png(temp, size)
  await execFileAsync("sips", ["-s", "format", "ico", temp, "--out", output])
  await rm(temp)
}

async function icns(output: string) {
  const temp = await mkdtemp(path.join(tmpdir(), "plasma-iconset-"))
  const iconset = path.join(temp, "Plasma.iconset")
  await mkdir(iconset)

  const sizes = [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024],
  ] as const

  for (const [name, size] of sizes) await png(path.join(iconset, name), size)
  await execFileAsync("iconutil", ["-c", "icns", iconset, "-o", output])
  await rm(temp, { recursive: true, force: true })
}

async function svgFavicon(output: string) {
  const data = await sharp(canonical).resize(128, 128).png({ compressionLevel: 9 }).toBuffer()
  const encoded = data.toString("base64")
  await writeFile(
    output,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><image width="128" height="128" href="data:image/png;base64,${encoded}"/></svg>\n`,
  )
}

async function socialCard(output: string) {
  const width = 1200
  const height = 630
  const icon = await sharp(canonical).resize(430, 430).png().toBuffer()
  const background = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <radialGradient id="glow" cx="28%" cy="50%" r="65%">
          <stop offset="0" stop-color="#182a69"/>
          <stop offset="0.48" stop-color="#09091c"/>
          <stop offset="1" stop-color="#030307"/>
        </radialGradient>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
          <stop stop-color="#67d8ff"/>
          <stop offset="1" stop-color="#ff57bd"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#glow)"/>
      <rect x="548" y="164" width="92" height="5" rx="2.5" fill="url(#accent)"/>
      <text x="548" y="280" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="700" letter-spacing="8">PLASMA</text>
      <text x="552" y="350" fill="#9caee8" font-family="Arial, Helvetica, sans-serif" font-size="30">AI-Powered Solidity</text>
      <text x="552" y="410" fill="#d6d9eb" font-family="Arial, Helvetica, sans-serif" font-size="24">Compile &#183; Audit &#183; Gate &#183; Deploy</text>
    </svg>
  `)

  await sharp(background)
    .composite([{ input: icon, left: 60, top: 100 }])
    .png({ compressionLevel: 9 })
    .toFile(output)
}

async function generateDesktopIcons() {
  const entries = [
    ["32x32.png", 32],
    ["64x64.png", 64],
    ["128x128.png", 128],
    ["128x128@2x.png", 256],
    ["dock.png", 256],
    ["icon.png", 512],
    ["Square30x30Logo.png", 30],
    ["Square44x44Logo.png", 44],
    ["StoreLogo.png", 50],
    ["Square71x71Logo.png", 71],
    ["Square89x89Logo.png", 89],
    ["Square107x107Logo.png", 107],
    ["Square142x142Logo.png", 142],
    ["Square150x150Logo.png", 150],
    ["Square284x284Logo.png", 284],
    ["Square310x310Logo.png", 310],
    ["android/mipmap-mdpi/ic_launcher.png", 48],
    ["android/mipmap-mdpi/ic_launcher_round.png", 48],
    ["android/mipmap-mdpi/ic_launcher_foreground.png", 108],
    ["android/mipmap-hdpi/ic_launcher.png", 72],
    ["android/mipmap-hdpi/ic_launcher_round.png", 72],
    ["android/mipmap-hdpi/ic_launcher_foreground.png", 162],
    ["android/mipmap-xhdpi/ic_launcher.png", 96],
    ["android/mipmap-xhdpi/ic_launcher_round.png", 96],
    ["android/mipmap-xhdpi/ic_launcher_foreground.png", 216],
    ["android/mipmap-xxhdpi/ic_launcher.png", 144],
    ["android/mipmap-xxhdpi/ic_launcher_round.png", 144],
    ["android/mipmap-xxhdpi/ic_launcher_foreground.png", 324],
    ["android/mipmap-xxxhdpi/ic_launcher.png", 192],
    ["android/mipmap-xxxhdpi/ic_launcher_round.png", 192],
    ["android/mipmap-xxxhdpi/ic_launcher_foreground.png", 432],
    ["ios/AppIcon-20x20@1x.png", 20],
    ["ios/AppIcon-20x20@2x-1.png", 40],
    ["ios/AppIcon-20x20@2x.png", 40],
    ["ios/AppIcon-20x20@3x.png", 60],
    ["ios/AppIcon-29x29@1x.png", 29],
    ["ios/AppIcon-29x29@2x-1.png", 58],
    ["ios/AppIcon-29x29@2x.png", 58],
    ["ios/AppIcon-29x29@3x.png", 87],
    ["ios/AppIcon-40x40@1x.png", 40],
    ["ios/AppIcon-40x40@2x-1.png", 80],
    ["ios/AppIcon-40x40@2x.png", 80],
    ["ios/AppIcon-40x40@3x.png", 120],
    ["ios/AppIcon-60x60@2x.png", 120],
    ["ios/AppIcon-60x60@3x.png", 180],
    ["ios/AppIcon-76x76@1x.png", 76],
    ["ios/AppIcon-76x76@2x.png", 152],
    ["ios/AppIcon-83.5x83.5@2x.png", 167],
    ["ios/AppIcon-512@2x.png", 1024],
  ] as const

  for (const channel of ["dev", "beta", "prod"]) {
    const directory = path.join(root, `packages/desktop/icons/${channel}`)
    for (const [name, size] of entries) await png(path.join(directory, name), size)
    await ico(path.join(directory, "icon.ico"), 256)
    await icns(path.join(directory, "icon.icns"))
    await writeFile(
      path.join(directory, "android/values/ic_launcher_background.xml"),
      '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_background">#030307</color>\n</resources>\n',
    )
  }

  await rm(path.join(root, "packages/desktop/icons/plasma.svg"), { force: true })
  await png(path.join(root, "packages/console/app/src/asset/lander/desktop-app-icon.png"), 84)
  await png(path.join(root, "packages/console/app/src/asset/lander/opencode-desktop-icon.png"), 240)
}

async function generateSharedIcons() {
  const favicon = path.join(root, "packages/ui/src/assets/favicon")
  for (const name of ["apple-touch-icon.png", "apple-touch-icon-v3.png"]) await png(path.join(favicon, name), 180)
  for (const name of ["favicon-96x96.png", "favicon-96x96-v3.png"]) await png(path.join(favicon, name), 96)
  await png(path.join(favicon, "web-app-manifest-192x192.png"), 192)
  await png(path.join(favicon, "web-app-manifest-512x512.png"), 512)
  for (const name of ["favicon.ico", "favicon-v3.ico"]) await ico(path.join(favicon, name), 64)
  for (const name of ["favicon.svg", "favicon-v3.svg"]) await svgFavicon(path.join(favicon, name))
  for (const name of ["favicon.svg", "favicon-v3.svg"]) {
    await svgFavicon(path.join(root, "packages/docs", name))
  }
  await png(path.join(root, "packages/app/public/plasma-icon.png"), 512)

  await writeFile(
    path.join(favicon, "site.webmanifest"),
    `${JSON.stringify(
      {
        name: "Plasma",
        short_name: "Plasma",
        icons: [
          {
            src: "/web-app-manifest-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/web-app-manifest-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        theme_color: "#030307",
        background_color: "#030307",
        display: "standalone",
      },
      null,
      2,
    )}\n`,
  )

  const images = path.join(root, "packages/ui/src/assets/images")
  for (const name of ["social-share.png", "social-share-black.png", "social-share-zen.png"]) {
    await socialCard(path.join(images, name))
  }
}

await ensureCanonical()
if (!(await Bun.file(canonical).exists())) {
  throw new Error(`Canonical icon is missing. Run: bun generate:icons /path/to/source.png`)
}

await generateDesktopIcons()
await generateSharedIcons()

console.log(`Generated Plasma icon assets from ${supplied ?? canonical}`)
