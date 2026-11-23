import { useCallback, useEffect, useState } from "react";
import { Badge, Box, Button, Callout, Card, Flex, Grid, Spinner, Text } from "@radix-ui/themes";
import { DownloadIcon } from "@radix-ui/react-icons";
import { toast } from "sonner";

import { PageGuide } from "@/features/app/layout/page-guide";
import { networkService } from "@/shared/lib/infrastructure/network/network-service";
import { useCatalogAdoptionStatus } from "@/features/setting/mutations/use-catalog";

import { catalogDownloadService } from "./catalog-download.service";
import { catalogOfflineRepository } from "./catalog-offline.repository";
import { currentCatalogScope } from "./scope";
import type { CatalogDownloadJob, CatalogFamilySummary, CatalogOfflineFamily } from "./types";

const stateLabel: Record<string, string> = {
  queued: "در صف", downloading: "در حال دانلود", paused: "متوقف", verifying: "در حال بررسی",
  complete: "کامل", partial: "ناقص", failed: "ناموفق", cancelled: "لغوشده", update_available: "به‌روزرسانی موجود",
};

export function CatalogDownloadManager() {
  const [remoteFamilies, setRemoteFamilies] = useState<CatalogFamilySummary[]>([]);
  const [localFamilies, setLocalFamilies] = useState<CatalogOfflineFamily[]>([]);
  const [jobs, setJobs] = useState<CatalogDownloadJob[]>([]);
  const status = useCatalogAdoptionStatus();
  const scopeKey = currentCatalogScope()?.scopeKey;
  const displayFamilies: CatalogFamilySummary[] = [
    ...remoteFamilies,
    ...localFamilies.filter((local) => !remoteFamilies.some((remote) => remote.id === local.familyId)).map((local) => ({
      id: local.familyId,
      industry_id: local.industryId,
      slug: local.slug,
      name: local.name,
      is_active: true,
      sort_order: 0,
    })),
  ];

  const refresh = useCallback(async () => {
    const scope = currentCatalogScope();
    if (!scope || scope.scopeKey !== scopeKey) return;
    const [local, currentJobs] = await Promise.all([catalogOfflineRepository.families(scope), catalogOfflineRepository.jobs(scope)]);
    setLocalFamilies(local);
    setJobs(currentJobs);
  }, [scopeKey]);

  useEffect(() => {
    const scope = currentCatalogScope();
    if (status.data?.offline_families_v1_enabled !== true || !scope || scope.scopeKey !== scopeKey) return;
    const initialize = window.setTimeout(() => {
      void catalogDownloadService.reconcile(scope);
      void refresh();
      if (networkService.isOnline()) {
        void catalogDownloadService.discovery(scope).then(({ families }) => setRemoteFamilies(families)).catch(() => undefined);
      }
    }, 0);
    const timer = window.setInterval(() => void refresh(), 800);
    return () => {
      window.clearTimeout(initialize);
      window.clearInterval(timer);
    };
  }, [scopeKey, refresh, status.data?.offline_families_v1_enabled]);

  const download = async (family: CatalogFamilySummary, includeDetails: boolean) => {
    const scope = currentCatalogScope();
    if (!scope || scope.scopeKey !== scopeKey) return;
    try {
      const plan = await catalogDownloadService.preflight(scope, family, includeDetails);
      if (!plan.fits) throw new Error("فضای ذخیره‌سازی کافی نیست.");
      toast.info(`${plan.entries.length} تصویر، ${Math.ceil(plan.totalBytes / 1024)} کیلوبایت`);
      const job = await catalogDownloadService.create(scope, family, includeDetails);
      await refresh();
      void catalogDownloadService.start(job.id).finally(refresh);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "آماده‌سازی دانلود انجام نشد.");
    }
  };

  const act = async (action: () => Promise<unknown>) => { await action(); await refresh(); };
  const remove = async (familyId: number) => {
    const activeScope = currentCatalogScope();
    if (!activeScope || activeScope.scopeKey !== scopeKey) return;
    await act(() => catalogDownloadService.remove(activeScope, familyId));
  };

  if (status.isLoading) return <Flex justify="center" py="8"><Spinner size="3" /></Flex>;
  if (!status.data?.offline_families_v1_enabled) return <Box dir="rtl" className="mx-auto max-w-5xl"><Callout.Root color="gray"><Callout.Text>قابلیت کاتالوگ آفلاین در این محیط فعال نیست.</Callout.Text></Callout.Root></Box>;

  return <Box dir="rtl" className="mx-auto max-w-5xl space-y-5">
    <PageGuide section="تنظیمات" sectionTo="/setting" title="کاتالوگ و تصاویر آفلاین" description="دانلود خانواده‌ای، توقف، ادامه، ترمیم و حذف نسخه‌های محلی." icon={DownloadIcon} helpTopic="catalog" />
    {!scopeKey && <Callout.Root color="red"><Callout.Text>دسترسی فعال فروشگاه برای مدیریت کاتالوگ لازم است.</Callout.Text></Callout.Root>}
    {!networkService.isOnline() && <Callout.Root color="amber"><Callout.Text>در حالت آفلاین فقط مدیریت دانلودهای موجود در دسترس است.</Callout.Text></Callout.Root>}
    <>
      <Grid columns={{ initial: "1", md: "2" }} gap="4">
        {displayFamilies.map((family) => {
          const local = localFamilies.find((item) => item.familyId === family.id);
          return <Card key={family.id} className="space-y-3">
            <Flex justify="between" align="center"><Text weight="bold">{family.name}</Text>{local && <Badge color={local.state === "complete" ? "green" : "amber"}>{stateLabel[local.state] ?? local.state}</Badge>}</Flex>
            {local && <Text as="div" size="2" color="gray">{local.verifiedAssets} از {local.requiredAssets} تصویر · {local.productCount} محصول</Text>}
            <Flex gap="2" wrap="wrap">
              {networkService.isOnline() && <Button onClick={() => void download(family, false)}>{local ? "به‌روزرسانی سبک" : "دانلود سبک"}</Button>}
              {networkService.isOnline() && <Button variant="soft" onClick={() => void download(family, true)}>دانلود کامل</Button>}
              {local && <Button color="red" variant="soft" onClick={() => void remove(family.id)}>حذف محلی</Button>}
            </Flex>
          </Card>;
        })}
      </Grid>
      <Box className="space-y-3">
        <Text as="div" weight="bold">صف دانلود</Text>
        {jobs.map((job) => <Card key={job.id}>
          <Flex justify="between" align="center" gap="3" wrap="wrap">
            <Box><Text as="div" weight="bold">{job.familyName}</Text><Text size="2" color="gray">{job.completedEntries} / {job.totalEntries} · {stateLabel[job.state] ?? job.state}</Text></Box>
            <Flex gap="2">
              {job.state === "downloading" && <Button variant="soft" onClick={() => void act(() => catalogDownloadService.pause(job.id))}>توقف</Button>}
              {["paused", "queued", "cancelled"].includes(job.state) && <Button onClick={() => void catalogDownloadService.start(job.id).finally(refresh)}>ادامه</Button>}
              {["failed", "partial"].includes(job.state) && <Button onClick={() => void catalogDownloadService.retry(job.id).finally(refresh)}>تلاش دوباره</Button>}
              {!["complete", "cancelled"].includes(job.state) && <Button color="red" variant="soft" onClick={() => void act(() => catalogDownloadService.cancel(job.id))}>لغو</Button>}
            </Flex>
          </Flex>
          <progress className="mt-3 w-full" max={Math.max(1, job.totalEntries)} value={job.completedEntries} aria-label="پیشرفت دانلود" />
          {job.lastError && <Text as="div" color="red" size="2">{job.lastError}</Text>}
        </Card>)}
      </Box>
    </>
  </Box>;
}
