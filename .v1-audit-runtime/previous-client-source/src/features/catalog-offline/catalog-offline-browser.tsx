import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "@tanstack/react-router";
import { Box, Button, Callout, Card, Flex, Select, Text, TextField } from "@radix-ui/themes";
import { ImageIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";

import { PageGuide } from "@/features/app/layout/page-guide";
import { accessState } from "@/shared/access/access-state";

import { catalogOfflineRepository } from "./catalog-offline.repository";
import { currentCatalogScope } from "./scope";
import { useOfflineCatalogImage } from "./use-offline-catalog-image";
import type { CatalogOfflineFamily, CatalogOfflineProduct } from "./types";

const PAGE_SIZE = 24;
const ROW_HEIGHT = 300;

function OfflineImage({ product }: { product: CatalogOfflineProduct }) {
  const image = useOfflineCatalogImage(product.preview, product.releaseId, product.familySlug);
  return <Flex height="140px" align="center" justify="center" className="overflow-hidden rounded-md bg-gray-3">
    {image.src
      ? <img src={image.src} alt={product.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
      : <ImageIcon width="32" height="32" aria-label="بدون تصویر" />}
  </Flex>;
}

export function CatalogOfflineBrowser() {
  const [families, setFamilies] = useState<CatalogOfflineFamily[]>([]);
  const [familyId, setFamilyId] = useState<number>();
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<CatalogOfflineProduct[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [columns, setColumns] = useState(3);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scopeKey = currentCatalogScope()?.scopeKey;
  const family = families.find((item) => item.familyId === familyId);

  useEffect(() => {
    const scope = currentCatalogScope();
    if (!scope || scope.scopeKey !== scopeKey) return;
    void catalogOfflineRepository.families(scope).then((rows) => {
      const ready = rows.filter((row) => row.state === "complete" && row.activeReleaseId);
      setFamilies(ready);
      setFamilyId((current) => current ?? ready[0]?.familyId);
    });
  }, [scopeKey]);

  useEffect(() => {
    const scope = currentCatalogScope();
    if (!scope || scope.scopeKey !== scopeKey || !family?.activeReleaseId) return;
    const timer = window.setTimeout(() => {
      void catalogOfflineRepository.products(scope, family.familyId, family.activeReleaseId!, search, 0, PAGE_SIZE + 1)
        .then((rows) => {
          setProducts(rows.slice(0, PAGE_SIZE));
          setHasMore(rows.length > PAGE_SIZE);
          setOffset(PAGE_SIZE);
        });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [scopeKey, family?.familyId, family?.activeReleaseId, search]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setColumns(entry.contentRect.width >= 900 ? 3 : entry.contentRect.width >= 600 ? 2 : 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, [products.length]);

  const loadMore = async () => {
    const scope = currentCatalogScope();
    if (!scope || scope.scopeKey !== scopeKey || !family?.activeReleaseId || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const rows = await catalogOfflineRepository.products(scope, family.familyId, family.activeReleaseId, search, offset, PAGE_SIZE + 1);
      setProducts((current) => [...current, ...rows.slice(0, PAGE_SIZE)]);
      setOffset((current) => current + PAGE_SIZE);
      setHasMore(rows.length > PAGE_SIZE);
    } finally {
      setIsLoadingMore(false);
    }
  };
  const rowCount = Math.ceil(products.length / columns);
  // TanStack Virtual is imperative by design; compiler memoization would retain stale measurements.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({ count: rowCount, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_HEIGHT, overscan: 2 });
  const virtualRows = virtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualRows.at(-1);
    if (last && last.index >= rowCount - 2 && hasMore && !isLoadingMore) void loadMore();
  // loadMore intentionally captures the current family, release and offset.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [virtualRows, rowCount, hasMore, isLoadingMore]);
  const canAdopt = accessState.canWrite() && accessState.hasStorePermission("products.create");

  return <Box dir="rtl" className="mx-auto max-w-5xl space-y-5">
    <PageGuide section="ابزارها" sectionTo="/tools" title="کاتالوگ آفلاین" description="خانواده‌های ذخیره‌شده را بدون اتصال مرور و به موجودی اضافه کنید." icon={ImageIcon} helpTopic="catalog" />
    <Callout.Root color="blue"><Callout.Text>نسخه‌ی تأییدشده‌ی محلی نمایش داده می‌شود. هنگام همگام‌سازی، سرور شناسه‌ی کاتالوگ را دوباره اعتبارسنجی می‌کند.</Callout.Text></Callout.Root>
    {!scopeKey ? <Callout.Root color="red"><Callout.Text>دسترسی معتبر فروشگاه برای کاتالوگ موجود نیست.</Callout.Text></Callout.Root>
      : families.length === 0 ? <Callout.Root color="amber"><Callout.Text>هنوز خانواده‌ای برای استفاده‌ی آفلاین دانلود نشده است.</Callout.Text></Callout.Root>
      : <>
        <Flex gap="3" wrap="wrap">
          <Select.Root value={familyId ? String(familyId) : undefined} onValueChange={(value) => setFamilyId(Number(value))}>
            <Select.Trigger aria-label="انتخاب خانواده" />
            <Select.Content>{families.map((item) => <Select.Item key={item.familyId} value={String(item.familyId)}>{item.name}</Select.Item>)}</Select.Content>
          </Select.Root>
          <TextField.Root className="min-w-64 flex-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجوی نام، برند یا توضیحات">
            <TextField.Slot><MagnifyingGlassIcon /></TextField.Slot>
          </TextField.Root>
        </Flex>
        {products.length > 0 && <div ref={scrollRef} className="h-[70vh] overflow-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualRows.map((row) => <div key={row.key} data-index={row.index} ref={virtualizer.measureElement} style={{ position: "absolute", top: 0, right: 0, width: "100%", transform: `translateY(${row.start}px)`, display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 16, paddingBottom: 16 }}>
          {products.slice(row.index * columns, row.index * columns + columns).map((product) => <Card key={product.key} className="space-y-3">
            <OfflineImage product={product} />
            <Text as="div" weight="bold">{product.name}</Text>
            {product.brand && <Text as="div" color="gray" size="2">{product.brand}</Text>}
            <Button asChild disabled={!canAdopt}><Link to="/inventory/add" search={{ catalogId: product.id }}>افزودن به موجودی</Link></Button>
          </Card>)}
          </div>)}
          </div>
        </div>}
        {products.length === 0 && <Callout.Root color="gray"><Callout.Text>محصولی مطابق جست‌وجو نیست.</Callout.Text></Callout.Root>}
        {hasMore && <Flex justify="center"><Button variant="soft" onClick={() => void loadMore()}>نمایش بیشتر</Button></Flex>}
      </>}
  </Box>;
}
