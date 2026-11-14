import { PageGuide } from "@/features/app/layout/page-guide";
import { accessState } from "@/shared/access/access-state";
import { OnlineGuard } from "@/shared/access/online-guard";
import { userErrorMessage } from "@/shared/lib/presentation/user-error";
import { Button } from "@/shared/ui/button/button";
import { ConfirmDialog } from "@/shared/ui/dialog/confirm-dialog";
import { PersonIcon } from "@radix-ui/react-icons";
import { Box, Callout, Card, Flex, IconButton, Spinner, Text, TextField } from "@radix-ui/themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Ellipsis, MapPin, Pencil, Phone, Plus, Search, UserRound, UsersRound } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";

import { counterpartiesApi, counterpartyKeys, type Counterparty, type CounterpartyInput } from "./api";
import { CounterpartyFormDialog } from "./counterparty-form-dialog";

type KindFilter = "all" | Counterparty["kind"];

const FILTERS: Array<{ value: KindFilter; label: string; icon: typeof UserRound }> = [
  { value: "all", label: "همه", icon: UsersRound },
  { value: "person", label: "فرد", icon: UserRound },
  { value: "organization", label: "مجموعه", icon: Building2 },
];

export function CounterpartiesPage() {
  return (
    <Box dir="rtl" className="counterparties-page mx-auto w-full max-w-5xl">
      <PageGuide
        section="ابزارها"
        sectionTo="/tools"
        title="طرف‌حساب‌ها"
        description="افراد و مجموعه‌هایی که با آن‌ها خرید یا فروش دارید."
        icon={PersonIcon}
        helpTopic="invoices"
      />
      <OnlineGuard><CounterpartiesContent /></OnlineGuard>
    </Box>
  );
}

