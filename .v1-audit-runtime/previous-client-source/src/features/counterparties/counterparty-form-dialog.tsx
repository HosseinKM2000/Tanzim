import { Button } from "@/shared/ui/button/button";
import { Form } from "@/shared/ui/form/form";
import { Box, Dialog, Text, TextArea, TextField } from "@radix-ui/themes";
import { Building2, MapPin, Phone, Plus, Save, UserRound, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { Counterparty, CounterpartyInput } from "./api";

type Props = {
  item: Counterparty | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CounterpartyInput) => void;
};

const EMPTY_FORM: CounterpartyInput = { kind: "person", name: "", phone: null, address: null };

export function CounterpartyFormDialog({ item, loading, onOpenChange, onSubmit }: Props) {
  const [form, setForm] = useState<CounterpartyInput>(() => item
    ? { kind: item.kind, name: item.name, phone: item.phone, address: item.address }
    : EMPTY_FORM);
  const editing = item !== null;
  const isDirty = item
    ? form.kind !== item.kind || form.name !== item.name || form.phone !== item.phone || form.address !== item.address
    : Boolean(form.name || form.phone || form.address || form.kind !== "person");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    onSubmit({
      kind: form.kind,
      name,
      phone: form.phone?.trim() || null,
      address: form.address?.trim() || null,
    });
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!loading) onOpenChange(open); }}>
      <Dialog.Content dir="rtl" maxWidth="500px" className="counterparty-dialog" aria-describedby="counterparty-dialog-description">
        <div className="counterparty-dialog-handle" aria-hidden="true" />
        <Dialog.Close>
          <button type="button" className="counterparty-dialog-close" aria-label="بستن فرم">
            <X aria-hidden="true" />
          </button>
        </Dialog.Close>

        <div className="counterparty-dialog-heading">
          <span className="counterparty-dialog-icon" aria-hidden="true">{editing ? <Save /> : <Plus />}</span>
          <div>
            <Dialog.Title>{editing ? "ویرایش طرف‌حساب" : "افزودن طرف‌حساب"}</Dialog.Title>
            <Dialog.Description id="counterparty-dialog-description" size="2" color="gray">
              {editing ? "اطلاعات فرد یا مجموعه را اصلاح کنید." : "اطلاعات طرف‌حساب جدید را وارد کنید."}
            </Dialog.Description>
          </div>
        </div>

        <Form onSubmit={submit} isSubmitting={loading} isDirty={isDirty} className="counterparty-dialog-form">
          <fieldset className="counterparty-kind-fieldset">
            <legend>نوع طرف‌حساب</legend>
            <div className="counterparty-kind-switch">
              <button
                type="button"
                data-active={form.kind === "person" || undefined}
                aria-pressed={form.kind === "person"}
                onClick={() => setForm((current) => ({ ...current, kind: "person" }))}
              >
                <UserRound aria-hidden="true" /> فرد
              </button>
              <button
                type="button"
                data-active={form.kind === "organization" || undefined}
                aria-pressed={form.kind === "organization"}
                onClick={() => setForm((current) => ({ ...current, kind: "organization" }))}
              >
                <Building2 aria-hidden="true" /> مجموعه
              </button>
            </div>
          </fieldset>

          <label className="counterparty-field">
            <span>نام <b aria-hidden="true">*</b></span>
            <TextField.Root
              size="3"
              aria-label="نام طرف‌حساب"
              autoFocus
              required
              maxLength={160}
              value={form.name}
              placeholder={form.kind === "person" ? "مثلاً علی رضایی" : "مثلاً فروشگاه سپهر"}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            >
              <TextField.Slot side="right"><UserRound aria-hidden="true" /></TextField.Slot>
            </TextField.Root>
            <Text size="1" color="gray">نام واضح و یکتا، انتخاب طرف‌حساب در فاکتور را سریع‌تر می‌کند.</Text>
          </label>

          <label className="counterparty-field">
            <span>تلفن <small>(اختیاری)</small></span>
            <TextField.Root
              size="3"
              dir="ltr"
              inputMode="tel"
              aria-label="تلفن طرف‌حساب"
              maxLength={32}
              value={form.phone ?? ""}
              placeholder="0912..."
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            >
              <TextField.Slot><Phone aria-hidden="true" /></TextField.Slot>
            </TextField.Root>
            <Text size="1" color="gray">برای تماس سریع‌تر، شماره تلفن را وارد کنید.</Text>
          </label>

          <label className="counterparty-field">
            <span>نشانی <small>(اختیاری)</small></span>
            <Box className="counterparty-address-field">
              <MapPin aria-hidden="true" />
              <TextArea
                aria-label="نشانی طرف‌حساب"
                maxLength={300}
                rows={3}
                value={form.address ?? ""}
                placeholder="مثلاً تهران، خیابان مطهری، پلاک ۴۵"
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              />
            </Box>
            <Text size="1" color="gray">ثبت نشانی به پیگیری خرید، فروش و ارسال‌ها کمک می‌کند.</Text>
          </label>

          <Button type="submit" className="counterparty-dialog-submit" loading={loading} disabled={!form.name.trim()}>
            {editing ? <Save aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {editing ? "ذخیره تغییرات" : "افزودن"}
          </Button>
        </Form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
