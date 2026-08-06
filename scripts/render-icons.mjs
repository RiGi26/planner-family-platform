#!/usr/bin/env node
/**
 * Rasterises the two icon SVGs into the PNGs the install prompt requires.
 *
 * Chrome will not offer "Add to home screen" without a raster icon of at least
 * 192px, and iOS ignores the manifest entirely in favour of apple-touch-icon —
 * so an SVG-only manifest means the app can be used in a browser and never
 * installed, which is most of the point of building a PWA.
 *
 * Run by hand, and the output is committed. NOT part of `prebuild`, and that is
 * the whole reason this file exists rather than a build step: `sharp` is present
 * only because Next.js happens to depend on it, so a Next upgrade that dropped
 * it would break every deploy over an image that changes about once a year.
 * Icons are third-party-shaped assets, not derived data.
 *
 * Run: npm run icons
 * Output: public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const PUBLIC = join(ROOT, 'public')

const SOURCES = {
  normal: join(ROOT, 'src', 'app', 'icon.svg'),
  maskable: join(PUBLIC, 'icon-maskable.svg'),
}

const OUTPUTS = [
  { from: 'normal', size: 192, name: 'icon-192.png' },
  { from: 'normal', size: 512, name: 'icon-512.png' },
  { from: 'maskable', size: 512, name: 'icon-maskable-512.png' },
  // iOS never reads the manifest; this exact filename is what it looks for, and
  // it is composited on an opaque background because iOS does not round-trip
  // transparency the way Android does.
  { from: 'normal', size: 180, name: 'apple-touch-icon.png' },
]

for (const [key, path] of Object.entries(SOURCES)) {
  if (!existsSync(path)) {
    console.error(`sumber ${key} tidak ada: ${path}`)
    process.exit(1)
  }
}

const svgs = Object.fromEntries(
  Object.entries(SOURCES).map(([key, path]) => [key, readFileSync(path)]),
)

for (const { from, size, name } of OUTPUTS) {
  const png = await sharp(svgs[from], { density: 384 })
    .resize(size, size, { fit: 'contain', background: '#E7E1D8' })
    .flatten({ background: '#E7E1D8' })
    .png({ compressionLevel: 9 })
    .toBuffer()

  writeFileSync(join(PUBLIC, name), png)
  console.log(`  ${name.padEnd(26)} ${size}×${size}  ${(png.length / 1024).toFixed(1)} KB`)
}

console.log(`\nditulis  : ${PUBLIC}`)
console.log('catatan  : berkas ini di-commit; jangan pasang ke prebuild.')
