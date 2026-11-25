import { describe, expect, it } from "vitest";
import { filterCategoriesByGuidance } from "@/features/setting/services/category-guidance";
import type { Category } from "@/features/setting/types";

const categories: Category[] = [
  { id: 1, name: "تعلیق و فرمان", description: "سیبک، طبق، میل موج‌گیر", created_at: "2026-01-01", updated_at: "2026-01-01" },
  { id: 2, name: "روغن و روانکار", description: "روغن موتور", created_at: "2026-01-01", updated_at: "2026-01-01" },
];

describe("category guidance search", () => {
  it("finds approved guidance examples without creating or classifying data", () => {
    expect(filterCategoriesByGuidance(categories, "سیبک")).toEqual([categories[0]]);
    expect(filterCategoriesByGuidance(categories, "سيبك")).toEqual([categories[0]]);
    expect(categories).toHaveLength(2);
  });
});
