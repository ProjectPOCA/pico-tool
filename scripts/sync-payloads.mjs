/**
 * Vendor driver payloads from the driver-research working tree into this repo.
 *
 * Maintainer-only: requires a local checkout of the (private) driver repo.
 * Copied files are committed here so app builds are fully self-contained.
 * Filenames are preserved exactly — on-device imports depend on them.
 *
 * Usage: node scripts/sync-payloads.mjs [--source /path/to/driver-repo]
 */
import { copyFileSync, mkdirSync, readdirSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const srcIdx = args.indexOf('--source')
const SOURCE = srcIdx >= 0 ? resolve(args[srcIdx + 1]) : '/Users/carson/github-badge'
const DEST = join(root, 'resources/payloads')

if (!existsSync(SOURCE)) {
  console.error(`source repo not found: ${SOURCE}`)
  process.exit(1)
}

const COPY_MAP = [
  // 1.5" class (200x200)
  ...[
    'vusion_1in52_main.py',
    'vusion_1in52_runtime.py',
    'vusion_1in52_backend_bwr.py',
    'vusion_1in52_backend_q_series.py'
  ].map((f) => [`tools/${f}`, `panels/1in52/modules/${f}`]),
  ...['black', 'red', 'yellow'].map((c) => [
    `images/pac/teo_blood_moon_1in5_${c}.bin`,
    `panels/1in52/assets/teo_blood_moon_1in5_${c}.bin`
  ]),
  // 2.1" class (248x128)
  ...[
    'vusion_2in1_main.py',
    'vusion_2in1_runtime.py',
    'vusion_2in1_runtime_portrait.py',
    'vusion_2in1_backend_power_rail.py',
    'vusion_2in1_backend_ssd.py',
    'vusion_2in1_backend_q_series.py'
  ].map((f) => [`tools/${f}`, `panels/2in1/modules/${f}`]),
  // 4.2" class (400x300)
  ...['vusion_4in2_poca_main.py', 'vusion_4in2_q_series_main.py'].map((f) => [
    `tools/${f}`,
    `panels/4in2/modules/${f}`
  ]),
  ...['black', 'red'].map((c) => [
    `images/pac/teo_blood_moon_4in2_${c}.bin`,
    `panels/4in2/assets/teo_blood_moon_4in2_${c}.bin`
  ])
]

// Science Gothic glyph BMPs (whole directories)
const GLYPH_DIRS = [
  ['images/fonts/science_gothic/bmp/2.1', 'shared/fonts/science_gothic/2.1'],
  ['images/fonts/science_gothic/bmp/4.2', 'shared/fonts/science_gothic/4.2']
]

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12)

let copied = 0
for (const [from, to] of COPY_MAP) {
  const src = join(SOURCE, from)
  const dst = join(DEST, to)
  if (!existsSync(src)) {
    console.error(`MISSING in source: ${from}`)
    process.exitCode = 1
    continue
  }
  mkdirSync(dirname(dst), { recursive: true })
  const changed = !existsSync(dst) || sha(src) !== sha(dst)
  copyFileSync(src, dst)
  console.log(`${changed ? 'updated' : 'same   '} ${to} (${sha(dst)})`)
  copied++
}

for (const [fromDir, toDir] of GLYPH_DIRS) {
  const srcDir = join(SOURCE, fromDir)
  if (!existsSync(srcDir)) {
    console.error(`MISSING in source: ${fromDir}`)
    process.exitCode = 1
    continue
  }
  mkdirSync(join(DEST, toDir), { recursive: true })
  for (const f of readdirSync(srcDir).filter((f) => f.endsWith('.bmp'))) {
    const src = join(srcDir, f)
    const dst = join(DEST, toDir, basename(f))
    const changed = !existsSync(dst) || sha(src) !== sha(dst)
    copyFileSync(src, dst)
    console.log(`${changed ? 'updated' : 'same   '} ${toDir}/${f} (${sha(dst)})`)
    copied++
  }
}

console.log(`\n${copied} files synced from ${SOURCE}`)
