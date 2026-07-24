import { Fzf, extendedMatch, type FzfResultItem } from 'fzf';

/**
 * fzf-style fuzzy matching, shared by the terminal find bar and (later) the
 * project file opener. Build a finder once over a list, then query it on each
 * keystroke — results are ranked best-first and carry `positions` (matched
 * char indices) for highlighting.
 *
 * ponytail: thin wrapper over `fzf` so callers have one import and we can swap
 * the engine later without touching them.
 */
export type FuzzyResult<T> = FzfResultItem<T>;

// fzf's constructor overload uses a conditional options tuple (`U extends
// string ? … : …`) that a generic T can't satisfy at the type level. Retype it
// to a plain object-options signature — same runtime, usable with any T.
const FzfCtor = Fzf as unknown as {
  new <T>(
    list: readonly T[],
    options: { selector: (item: T) => string; match: typeof extendedMatch },
  ): {
    find(query: string): FzfResultItem<T>[];
  };
};

export function fuzzyFinder<T>(
  items: readonly T[],
  selector: (item: T) => string,
): (query: string) => FuzzyResult<T>[] {
  // extendedMatch = fzf's CLI default: space-separated terms are AND'd and
  // order-independent, so "fuzzy render" matches "render/.../fuzzy".
  const fzf = new FzfCtor(items, { selector, match: extendedMatch });
  return (query: string) => (query ? fzf.find(query) : []);
}
