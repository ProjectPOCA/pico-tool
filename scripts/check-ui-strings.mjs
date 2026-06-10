/**
 * CI guard: consumer-facing renderer code may identify panels only by Panel
 * ID, size class, resolution, colors, and refresh time. Internal vocabulary
 * from the driver work must never reach the UI.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'src/renderer')

const BLOCKLIST =
  /vusion|power[\s_-]?rail|coin[\s_-]?cell|freezer|harvest|walmart|shelf[\s_-]?label|q[_-]series|backend_|2in1|1in52|4in2|7in4/i

const violations = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      walk(path)
      continue
    }
    if (!/\.(tsx?|html|css)$/.test(name)) continue
    const lines = readFileSync(path, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const m = line.match(BLOCKLIST)
      if (m) {
        violations.push(`${relative(root, path)}:${i + 1}  …${m[0]}…`)
      }
    })
  }
}

walk(target)

if (violations.length > 0) {
  console.error('Internal vocabulary found in renderer sources:\n')
  for (const v of violations) console.error('  ' + v)
  process.exit(1)
}
console.log('ui-strings: clean')
