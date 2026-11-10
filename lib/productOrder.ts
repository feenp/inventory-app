/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Fetches {product_id → sort_order} map.
 * Returns {} gracefully if the sort_order column doesn't exist yet (migration not run).
 */
export async function fetchProductSortById(supabase: any): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("products")
    .select("id, sort_order")
    .is("deleted_at", null);
  if (error || !data) return {};
  const map: Record<string, number> = {};
  for (const p of data as { id: string; sort_order: number | null }[]) {
    if (p.sort_order != null) map[p.id] = p.sort_order;
  }
  return map;
}

/**
 * Fetches {product_name → sort_order} map.
 * Returns {} gracefully if the sort_order column doesn't exist yet.
 */
export async function fetchProductSortByName(supabase: any): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("products")
    .select("name, sort_order")
    .is("deleted_at", null);
  if (error || !data) return {};
  const map: Record<string, number> = {};
  for (const p of data as { name: string; sort_order: number | null }[]) {
    if (p.sort_order != null) map[p.name] = p.sort_order;
  }
  return map;
}

/** Sorts items by product_id using sortMap; falls back to name order if map is empty. */
export function sortByProductId<T>(
  items: T[],
  sortMap: Record<string, number>,
  getId: (item: T) => string,
  getName: (item: T) => string
): T[] {
  if (Object.keys(sortMap).length === 0) return items;
  return [...items].sort((a, b) => {
    const ra = sortMap[getId(a)] ?? 999999;
    const rb = sortMap[getId(b)] ?? 999999;
    return ra !== rb ? ra - rb : getName(a).localeCompare(getName(b), "th");
  });
}

/** Sorts items by product name using sortMap; falls back to current order if map is empty. */
export function sortByProductName<T>(
  items: T[],
  sortMap: Record<string, number>,
  getName: (item: T) => string
): T[] {
  if (Object.keys(sortMap).length === 0) return items;
  return [...items].sort((a, b) => {
    const ra = sortMap[getName(a)] ?? 999999;
    const rb = sortMap[getName(b)] ?? 999999;
    return ra !== rb ? ra - rb : getName(a).localeCompare(getName(b), "th");
  });
}
