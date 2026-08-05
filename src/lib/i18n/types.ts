import type { id } from './id'

/**
 * The shape of a complete translation, derived from the Indonesian source rather
 * than declared by hand — so the dictionary can never drift from its own type.
 *
 * A new language declares `satisfies Dictionary` and the compiler enumerates every
 * missing or misspelled key. Never widen this to `Record<string, string>`: that
 * compiles everything and catches nothing.
 */
export type Dictionary = typeof id
