import { Button } from "@/shared/ui/button/button";
import { LayersIcon, MagnifyingGlassIcon, PlusIcon } from "@radix-ui/react-icons";
import { Badge, Box, Callout, Card, Flex, Spinner, Text, TextField } from "@radix-ui/themes";
import CategoryFormDialog from "./category-form-dialog";
import DeleteCategoryDialog from "./delete-category-dialog";
import {
  useCategories,
  useReactivateCategory,
  useRefreshCategoriesFromServer,
} from "../../mutations/use-categories";
import { useOnline } from "@/shared/lib/infrastructure/sync/use-sync-status";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/shared/ui/dialog/confirm-dialog";
import { PageGuide } from "@/features/app/layout/page-guide";
import { filterCategoriesByGuidance } from "../../services/category-guidance";

const CategoriesCards = () => {
  const { data: categories = [], isLoading, isError, error } = useCategories();
  const online = useOnline();
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [query, setQuery] = useState("");
  const refreshMutation = useRefreshCategoriesFromServer();
  const reactivateMutation = useReactivateCategory();
  const visibleCategories = filterCategoriesByGuidance(categories, query);

  const refresh = async () => {
    try {
      await refreshMutation.mutateAsync();
      setRefreshOpen(false);
      toast.success("دسته‌بندی‌های محلی از سرور تازه‌سازی شدند");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "تازه‌سازی دسته‌بندی‌ها ناموفق بود",
      );
    }
  };

  return (
    <Box className="space-y-6">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <div className="min-w-0 flex-1"><PageGuide section="ابزارها" sectionTo="/tools" title="دسته‌بندی‌ها" description="ساختار اصلی محصولات را با دسته‌های روشن و ماندگار مرتب کنید و در صورت نیاز آخرین اطلاعات تأییدشده مجموعه را بگیرید." icon={LayersIcon} helpTopic="classification" /></div>

        <Flex gap="2" wrap="wrap" className="w-full sm:w-auto">
          <Button
            variant="soft"
            disabled={!online}
            loading={refreshMutation.isPending}
            onClick={() => setRefreshOpen(true)}
          >
            <ReloadIcon /> تازه‌سازی از سرور
          </Button>
          <CategoryFormDialog
            mode="create"
            trigger={
              <Button>
                <PlusIcon />
                افزودن دسته بندی
              </Button>
            }
          />
        </Flex>
      </Flex>

      {!isLoading && !isError && categories.length > 0 ? (
        <Box maxWidth="520px">
          <TextField.Root
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجوی نام یا نمونه؛ مانند سیبک"
            aria-label="جست‌وجوی راهنمای دسته‌بندی"
          >
            <TextField.Slot><MagnifyingGlassIcon /></TextField.Slot>
          </TextField.Root>
          <Text as="p" size="1" color="gray" mt="1">
            نمونه‌ها فقط برای یافتن دسته‌اند و محصول یا دستهٔ تازه‌ای ایجاد نمی‌کنند.
          </Text>
        </Box>
      ) : null}

      {isLoading && (
        <Flex justify="center" align="center" height="300px">
          <Spinner size="3" />
        </Flex>
      )}

      {isError && (
        <Callout.Root color="red">
          <Callout.Text>
            {error instanceof Error ? error.message : "خطا در دریافت دسته بندی"}
          </Callout.Text>
        </Callout.Root>
      )}

      {!isLoading && !isError && categories.length === 0 && (
        <Card>
          <Flex
            direction="column"
            align="center"
            justify="center"
            gap="3"
            py="8"
          >
            <Box className="card-empty-icon" aria-hidden="true">
              <LayersIcon width="26" height="26" />
            </Box>
            <Text size="4" weight="medium">
              هنوز هیچ دسته بندی ثبت نشده است!
            </Text>

            <Text color="gray" size="2">
              اولین دسته بندی را ایجاد کنید.
            </Text>
          </Flex>
        </Card>
      )}

      {!isLoading && !isError && visibleCategories.length > 0 && (
        <Flex mt={"6"} wrap={"wrap"} gap={"5"}>
          {visibleCategories.map((category) => (
            <Card
              key={category.id}
              className="flex! h-32 w-full flex-col justify-between md:w-[calc(50%-10px)] xl:w-[calc(33.333%-14px)]"
            >
              <Box>
                <Flex align="center" gap="3">
                  <Flex
                    align="center"
                    justify="center"
                    aria-hidden="true"
                    className="card-title-icon"
                  >
                    <LayersIcon width="20" height="20" />
                  </Flex>
                  <Text as="div" size="2" weight="bold">
                    {category.name}
                  </Text>
                  <Badge color={category.is_active === false ? "gray" : category.origin === "system" ? "violet" : "amber"}>
                    {category.is_active === false ? "غیرفعال" : category.origin === "system" ? "سیستمی" : category.origin === "legacy" ? "قدیمی" : "اختصاصی"}
                  </Badge>
                </Flex>
                <Text
                  as="div"
                  mt={"1"}
                  color="gray"
                  size="2"
                  className="line-clamp-1"
                >
                  {category.description || "بدون توضیحات"}
                </Text>
              </Box>
              <Flex mt={"3"} align={"center"} gapX={"3"} justify={"end"}>
                {category.origin !== "system" ? (
                  <>
                    <CategoryFormDialog
                      mode="edit"
                      category={category}
                      trigger={<Button size={"2"} color="amber" variant="surface">ویرایش</Button>}
                    />
                    {category.is_active !== false ? (
                      <DeleteCategoryDialog category={category} />
                    ) : category.origin === "custom" ? (
                      <Button
                        size="2"
                        variant="soft"
                        loading={reactivateMutation.isPending}
                        onClick={() => reactivateMutation.mutate(category.id, {
                          onSuccess: () => toast.success(`دسته «${category.name}» دوباره فعال شد`),
                          onError: (cause) => toast.error(cause instanceof Error ? cause.message : "فعال‌سازی دسته ناموفق بود"),
                        })}
                      >
                        فعال‌سازی دوباره
                      </Button>
                    ) : null}
                  </>
                ) : <Text size="1" color="gray">عنوان و کد ثابت است</Text>}
              </Flex>
            </Card>
          ))}
        </Flex>
      )}
      {!isLoading && !isError && categories.length > 0 && visibleCategories.length === 0 ? (
        <Callout.Root color="gray">
          <Callout.Text>برای این عبارت دسته‌ای پیدا نشد؛ نمونه‌ها به‌صورت خودکار طبقه‌بندی نمی‌شوند.</Callout.Text>
        </Callout.Root>
      ) : null}
      <ConfirmDialog
        open={refreshOpen}
        onOpenChange={setRefreshOpen}
        title="دسته‌بندی‌ها تازه‌سازی شوند؟"
        description="نسخهٔ سرور جایگزین دسته‌بندی‌های فعلی می‌شود."
        confirmLabel="تازه‌سازی"
        variant="warning"
        loading={refreshMutation.isPending}
        onConfirm={() => { void refresh(); }}
      />
    </Box>
  );
};

export default CategoriesCards;
