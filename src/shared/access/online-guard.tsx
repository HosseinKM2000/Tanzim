import { networkService } from "@/shared/lib/infrastructure/network/network-service";
import { useOnline } from "@/shared/lib/infrastructure/sync/use-sync-status";
import { Button, Callout, Flex } from "@radix-ui/themes";
import { useEffect, useState, type PropsWithChildren } from "react";

export function OnlineGuard({ children }: PropsWithChildren) {
  const online = useOnline();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!online) {
      void networkService.verifyConnectivity(true);
    }
  }, [online]);

  if (!online) {
    return (
      <Flex p="5" direction="column" gap="3" dir="rtl">
        <Callout.Root color="amber" dir="rtl" role="status" aria-live="polite">
          <Callout.Text>
            این بخش به اتصال اینترنت نیاز دارد. پس از آنلاین شدن دوباره تلاش کنید.
          </Callout.Text>
        </Callout.Root>
        <Flex>
          <Button
            variant="soft"
            loading={checking}
            onClick={async () => {
              setChecking(true);
              try {
                await networkService.verifyConnectivity(true);
              } finally {
                setChecking(false);
              }
            }}
          >
            بررسی مجدد اتصال
          </Button>
        </Flex>
      </Flex>
    );
  }
  return children;
}
