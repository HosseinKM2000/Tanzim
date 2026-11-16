import type { Category } from "../types";

function normalizeGuidance(value: string) {
  return value.trim().toLocaleLowerCase("fa-IR").replace(/ي/g, "ی").replace(/ك/g, "ک");
}

export function filterCategoriesByGuidance(categories: Category[], query: string) {
  const normalized = normalizeGuidance(query);
  if (!normalized) return categories;
  return categories.filter((category) =>
    normalizeGuidance(`${category.name} ${category.description ?? ""}`).includes(normalized),
  );
}
