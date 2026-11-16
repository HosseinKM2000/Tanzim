import { render, screen } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/features/setting/api/taxonomy.api", () => ({
  getReferenceSectors: async () => [],
  getTaxonomyState: async () => ({ taxonomy_version: null, taxonomy_policy_version: 0, sector_code: null, adopted_at: null, has_historical_inventory_usage: false, adoption_enabled: true }),
  adoptTaxonomy: vi.fn(),
}));

import IndustryForm from "@/features/setting/components/industry/industry-form";

describe("IndustryForm presentation", () => {
  const renderForm = (mode?: "onboarding" | "settings") => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><Theme><IndustryForm mode={mode} /></Theme></QueryClientProvider>);
  };

  it("requires sector selection during new-store onboarding", () => {
    renderForm();

    expect(screen.getByRole("heading", { name: "حوزه کاری مجموعه" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "فعلاً رد کردن" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ذخیره و ادامه" })).toBeVisible();
  });

  it("uses a save-only presentation in settings", () => {
    const { container } = renderForm("settings");

    expect(screen.getByRole("heading", { name: "تغییر حوزه کاری" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "فعلاً رد کردن" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ذخیره تغییرات" })).toBeVisible();
    expect(container.querySelector(".industry-selector-shell")).toHaveAttribute("data-mode", "settings");
    expect(container.querySelector(".industry-selector-form")).toHaveClass("w-full");
  });
});
