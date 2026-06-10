# Plasma Icon Assets

All desktop, web, PWA, documentation, and social icon assets are generated from:

```text
packages/ui/src/assets/brand/plasma-icon.png
```

To replace the icon from a new source image:

```bash
bun generate:icons /absolute/path/to/source.png
```

The generator center-crops the source to a square, writes the canonical
1024-by-1024 image, and regenerates:

- macOS `.icns` and Dock assets
- Windows `.ico`, installer, and tile assets
- Linux and mobile PNG sizes
- browser favicons and PWA manifest icons
- documentation favicons
- Plasma social preview cards
- desktop marketing thumbnails

Run the desktop and web builds after regeneration to refresh ignored build
outputs. The `.icns` and `.ico` steps currently require macOS tools (`iconutil`
and `sips`). Do not edit generated icon variants individually.
