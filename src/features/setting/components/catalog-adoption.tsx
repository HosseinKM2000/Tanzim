import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Badge, Box, Button, Callout, Card, Flex, Grid, Spinner, Text } from "@radix-ui/themes";
import { ClipboardIcon } from "@radix-ui/react-icons";

import { PageGuide } from "@/features/app/layout/page-guide";
import { useProducts } from "@/features/app/inventory/mutations/use-products";
import { accessState } from "@/shared/access/access-state";
import { useAuth } from "@/shared/auth/use-auth";
import { useCatalogProducts } from "../mutations/use-catalog";

export function CatalogAdoption() {
  const { user } = useAuth();
  const catalogs = useCatalogProducts(
    user?.industry_id ? { industry_id: user.industry_id } : undefined,
    Boolean(user?.industry_id),
  );
  const inventory = useProducts({ include_hidden: true });
  const adoptedByCatalog = useMemo(
    () => new Map((inventory.data ?? []).filter((item) => item.is_catalog_backed)
      .map((item) => [item.catalog_product_id, item.id])),
    [inventory.data],
  );
  const canAdopt = accessState.canWrite() && accessState.hasStorePermission("products.create");

  return (
    <Box dir="rtl" className="mx-auto max-w-5xl space-y-5">
      <PageGuide section="ابزارها" sectionTo="/tools" title="کاتالوگ"
        description="محصول مشترک را مرور کنید و فقط موارد مورد نیاز را به موجودی فروشگاه خود بیفزایید."
        icon={ClipboardIcon} helpTopic="catalog" />
      {!user?.industry_id ? (
        <Callout.Root color="amber"><Callout.Text>ابتدا حوزه کاری فروشگاه را انتخاب کنید.</Callout.Text></Callout.Root>
      ) : catalogs.isLoading || inventory.isLoading ? (
        <Flex justify="center" py="8"><Spinner size="3" /></Flex>
      ) : catalogs.isError || inventory.isError ? (
        <Callout.Root color="red"><Callout.Text>دریافت کاتالوگ انجام نشد. اتصال اینترنت را بررسی کنید.</Callout.Text></Callout.Root>
      ) : catalogs.data?.length === 0 ? (
        <Callout.Root color="gray"><Callout.Text>محصول فعالی برای حوزه کاری شما وجود ندارد.</Callout.Text></Callout.Root>
      ) : (
        <Grid columns={{ initial: "1", sm: "2", lg: "3" }} gap="4">
          {catalogs.data?.map((catalog) => {
            const inventoryId = adoptedByCatalog.get(catalog.id);
            return (
              <Card key={catalog.id} size="3">
                <Flex direction="column" gap="3" height="100%">
                  <Box>
                    <Flex gap="2" align="center" wrap="wrap">
                      <Text size="4" weight="bold">{catalog.name}</Text>
                      {inventoryId ? <Badge color="green">در موجودی</Badge> : null}
                    </Flex>
                    {catalog.brand ? <Text as="div" size="2" color="gray" mt="1">برند: {catalog.brand}</Text> : null}
                    {catalog.description ? <Text as="div" size="2" mt="2">{catalog.description}</Text> : null}
                  </Box>
                  <Box mt="auto">
                    {inventoryId ? (
                      <Button asChild variant="soft"><Link to="/inventory/edit" search={{ id: inventoryId }}>مشاهده در موجودی</Link></Button>
                    ) : (
                      <Button asChild disabled={!canAdopt}><Link to="/inventory/add" search={{ catalogId: catalog.id }}>افزودن به موجودی</Link></Button>
                    )}
                  </Box>
                </Flex>
              </Card>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
