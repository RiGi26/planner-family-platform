type Cls = string | false | null | undefined

/** Joins class names, dropping falsy branches. Small enough not to be a dependency. */
export function clsx(...parts: Cls[]): string {
  return parts.filter(Boolean).join(' ')
}
