import { categoryStorage } from "@/shared/lib/infrastructure/storage/category-storage";
import { queueService } from "@/shared/lib/infrastructure/sync/queue.service";
import type { Category, CategoryInput } from "../types";
import { accessState } from "@/shared/access/access-state";
import { createLocalEntityId } from "@/shared/lib/infrastructure/storage/local-entity-id";
import { localMutationStorage } from "@/shared/lib/infrastructure/storage/local-mutation-storage";
import { isTeamMode, teamCommandService } from "@/shared/lib/infrastructure/sync/team-command.service";
import { syncMetadataStorage } from "@/shared/lib/infrastructure/storage/sync-metadata-storage";

function customCategoryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `C${[...bytes].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export const CATEGORY_ENTITY = "category";

export const categoryService = {
  getAll: () => categoryStorage.getAll(),

  async create(input: CategoryInput) {
    accessState.requireTool("categories");
    const now = new Date().toISOString();
    const [taxonomyVersion, sectorCode, customAllowed] = await Promise.all([
      syncMetadataStorage.getString("taxonomy-version"),
      syncMetadataStorage.getString("taxonomy-sector-code"),
      syncMetadataStorage.getString("taxonomy-custom-categories"),
    ]);
    if (taxonomyVersion && customAllowed !== "1") throw new Error("در این حوزه فقط دسته‌های مصوب سیستمی قابل استفاده‌اند");
    if (taxonomyVersion && !sectorCode) throw new Error("اطلاعات حوزه برای ساخت دسته در دسترس نیست؛ یک‌بار آنلاین تازه‌سازی کنید");
    const category: Category = {
      id: input.id ?? createLocalEntityId(),
      name: input.name.trim(),
      description: input.description ?? "",
      code: taxonomyVersion ? customCategoryCode() : null,
      sector_code: taxonomyVersion ? sectorCode : null,
      origin: taxonomyVersion ? "custom" : "legacy",
      approval_status: taxonomyVersion ? "approved" : "legacy",
      is_active: true,
      taxonomy_version: taxonomyVersion,
      version: 1,
      created_at: now,
      updated_at: now,
    };
    if (isTeamMode()) {
      await teamCommandService.submit(CATEGORY_ENTITY, category.id, "CREATE", category);
      const confirmed = await categoryStorage.get(category.id);
      if (!confirmed) throw new Error("TEAM_RESULT_MISSING");
      return confirmed;
    }
    await localMutationStorage.category(async () => {
      await categoryStorage.save(category);
      await queueService.enqueue(CATEGORY_ENTITY, category.id, "CREATE", category);
    });
    return category;
  },

  async update(id: number, input: CategoryInput) {
    accessState.requireTool("categories");
    const current = await categoryStorage.get(id);
    if (!current) throw new Error("Category not found");
    const category = {
      ...current,
      name: input.name.trim(),
      description: input.description ?? "",
      updated_at: new Date().toISOString(),
    };
    if (isTeamMode()) {
      await teamCommandService.submit(CATEGORY_ENTITY, id, "UPDATE", category);
      const confirmed = await categoryStorage.get(id);
      if (!confirmed) throw new Error("TEAM_RESULT_MISSING");
      return confirmed;
    }
    await localMutationStorage.category(async () => {
      await categoryStorage.save(category);
      await queueService.enqueue(CATEGORY_ENTITY, id, "UPDATE", category);
    });
    return category;
  },

  async remove(id: number) {
    accessState.requireTool("categories");
    const current = await categoryStorage.get(id);
    if (!current) throw new Error("Category not found");
    if (current.origin === "system") throw new Error("دسته سیستمی قابل غیرفعال‌سازی نیست");
    const inactive = { ...current, is_active: false, version: (current.version ?? 1) + 1, updated_at: new Date().toISOString() };
    if (isTeamMode()) {
      await teamCommandService.submit(CATEGORY_ENTITY, id, "DELETE", null);
      return;
    }
    await localMutationStorage.category(async () => {
      await categoryStorage.save(inactive);
      await queueService.enqueue(CATEGORY_ENTITY, id, "DELETE", null);
    });
  },

  async reactivate(id: number) {
    accessState.requireTool("categories");
    const current = await categoryStorage.get(id);
    if (!current || current.origin !== "custom") throw new Error("فقط دسته اختصاصی قابل فعال‌سازی مجدد است");
    const active = { ...current, is_active: true, updated_at: new Date().toISOString() };
    if (isTeamMode()) {
      await teamCommandService.submit(CATEGORY_ENTITY, id, "UPDATE", active);
      const confirmed = await categoryStorage.get(id);
      if (!confirmed) throw new Error("TEAM_RESULT_MISSING");
      return confirmed;
    }
    await localMutationStorage.category(async () => {
      await categoryStorage.save(active);
      await queueService.enqueue(CATEGORY_ENTITY, id, "UPDATE", active);
    });
    return active;
  },
};
