type Pairable = { id: string; pairsWith: string[] };

/** Food links both ways: what each food is only eaten with (`needs`), and which foods need it (`neededBy`). */
export function pairLinks<F extends Pairable>(foods: F[]) {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const needs = new Map<string, F[]>();
  const neededBy = new Map<string, F[]>();
  for (const f of foods) {
    const partners = f.pairsWith.flatMap((id) => byId.get(id) ?? []);
    needs.set(f.id, partners);
    for (const p of partners) neededBy.set(p.id, [...(neededBy.get(p.id) ?? []), f]);
  }
  return { needs: (id: string) => needs.get(id) ?? [], neededBy: (id: string) => neededBy.get(id) ?? [] };
}
