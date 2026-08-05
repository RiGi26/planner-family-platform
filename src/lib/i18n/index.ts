import { id } from './id'
import type { Dictionary } from './types'

/**
 * The i18n surface the rest of the app sees. Two consumers, two exports:
 *
 * - `t` for module scope — error tables, manifest, metadata — where no React
 *   context exists.
 * - `useT()` for components. It returns the same object today, but every component
 *   written against the hook is a component that never needs touching when a
 *   locale switch lands: at that point only THIS file changes (the hook starts
 *   reading a locale from context/storage and picking the matching dictionary).
 */
export const t: Dictionary = id

export function useT(): Dictionary {
  return id
}

/** `fmt('Sisa {n} kartu', { n: 3 })` → `'Sisa 3 kartu'`. */
export function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  )
}

export type { Dictionary }
