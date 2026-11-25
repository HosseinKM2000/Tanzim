import { useEntitlementAccess } from "@/shared/access/use-entitlement";
import { isAdmin } from "@/shared/access/authorization";
import { useAuth } from "@/shared/auth/use-auth";
import { queryClient } from "@/shared/api/query-client";
import {
  ArchiveIcon,
  CalendarIcon,
  CheckCircledIcon,
  ClockIcon,
  DesktopIcon,
  ExclamationTriangleIcon,
  StarIcon,
  TimerIcon,
  TokensIcon,
} from "@radix-ui/react-icons";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Grid,
  Separator,
  Text,
} from "@radix-ui/themes";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAvailablePlans } from "../../mutations/use-admin";
import {
  getCheckoutStatus,
  startPlanCheckout,
  verifyPlanPayment,
} from "../../api/plans.api";
import {
  FEATURE_LABELS,
  formatPlanPrice,
  sortPlansByPrice,
} from "../subscription-management/plan-options";
import { formatJalaliDate } from "@/shared/lib/date/jalali";
import { PageGuide } from "@/features/app/layout/page-guide";

const date = (value: string | null | undefined) =>
  value
    ? formatJalaliDate(value)
    : "—";

function InfoCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent?: "green" | "red" | "violet";
  icon: ReactNode;
}) {
  return (
    <Card>
      <Flex align="center" gap="3">
        <Box className="card-metric-icon" aria-hidden="true">
          {icon}
        </Box>
        <Box className="min-w-0">
          <Text as="div" size="1" color="gray">
            {label}
          </Text>
          <Text as="div" size="3" weight="bold" color={accent}>
            {value}
          </Text>
        </Box>
      </Flex>
    </Card>
  );
}

