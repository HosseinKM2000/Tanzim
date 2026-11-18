import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "@tanstack/react-router";
import { Badge, Box, Button, Callout, Card, Flex, Spinner, Text, TextField } from "@radix-ui/themes";
import { ClipboardIcon, ImageIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";

import { PageGuide } from "@/features/app/layout/page-guide";
import { useProducts } from "@/features/app/inventory/mutations/use-products";
import { accessState } from "@/shared/access/access-state";
import { resolveAssetUrl } from "@/shared/api/client";
import { useAuth } from "@/shared/auth/use-auth";
import { useCatalogProductsInfinite } from "../mutations/use-catalog";
import type { CatalogProduct } from "../types";

const ROW_HEIGHT = 390;

function CatalogImage({ product }: { product: CatalogProduct }) {
  const [failed, setFailed] = useState(false);
  const src = resolveAssetUrl(product.image_url);
  return (
    <Flex height="150px" align="center" justify="center" className="overflow-hidden rounded-md bg-gray-3">
      {src && !failed ? (
        <img src={src} alt={product.name} loading="lazy" decoding="async" onError={() => setFailed(true)}
          className="h-full w-full object-cover" />
      ) : <ImageIcon width="32" height="32" aria-label="بدون تصویر" />}
    </Flex>
  );
}

export function CatalogAdoptionV2() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [columns, setColumns] = useState(3);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setColumns(entry.contentRect.width >= 900 ? 3 : entry.contentRect.width >= 600 ? 2 : 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const params = user?.industry_id ? { industry_id: user.industry_id, ...(search ? { search } : {}) } : undefined;
  const catalogs = useCatalogProductsInfinite(params, Boolean(user?.industry_id));
  const inventory = useProducts({ include_hidden: true });
  const products = useMemo(() => catalogs.data?.pages.flatMap((page) => page.items) ?? [], [catalogs.data]);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = catalogs;
  const rows = Math.ceil(products.length / columns);
  // TanStack Virtual is imperative by design; compiler memoization would retain stale measurements.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({ count: rows, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_HEIGHT, overscan: 2 });
  const virtualRows = virtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualRows.at(-1);
    if (last && last.index >= rows - 2 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [virtualRows, rows, hasNextPage, isFetchingNextPage, fetchNextPage]);
  const adopted = useMemo(() => new Map((inventory.data ?? []).filter((item) => item.is_catalog_backed).map((item) => [item.catalog_product_id, item.id])), [inventory.data]);
  const canAdopt = accessState.canWrite() && accessState.hasStorePermission("products.create");

  return <Box dir="rtl" className="mx-auto max-w-5xl space-y-5">
    <PageGuide section="ابزارها" sectionTo="/tools" title="کاتالوگ" description="محصول مشترک را جست‌وجو و در صورت نیاز به موجودی اضافه کنید." icon={ClipboardIcon} helpTopic="catalog" />
    {!user?.industry_id ? <Callout.Root color="amber"><Callout.Text>ابتدا حوزه کاری فروشگاه را انتخاب کنید.</Callout.Text></Callout.Root> : <>
      <TextField.Root value={input} onChange={(event) => setInput(event.target.value)} placeholder="جست‌وجوی نام، برند یا توضیحات" aria-label="جست‌وجوی کاتالوگ"><TextField.Slot><MagnifyingGlassIcon /></TextField.Slot></TextField.Root>
      {(catalogs.isLoading || inventory.isLoading) ? <Flex justify="center" py="8"><Spinner size="3" /></Flex>
      : (catalogs.isError && products.length === 0) || inventory.isError ? <Callout.Root color="red"><Callout.Text>دریافت کاتالوگ انجام نشد.</Callout.Text><Button mt="2" onClick={() => void catalogs.refetch()}>تلاش دوباره</Button></Callout.Root>
      : products.length === 0 ? <Callout.Root color="gray"><Callout.Text>محصولی مطابق جست‌وجو وجود ندارد.</Callout.Text></Callout.Root>
      : <div ref={scrollRef} className="h-[70vh] overflow-auto" aria-label="فهرست کاتالوگ">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualRows.map((row) => <div key={row.key} data-index={row.index} ref={virtualizer.measureElement} style={{ position: "absolute", top: 0, right: 0, width: "100%", transform: `translateY(${row.start}px)`, display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 16, paddingBottom: 16 }}>
            {products.slice(row.index * columns, row.index * columns + columns).map((product) => {
              const inventoryId = adopted.get(product.id);
              return <Card key={product.id} size="3"><Flex direction="column" gap="3" height="100%">
                <CatalogImage product={product} /><Box><Flex gap="2" align="center" wrap="wrap"><Text size="4" weight="bold">{product.name}</Text>{inventoryId ? <Badge color="green">در موجودی</Badge> : null}</Flex>{product.brand ? <Text as="div" size="2" color="gray">برند: {product.brand}</Text> : null}<Text as="div" size="2" mt="2" className="line-clamp-3">{product.description}</Text></Box>
                <Box mt="auto">{inventoryId ? <Button asChild variant="soft"><Link to="/inventory/edit" search={{ id: inventoryId }}>مشاهده در موجودی</Link></Button> : <Button asChild disabled={!canAdopt}><Link to="/inventory/add" search={{ catalogId: product.id }}>افزودن به موجودی</Link></Button>}</Box>
              </Flex></Card>;
            })}
          </div>)}
        </div>
        {isFetchingNextPage ? <Flex justify="center" py="3"><Spinner /></Flex> : null}
        {catalogs.isError && products.length > 0 ? <Flex justify="center" py="3"><Button onClick={() => void fetchNextPage()}>تلاش دوباره برای ادامه</Button></Flex> : null}
      </div>}
    </>}
  </Box>;
}
