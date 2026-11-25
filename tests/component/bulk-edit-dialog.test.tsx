import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { product } from "../helpers/product";
import { accessState } from "@/shared/access/access-state";
import type { User } from "@/features/auth/types";
import { syncMetadataStorage } from "@/shared/lib/infrastructure/storage/sync-metadata-storage";

const activeUser: User = {
  id: 1, first_name: "Test", last_name: "Owner", username: "owner",
  email: null, phone: null, industry_id: null, plan: "free", is_active: true,
  is_admin: false, role: "USER", is_system_admin: false, store_id: 101,
  subscription_started_at: null, subscription_expires_at: null,
  created_at: "2026-01-01T00:00:00Z",
};

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(), isPending: false,
  preview: vi.fn(), confirm: vi.fn(),
}));

vi.mock("@/features/setting/mutations/use-categories", () => ({
  useCategories: () => ({ data: [{ id: 4, name: "نوشیدنی" }] }),
}));
vi.mock("@/features/app/inventory/mutations/use-products", () => ({
  useBulkUpdateProducts: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: mocks.isPending,
  }),
}));
vi.mock("@/features/setting/api/taxonomy.api", () => ({
  previewRecategorization: mocks.preview,
  confirmRecategorization: mocks.confirm,
}));

import { BulkEditDialog } from "@/features/app/inventory/components/bulk-edit-dialog";

describe("bulk-edit dialog", () => {
  beforeEach(async () => {
    accessState.clear();
    accessState.saveUser(activeUser);
    mocks.mutateAsync.mockReset();
    mocks.preview.mockReset().mockResolvedValue({
      store_id: 101,
      destination_category_id: 4,
      targets: [
        { product_id: 1, version: 1, current_category_id: 2, internal_labels_to_replace: 1 },
        { product_id: 2, version: 1, current_category_id: 2, internal_labels_to_replace: 1 },
      ],
      expires_at: "2026-11-16T20:00:00Z",
      confirmation_token: "test-confirmation",
    });
    mocks.confirm.mockReset();
    await syncMetadataStorage.set("taxonomy-version", "scb-2026-11-14-v1");
  });

  it("starts with no effective changes and uses immediately available controls", () => {
    render(<Theme><BulkEditDialog open selectedIds={[1]} onOpenChange={vi.fn()} onComplete={vi.fn()} /></Theme>);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "اعمال تغییرات" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "افزایش قیمت" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "حد نصاب هشدار" })).toBeEnabled();
  });

  it("submits an additive price intent once and clears completed selection ids", async () => {
    let resolveMutation: (value: ReturnType<typeof product>[]) => void = () => undefined;
    mocks.mutateAsync.mockReturnValue(new Promise((resolve) => { resolveMutation = resolve; }));
    const onComplete = vi.fn();
    const onOpenChange = vi.fn();
    render(<Theme><BulkEditDialog open selectedIds={[1, 2]} onOpenChange={onOpenChange} onComplete={onComplete} /></Theme>);
    fireEvent.change(screen.getByRole("textbox", { name: "افزایش قیمت" }), { target: { value: "۲۵" } });
    const submit = screen.getByRole("button", { name: "اعمال تغییرات" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ ids: [1, 2], intent: { priceIncrease: 25 } });

    await act(async () => resolveMutation([product({ id: 1 }), product({ id: 2 })]));
    expect(onComplete).toHaveBeenCalledWith([1, 2]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cancels a recategorization preview without product, outbox, or lifecycle writes", async () => {
    const user = userEvent.setup();
    render(<Theme><BulkEditDialog open selectedIds={[1, 2]} onOpenChange={vi.fn()} onComplete={vi.fn()} /></Theme>);

    await user.click(screen.getByLabelText("دسته‌بندی جدید"));
    await user.click(await screen.findByRole("option", { name: "نوشیدنی" }));
    await user.click(screen.getByRole("button", { name: "اعمال تغییرات" }));

    expect(await screen.findByText("محصول متاثر: ۲")).toBeVisible();
    expect(mocks.preview).toHaveBeenCalledWith([1, 2], 4);
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^لغو$/ }));
    await waitFor(() => expect(screen.queryByText("محصول متاثر: ۲")).not.toBeInTheDocument());
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