function CounterpartiesContent() {
  const client = useQueryClient();
  const canManage = accessState.hasStorePermission("counterparties.manage");
  const hasInvoiceAccess = accessState.canUse("invoices.purchase") || accessState.canUse("invoices.sale");
  const query = useQuery({ queryKey: counterpartyKeys.all, queryFn: counterpartiesApi.list, enabled: hasInvoiceAccess });
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("fa-IR"));
  const [kind, setKind] = useState<KindFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Counterparty | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Counterparty | null>(null);

  const refresh = () => client.invalidateQueries({ queryKey: counterpartyKeys.all });
  const save = useMutation({
    mutationFn: (input: CounterpartyInput) => editing == null
      ? counterpartiesApi.create(input)
      : counterpartiesApi.update(editing.id, input),
    onSuccess: () => {
      toast.success(editing == null ? "طرف‌حساب اضافه شد" : "تغییرات ذخیره شد");
      setFormOpen(false);
      setEditing(null);
      void refresh();
    },
    onError: (error) => toast.error(userErrorMessage(error, "ذخیره طرف‌حساب انجام نشد.")),
  });
  const remove = useMutation({
    mutationFn: counterpartiesApi.remove,
    onSuccess: () => {
      toast.success("طرف‌حساب حذف شد");
      setDeleteTarget(null);
      void refresh();
    },
    onError: (error) => toast.error(userErrorMessage(error, "حذف طرف‌حساب انجام نشد.")),
  });

  const visible = useMemo(() => (query.data ?? []).filter((item) => {
    if (kind !== "all" && item.kind !== kind) return false;
    if (!deferredSearch) return true;
    return [item.name, item.phone, item.address]
      .some((value) => value?.toLocaleLowerCase("fa-IR").includes(deferredSearch));
  }), [deferredSearch, kind, query.data]);

  if (!hasInvoiceAccess) {
    return <Callout.Root color="amber"><Callout.Text>این بخش در طرح فعلی شما فعال نیست.</Callout.Text></Callout.Root>;
  }

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: Counterparty) => {
    setEditing(item);
    setFormOpen(true);
  };

  return (
    <div className="counterparties-workspace">
      {!canManage ? (
        <Callout.Root color="amber">
          <Callout.Text>دسترسی شما فقط برای مشاهده طرف‌حساب‌هاست.</Callout.Text>
        </Callout.Root>
      ) : null}

      <section className="counterparty-directory" aria-label="فهرست طرف‌حساب‌ها">
        <div className="counterparty-toolbar">
          {canManage ? (
            <Button className="counterparty-add-button" onClick={openCreate}>
              <Plus aria-hidden="true" />
              افزودن طرف‌حساب
            </Button>
          ) : null}

          <TextField.Root
            className="counterparty-search"
            size="3"
            value={search}
            placeholder="جست‌وجوی نام یا تلفن"
            aria-label="جست‌وجوی نام یا تلفن"
            onChange={(event) => setSearch(event.target.value)}
          >
            <TextField.Slot><Search size={19} aria-hidden="true" /></TextField.Slot>
          </TextField.Root>

          <div className="counterparty-kind-filters" role="group" aria-label="فیلتر نوع طرف‌حساب">
            {FILTERS.map((filter) => {
              const Icon = filter.icon;
              return (
                <button
                  key={filter.value}
                  type="button"
                  className="counterparty-kind-filter"
                  data-active={kind === filter.value || undefined}
                  aria-pressed={kind === filter.value}
                  onClick={() => setKind(filter.value)}
                >
                  <Icon size={18} aria-hidden="true" />
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>

        {query.isLoading ? (
          <Flex justify="center" py="8"><Spinner size="3" /></Flex>
        ) : query.isError ? (
          <Callout.Root color="red"><Callout.Text>دریافت طرف‌حساب‌ها انجام نشد.</Callout.Text></Callout.Root>
        ) : visible.length === 0 ? (
          <Card className="counterparty-empty-state">
            <Flex direction="column" align="center" gap="3" py="8">
              <span className="counterparty-empty-icon"><UsersRound aria-hidden="true" /></span>
              <Text weight="bold">{deferredSearch || kind !== "all" ? "موردی پیدا نشد" : "هنوز طرف‌حسابی ثبت نشده است"}</Text>
              <Text size="2" color="gray">{deferredSearch || kind !== "all" ? "جست‌وجو یا فیلتر را تغییر دهید." : "اولین فرد یا مجموعه را به فهرست اضافه کنید."}</Text>
              {canManage && !deferredSearch && kind === "all" ? <Button variant="soft" onClick={openCreate}><Plus />افزودن طرف‌حساب</Button> : null}
            </Flex>
          </Card>
        ) : (
          <div className="counterparty-list">
            {visible.map((item) => (
              <article key={item.id} className="counterparty-card" data-kind={item.kind}>
                <div className="counterparty-card-identity">
                  <span className="counterparty-avatar" data-kind={item.kind} aria-hidden="true">
                    {item.kind === "organization" ? <Building2 /> : <UserRound />}
                  </span>
                  <div className="counterparty-card-title">
                    <Text as="div" size="4" weight="bold">{item.name}</Text>
                    <span className="counterparty-kind-badge">
                      {item.kind === "organization" ? <Building2 /> : <UserRound />}
                      {item.kind === "organization" ? "مجموعه" : "فرد"}
                    </span>
                  </div>
                </div>

                <div className="counterparty-card-meta">
                  <span className="counterparty-card-detail" data-empty={!item.phone || undefined}>
                    <Phone aria-hidden="true" />
                    <span dir={item.phone ? "ltr" : undefined}>{item.phone || "تلفن ثبت نشده"}</span>
                  </span>
                  <span className="counterparty-card-detail" data-empty={!item.address || undefined}>
                    <MapPin aria-hidden="true" />
                    <span>{item.address || "نشانی ثبت نشده"}</span>
                  </span>
                </div>

                {canManage ? (
                  <div className="counterparty-card-actions">
                    <IconButton variant="soft" aria-label={`ویرایش ${item.name}`} onClick={() => openEdit(item)}>
                      <Pencil aria-hidden="true" />
                    </IconButton>
                    <IconButton variant="soft" color="gray" aria-label={`حذف ${item.name}`} onClick={() => setDeleteTarget(item)}>
                      <Ellipsis aria-hidden="true" />
                    </IconButton>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {formOpen ? (
        <CounterpartyFormDialog
          item={editing}
          loading={save.isPending}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditing(null);
          }}
          onSubmit={(input) => save.mutate(input)}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="حذف طرف‌حساب؟"
        description={deleteTarget ? `«${deleteTarget.name}» از فهرست حذف می‌شود؛ فاکتورهای قبلی بدون تغییر می‌مانند.` : ""}
        confirmLabel="حذف"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => { if (deleteTarget) remove.mutate(deleteTarget.id); }}
      />
    </div>
  );
}
