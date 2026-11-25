
import { preventEventHandler } from "@/shared/lib/prevent-event";
import { FormField } from "@/shared/ui/form/field/form-field";
import { Form } from "@/shared/ui/form/form";
import { SelectInput } from "@/shared/ui/form/input/select-input";
import { Box, Button, Callout, Flex, Heading, Link, Text } from "@radix-ui/themes";
import { CubeIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adoptTaxonomy, getReferenceSectors, getTaxonomyState } from "../../api/taxonomy.api";
import { authKeys } from "@/features/auth/query/query-keys";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { syncMetadataStorage } from "@/shared/lib/infrastructure/storage/sync-metadata-storage";
import { ApiError } from "@/shared/api/api-error";

type IndustryFormProps = {
  mode?: "onboarding" | "settings";
};

function IndustryForm({ mode = "onboarding" }: IndustryFormProps) {
  const embedded = mode === "settings";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [industry, setIndustry] = useState<string>("");

  const { data: sectors = [], isLoading: industriesLoading, isError, error } = useQuery({
    queryKey: ["taxonomy", "sectors"], queryFn: getReferenceSectors, staleTime: Infinity,
  });
  const stateQuery = useQuery({ queryKey: ["taxonomy", "state"], queryFn: getTaxonomyState });
  const setIndustryMutation = useMutation({
    mutationFn: () => adoptTaxonomy(industry, stateQuery.data?.taxonomy_policy_version ?? 0),
    onSuccess: async (state) => {
      const selected = sectors.find((sector) => sector.code === state.sector_code);
      await Promise.all([
        syncMetadataStorage.set("taxonomy-version", state.taxonomy_version),
        syncMetadataStorage.set("taxonomy-sector-code", state.sector_code),
        syncMetadataStorage.set("taxonomy-custom-categories", selected?.custom_categories_allowed ? "1" : "0"),
      ]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["taxonomy"] }),
        queryClient.invalidateQueries({ queryKey: authKeys.me }),
      ]);
      toast.success("حوزه کاری و دسته‌های مصوب ثبت شد.");
      navigate({ to: "/dashboard" });
    },
  });

  function loginHandler() {
    setIndustryMutation.mutate();
  }

  const serverError =
    setIndustryMutation.error instanceof ApiError
      ? setIndustryMutation.error.message
      : setIndustryMutation.isError
        ? "خطا در ارتباط با سرور"
        : null;

  return (
    <Flex className="industry-selector-shell" data-embedded={embedded || undefined} data-mode={mode}>
      <Form
        isDirty={industry !== ""}
        className={embedded ? "industry-selector-form w-full" : "industry-selector-form min-h-dvh w-full"}
        isSubmitting={setIndustryMutation.isPending}
        onSubmit={preventEventHandler(loginHandler)}
      >
        <Flex
          direction="column"
          gapY="5"
          className="industry-selector-panel"
        >
          <Box className="industry-selector-heading">
            <span className="industry-selector-icon" aria-hidden="true"><CubeIcon width="22" height="22" /></span>
            <Box>
              <Heading as="h2" size="6">{embedded ? "تغییر حوزه کاری" : "حوزه کاری مجموعه"}</Heading>
              <Text as="p" size="2" color="gray">
                {embedded
                  ? "حوزه مناسب مجموعه را انتخاب کنید؛ کاتالوگ و ابزارهای مرتبط با انتخاب تازه به‌روزرسانی می‌شوند."
                  : "برای آماده‌سازی کاتالوگ و ابزارهای مرتبط، حوزه فعالیت مجموعه را انتخاب کنید."}
              </Text>
            </Box>
          </Box>

          {serverError && (
            <Callout.Root color="red" dir="rtl" className="w-full">
              <Callout.Text>{serverError}</Callout.Text>
            </Callout.Root>
          )}
          {isError && (
            <Callout.Root color="red">
              <Callout.Text>
                {error instanceof Error
                  ? error.message
                  : "خطا در دریافت حوزه‌های کاری"}
              </Callout.Text>
            </Callout.Root>
          )}
          {stateQuery.data && !stateQuery.data.adoption_enabled && !stateQuery.data.taxonomy_version ? (
            <Callout.Root color="amber" role="status">
              <Callout.Text>
                ثبت حوزه‌های جدید تا تکمیل آزمون خوانایی و چاپ بارکد غیرفعال است. اطلاعات فعلی فروشگاه تغییری نمی‌کند.
              </Callout.Text>
            </Callout.Root>
          ) : null}

          <Box className="industry-selector-control">
            <FormField id="industry" label="حوزه فعالیت">
              <SelectInput
                name="industry"
                size="3"
                options={
                  sectors.map((sector) => ({
                    label: `${sector.code} — ${sector.name_fa}`,
                    value: sector.code,
                  })) ?? []
                }
                placeholder={industriesLoading ? "در حال دریافت حوزه‌ها…" : "انتخاب حوزه کاری"}
                value={industry ?? ""}
                onValueChange={(value: string) => setIndustry(value ?? "")}
              />
            </FormField>
          </Box>
          <Box className="industry-selector-actions">
            <Button
              type="submit"
              style={{ width: "100%" }}
              loading={setIndustryMutation.isPending}
              disabled={industriesLoading || stateQuery.isLoading || stateQuery.data?.adoption_enabled !== true || !industry}
            >
              {embedded ? "ذخیره تغییرات" : "ذخیره و ادامه"}
            </Button>
            {!embedded && stateQuery.data?.taxonomy_version ? (
              <Link href="/dashboard" style={{ width: "100%" }}>بازگشت به داشبورد</Link>
            ) : null}
          </Box>
        </Flex>
      </Form>
    </Flex>
  );
}

export default IndustryForm;
