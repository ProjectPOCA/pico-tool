import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { payloadsRoot } from './manifest'

/** Renders the MicroPython viewer/bootstrap templates ({{VAR}} placeholders). */
export function renderTemplate(name: string, vars: Record<string, string>): string {
  const tpl = readFileSync(join(payloadsRoot(), 'viewers', `${name}.py.tpl`), 'utf8')
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`template ${name}: missing variable ${key}`)
    return vars[key]
  })
}