export default function SubscriptionSettings() {
  const { user } = useAuth();
  const administrator = isAdmin(user);
  const access = useEntitlementAccess();
  const current = access.entitlement;
  const plans = useAvailablePlans();
  const checkoutStatus = useQuery({
    queryKey: ["plans", "checkout-status"],
    queryFn: getCheckoutStatus,
  });
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  const [activeSlideId, setActiveSlideId] = useState<string>("pro");
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToPlan = (planId: string) => {
    setActiveSlideId(planId);
    const el = cardRefs.current[planId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  };
  const [paymentBanner, setPaymentBanner] = useState<{
    kind: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const verifiedDpRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const dpId = params.get("dp_id");
    if (!dpId || verifiedDpRef.current === dpId) return;
    verifiedDpRef.current = dpId;

    setPaymentBanner({
      kind: "info",
      text: "در حال استعلام و تأیید پرداخت از درگاه دُنگی‌پی...",
    });
    void verifyPlanPayment(dpId)
      .then(async (res) => {
        if (res.verified) {
          setPaymentBanner({
            kind: "success",
            text: `پرداخت با موفقیت تأیید شد و اشتراک شما فعال گردید.${res.ref_code ? ` (کد پیگیری: ${res.ref_code})` : ""}`,
          });
          toast.success("اشتراک شما با موفقیت فعال شد");
          await queryClient.invalidateQueries();
        } else {
          setPaymentBanner({
            kind: "error",
            text: "پرداخت تکمیل نشد یا توسط کاربر لغو گردید.",
          });
        }
      })
      .catch((err) => {
        setPaymentBanner({
          kind: "error",
          text: err instanceof Error ? err.message : "تأیید پرداخت ناموفق بود.",
        });
      })
      .finally(() => {
        const cleanUrl = `${window.location.pathname}`;
        window.history.replaceState({}, "", cleanUrl);
      });
  }, []);

  const handleSelectPlan = async (planId: string) => {
    setPayingPlanId(planId);
    try {
      const res = await startPlanCheckout(planId);
      window.location.assign(res.pay_url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "امکان اتصال به درگاه دُنگی‌پی فراهم نشد.");
      setPayingPlanId(null);
    }
  };

  const plan = plans.data?.find((item) => item.id === current?.plan);
  const sortedPlans = sortPlansByPrice(plans.data ?? []);
  const firstMonthEligible = checkoutStatus.data?.first_month_eligible ?? true;
  const expired = access.status === "expired";
  const verifying = access.requiresOnlineVerification;
  const remaining = access.remainingMs == null
    ? null
    : access.remainingMs >= 86_400_000
      ? `${Math.ceil(access.remainingMs / 86_400_000)} روز`
      : `${Math.floor(access.remainingMs / 3_600_000)} ساعت و ${Math.ceil((access.remainingMs % 3_600_000) / 60_000)} دقیقه`;
  const enabled = Object.entries(current?.capabilities ?? {}).filter(
    ([, value]) => administrator || value,
  );

  return (
    <Box>
      <PageGuide section="تنظیمات" sectionTo="/setting" title="اشتراک من" description="وضعیت طرح، زمان باقی‌مانده و دسترسی‌های فعال حساب" icon={StarIcon} helpTopic="account" />

      {paymentBanner ? (
        <Callout.Root
          color={paymentBanner.kind === "success" ? "green" : paymentBanner.kind === "error" ? "red" : "blue"}
          mt="5"
          dir="rtl"
        >
          <Callout.Text>{paymentBanner.text}</Callout.Text>
        </Callout.Root>
      ) : null}

      {expired && (
        <Callout.Root color="red" mt="5" dir="rtl">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            اشتراک شما منقضی شده است. مشاهده موجودی همچنان فعال است، اما عملیات
            نوشتن و قابلیت‌های آنلاین تا تمدید اشتراک محدود هستند. برای تمدید با
            مدیر سامانه تماس بگیرید.
          </Callout.Text>
        </Callout.Root>
      )}

      {expired ? (
        <Callout.Root color="amber" mt="3" dir="rtl">
          <Callout.Text>
            محصولات، فاکتورها، تصاویر و شواهد بازیابی حذف نشده‌اند. کارهای ثبت‌شده روی این دستگاه
            پس از اتصال با سیاست فعلی سرور بررسی می‌شوند؛ نتیجهٔ ردشده یا نامشخص موفق تلقی نمی‌شود.
            وضعیت هر کار را در <Link to="/setting/sync">همگام‌سازی</Link> ببینید و برای تصمیم‌گیری
            دربارهٔ شواهد حل‌نشده به <Link to="/tools/recovery">بازیابی</Link> بروید.
          </Callout.Text>
        </Callout.Root>
      ) : null}

      {verifying && (
        <Callout.Root color="blue" mt="5" dir="rtl">
          <Callout.Icon><ClockIcon /></Callout.Icon>
          <Callout.Text>برای استفاده از امکانات اشتراکی، وضعیت حساب باید به‌صورت آنلاین با سرور تأیید شود.</Callout.Text>
        </Callout.Root>
      )}

      <Callout.Root color="blue" mt="5" dir="rtl">
        <Callout.Icon><DesktopIcon /></Callout.Icon>
        <Callout.Text>
          تعداد دستگاه محدود نیست. استفاده یک مالک روی چند دستگاه مجاز است؛ اما برای کار هم‌زمان چند نفر باید طرح «تیم» فعال باشد و هر نفر با حساب و نقش مستقل وارد شود. اشتراک‌گذاری نام کاربری یا رمز عبور پشتیبانی نمی‌شود.
        </Callout.Text>
      </Callout.Root>

      <Card mt="5" size="3">
        <Flex justify="between" align="start" wrap="wrap" gap="4">
          <Flex align="center" gap="3">
            <Flex
              align="center"
              justify="center"
              className="grid h-12 w-12 place-items-center rounded-xl bg-violet-500/10 text-violet-600"
            >
              <StarIcon width="24" height="24" />
            </Flex>
            <Box>
              <Text size="2" color="gray">
                طرح فعلی
              </Text>
              <Text as="div" size="6" weight="bold">
                {current?.label ?? "اطلاعات اشتراک"}
              </Text>
              <Text size="1" color="gray">
                {current?.plan ?? "—"}
              </Text>
            </Box>
          </Flex>
          <Flex gap="2" align="center" wrap="wrap">
            {administrator && (
              <Badge color="violet" size="2">
                مدیر — دسترسی کامل
              </Badge>
            )}
            <Badge color={expired ? "red" : verifying ? "blue" : access.status === "expiring" ? "amber" : "green"} size="2">
              {expired ? "منقضی" : verifying ? "نیازمند تأیید آنلاین" : access.status === "expiring" ? "نزدیک انقضا" : "فعال"}
            </Badge>
            {current?.entitlement_source === "grant" ? <Badge color="amber" size="2">هدیه زمان‌دار تا {date(current.grant_expires_at)}</Badge> : null}
          </Flex>
        </Flex>

        <Grid columns={{ initial: "1", sm: "2", lg: "4" }} gap="3" mt="5">
          <InfoCard
            icon={
              <Flex align={"center"} justify={"center"} height={"100%"}>
                <CalendarIcon />
              </Flex>
            }
            label="تاریخ خرید / شروع"
            value={date(current?.started_at)}
          />
          <InfoCard
            icon={
              <Flex align={"center"} justify={"center"} height={"100%"}>
                <CalendarIcon />
              </Flex>
            }
            label="تاریخ انقضا"
            value={
              current?.expires_at ? date(current.expires_at) : "بدون انقضا"
            }
            accent={expired ? "red" : undefined}
          />
          <InfoCard
            icon={
              <Flex align={"center"} justify={"center"} height={"100%"}>
                <TimerIcon />
              </Flex>
            }
            label="زمان باقی‌مانده"
            value={remaining ?? "نامحدود"}
            accent={expired ? "red" : "green"}
          />
          <InfoCard
            icon={
              <Flex align={"center"} justify={"center"} height={"100%"}>
                <TokensIcon />
              </Flex>
            }
            label="قیمت طرح"
            value={plan ? formatPlanPrice(plan) : "قیمت تعیین نشده"}
            accent="violet"
          />
        </Grid>

        <Separator size="4" my="5" />
        {current?.entitlement_source === "grant" ? (
          <Callout.Root color="amber" mb="5" dir="rtl">
            <Callout.Text>طرح مؤثر از یک گرنت زمان‌دار است. پس از پایان یا لغو، اشتراک پایه «{current.base_plan ?? current.plan}» بدون حذف داده دوباره مؤثر می‌شود.</Callout.Text>
          </Callout.Root>
        ) : null}
        <Grid columns={{ initial: "1", md: "2" }} gap="5">
          <Box>
            <Text as="div" weight="bold">
              قابلیت‌های فعال
            </Text>
            <Flex direction="column" gap="2" mt="3">
              {enabled.map(([key]) => (
                <Flex key={key} align="center" gap="2">
                  <CheckCircledIcon color="var(--green-9)" />
                  <Text size="2">{FEATURE_LABELS[key] ?? key}</Text>
                </Flex>
              ))}
              {enabled.length === 0 && (
                <Text size="2" color="gray">
                  قابلیت فعالی برای این طرح ثبت نشده است.
                </Text>
              )}
            </Flex>
          </Box>
          <Box>
            <Text as="div" weight="bold">
              سقف استفاده
            </Text>
            <Grid columns="2" gap="3" mt="3">
              <InfoCard
                icon={
                  <Flex align={"center"} justify={"center"} height={"100%"}>
                    <ArchiveIcon />
                  </Flex>
                }
                label="تعداد کالا"
                value={
                  administrator || current?.limits.inventory_items == null
                    ? "نامحدود"
                    : String(current.limits.inventory_items)
                }
              />
              <InfoCard
                icon={
                  <Flex align={"center"} justify={"center"} height={"100%"}>
                    <DesktopIcon />
                  </Flex>
                }
                label="دستگاه فعال"
                value={
                  administrator || current?.limits.devices == null
                    ? "نامحدود"
                    : String(current.limits.devices)
                }
              />
              <InfoCard
                icon={<Flex align="center" justify="center" height="100%"><ArchiveIcon /></Flex>}
                label="کالای کاتالوگی"
                value={administrator || current?.limits.catalog_items == null ? "نامحدود" : String(current.limits.catalog_items)}
              />
              <InfoCard
                icon={<Flex align="center" justify="center" height="100%"><TokensIcon /></Flex>}
                label="پرسنل مستقل"
                value={administrator || current?.limits.active_personnel == null ? "نامحدود" : String(current.limits.active_personnel)}
              />
            </Grid>
            <Flex align="center" gap="2" mt="4">
              <ClockIcon />
              <Text size="1" color="gray">
                آخرین تأیید سرور: {date(current?.verified_at)}
              </Text>
            </Flex>
          </Box>
        </Grid>
        {plan?.description && (
          <Text as="div" size="2" color="gray" mt="5">
            {plan.description}
          </Text>
        )}
        {administrator && (
          <Callout.Root color="violet" mt="5">
            <Callout.Text>
              دسترسی مدیر مستقل از طرح اشتراک است و سرور مجوز کامل مدیریتی را
              اعمال می‌کند.
            </Callout.Text>
          </Callout.Root>
        )}
      </Card>
      <Box mt="6">
        <Flex justify="between" align="center" wrap="wrap" gap="3">
          <Box>
            <Text as="div" size="5" weight="bold">انتخاب و ارتقای طرح اشتراک</Text>
            <Text as="p" size="2" color="gray" mt="1">قابلیت‌های محلی پایه در طرح رایگان باقی می‌مانند؛ ارتقا برای ظرفیت، همگام‌سازی ابری و همکاری امن تیمی است.</Text>
          </Box>
          {firstMonthEligible ? (
            <Badge color="crimson" variant="soft" size="2">
              🎉 تخفیف ویژه ماه اول برای خرید اول فعال است
            </Badge>
          ) : null}
        </Flex>
        <Flex justify="between" align="center" wrap="wrap" gap="3" mt="4">
          <div
            role="tablist"
            aria-label="انتخاب سریع طرح"
            style={{
              display: "inline-flex",
              gap: "6px",
              padding: "5px",
              borderRadius: "999px",
              background: "var(--gray-a3)",
              border: "1px solid var(--gray-a5)",
              overflowX: "auto",
              maxWidth: "100%",
            }}
          >
            {sortedPlans.map((candidate) => {
              const selected = activeSlideId === candidate.id;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => scrollToPlan(candidate.id)}
                  style={{
                    border: "none",
                    borderRadius: "999px",
                    padding: "7px 18px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.2s ease",
                    background: selected ? "var(--violet-9)" : "transparent",
                    color: selected ? "#ffffff" : "var(--gray-12)",
                    boxShadow: selected ? "0 4px 12px rgba(110, 86, 207, 0.35)" : "none",
                  }}
                >
                  {candidate.name}
                  {candidate.id === "pro" ? " ✨" : ""}
                </button>
              );
            })}
          </div>
          <Text size="1" color="gray">← برای مشاهده همه طرح‌ها به چپ یا راست بکشید →</Text>
        </Flex>

        <div
          ref={sliderRef}
          dir="rtl"
          style={{
            display: "flex",
            gap: "16px",
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            scrollBehavior: "smooth",
            padding: "16px 4px 20px 4px",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
          }}
        >
          {sortedPlans.map((candidate) => {
            const isPaid = candidate.id !== "free";
            const isCurrent = current?.plan === candidate.id && !expired;
            const isPro = candidate.id === "pro";
            const hasFirstMonthDiscount =
              firstMonthEligible &&
              isPaid &&
              candidate.first_month_price_toman != null &&
              candidate.price_toman != null &&
              candidate.first_month_price_toman < candidate.price_toman;
            const fa = new Intl.NumberFormat("fa-IR");
            return (
              <div
                key={candidate.id}
                ref={(el) => { cardRefs.current[candidate.id] = el; }}
                onClick={() => setActiveSlideId(candidate.id)}
                style={{
                  flex: "0 0 min(320px, 84vw)",
                  scrollSnapAlign: "center",
                }}
              >
                <Card
                  size="3"
                  style={{
                    height: "100%",
                    borderRadius: "20px",
                    borderColor: isPro ? "var(--violet-9)" : activeSlideId === candidate.id ? "var(--violet-7)" : "var(--gray-a5)",
                    borderWidth: isPro || activeSlideId === candidate.id ? "2px" : "1px",
                    background: isPro
                      ? "linear-gradient(165deg, var(--violet-a2) 0%, var(--iris-a2) 100%)"
                      : undefined,
                    boxShadow: isPro
                      ? "0 18px 36px rgba(110, 86, 207, 0.16)"
                      : "0 8px 24px rgba(0, 0, 0, 0.04)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "16px",
                  }}
                >
                  <Box>
                    <Flex justify="between" align="center" gap="2" wrap="wrap">
                      <Text size="5" weight="bold">{candidate.name}</Text>
                      <Flex gap="1" align="center">
                        {isPro ? <Badge color="violet" variant="solid">محبوب‌ترین</Badge> : null}
                        {hasFirstMonthDiscount && candidate.discount_percent ? (
                          <Badge color="crimson" variant="soft">
                            {fa.format(candidate.discount_percent)}٪ تخفیف ماه اول
                          </Badge>
                        ) : null}
                      </Flex>
                    </Flex>

                    {hasFirstMonthDiscount ? (
                      <Box mt="3">
                        <Text as="div" size="2" color="gray" style={{ textDecoration: "line-through" }}>
                          {fa.format(candidate.price_toman!)} تومان / ماه
                        </Text>
                        <Flex align="baseline" gap="1" mt="1">
                          <Text size="7" weight="bold" color={isPro ? "violet" : "crimson"}>
                            {fa.format(candidate.first_month_price_toman!)}
                          </Text>
                          <Text size="2" weight="bold">تومان</Text>
                          <Text size="1" color="gray">/ ماه اول</Text>
                        </Flex>
                        <Text as="div" size="1" color="gray" mt="1">
                          تمدید ماه‌های بعد: {fa.format(candidate.price_toman!)} تومان
                        </Text>
                      </Box>
                    ) : (
                      <Box mt="3">
                        <Flex align="baseline" gap="1">
                          <Text size="7" weight="bold">
                            {candidate.id === "free" ? "رایگان" : formatPlanPrice(candidate)}
                          </Text>
                          {isPaid ? <Text size="1" color="gray">/ ماه</Text> : null}
                        </Flex>
                        <Text as="div" size="1" color="gray" mt="1">
                          {candidate.id === "free" ? "بدون محدودیت زمانی" : "اشتراک ۳۰ روزه"}
                        </Text>
                      </Box>
                    )}

                    <Box mt="4">
                      {isPaid ? (
                        <Button
                          size="3"
                          className="w-full!"
                          color={isPro ? "violet" : "iris"}
                          variant={isCurrent ? "soft" : "solid"}
                          disabled={isCurrent || administrator || payingPlanId !== null}
                          loading={payingPlanId === candidate.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleSelectPlan(candidate.id);
                          }}
                        >
                          {isCurrent ? "طرح فعلی شما" : `ارتقا به ${candidate.name}`}
                        </Button>
                      ) : (
                        <Button size="3" className="w-full!" variant="soft" color="gray" disabled>
                          {isCurrent ? "طرح فعلی شما" : "طرح پایه رایگان"}
                        </Button>
                      )}
                    </Box>

                    <Separator size="4" my="4" />

                    <Flex direction="column" gap="2">
                      <Flex align="center" gap="2">
                        <CheckCircledIcon color="var(--green-9)" />
                        <Text size="2">تا {candidate.limits.inventory_items?.toLocaleString("fa-IR") ?? "نامحدود"} کالا در انبار</Text>
                      </Flex>
                      <Flex align="center" gap="2">
                        <CheckCircledIcon color="var(--green-9)" />
                        <Text size="2">تا {candidate.limits.catalog_items?.toLocaleString("fa-IR") ?? "نامحدود"} کالای کاتالوگی آماده</Text>
                      </Flex>
                      <Flex align="center" gap="2">
                        <CheckCircledIcon color="var(--green-9)" />
                        <Text size="2">{candidate.features.sync ? "همگام‌سازی ابری آنی بین موبایل و وب" : "استفاده محلی روی همین دستگاه"}</Text>
                      </Flex>
                      <Flex align="center" gap="2">
                        <CheckCircledIcon color="var(--green-9)" />
                        <Text size="2">{candidate.features.personnel ? `مدیریت تیم: مالک + ${candidate.limits.active_personnel ?? 0} همکار` : "تک‌کاربره (مالک فروشگاه)"}</Text>
                      </Flex>
                      <Flex align="center" gap="2">
                        <CheckCircledIcon color="var(--green-9)" />
                        <Text size="2">فاکتور خرید و فروش، بارکدخوان و چاپ لیبل</Text>
                      </Flex>
                    </Flex>
                  </Box>
                </Card>
              </div>
            );
          })}
        </div>
      </Box>
      <Text as="div" size="2" color="gray" mt="3">
        پرداخت آنلاین به‌صورت امن از طریق درگاه دُنگی‌پی (pdongi.ir) انجام می‌شود و اشتراک بلافاصله پس از تأیید پرداخت فعال می‌گردد.
      </Text>
    </Box>
  );
}
