import { EnvelopeClosedIcon, LockClosedIcon } from "@radix-ui/react-icons";
import { Callout } from "@radix-ui/themes";
import { Link as RouterLink } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";

import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/ui/button/button";
import { TextInput } from "@/shared/ui/form/input/text-input";

import { requestPasswordRecovery } from "../api/auth.api";
import { AuthPageShell } from "./AuthPageShell";

export default function PasswordRecovery() {
  const [identifier, setIdentifier] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [identifierError, setIdentifierError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!identifier.trim()) {
      setIdentifierError(true);
      document.getElementById("recovery-identifier")?.focus();
      return;
    }
    setPending(true);
    setRateLimited(false);
    setIdentifierError(false);
    try {
      await requestPasswordRecovery(identifier.trim());
      setSubmitted(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) setRateLimited(true);
      else setSubmitted(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthPageShell
      title="بازیابی رمز عبور"
      description="درخواست بازیابی را بدون افشای وجود یا نبود حساب ثبت کنید."
      badge="حفاظت از هویت و جلوگیری از سوءاستفاده"
      badgeIcon={<LockClosedIcon />}
      switchText="رمز عبور را به خاطر آوردید؟"
      switchLabel="بازگشت به ورود"
      switchTo="/auth/login"
      trustText="شماره موبایل ثبت‌شده تا زمان تأیید مالکیت، مجوز بازیابی حساب نیست."
    >
      <section className="auth-card" aria-labelledby="recovery-form-title">
        <h2 id="recovery-form-title" className="auth-section-title">ثبت درخواست امن</h2>
        <p className="auth-field-description">نام کاربری یا شماره موبایل ثبت‌شده را وارد کنید. پاسخ برای همه درخواست‌ها یکسان است.</p>
        {submitted ? (
          <Callout.Root color="blue" role="status" aria-live="polite" className="auth-server-error">
            <Callout.Text>درخواست ثبت شد. اگر حساب شما کانال تأییدشده‌ای داشته باشد، راهنمای بازیابی از همان کانال ارسال می‌شود. در نسخه فعلی هنوز کانال تأییدشده‌ای فعال نیست؛ هیچ کد یا پیوندی صادر نشده است.</Callout.Text>
          </Callout.Root>
        ) : (
          <form className="auth-form" noValidate onSubmit={submit}>
            <div className="auth-field">
              <label className="auth-field-label" htmlFor="recovery-identifier"><EnvelopeClosedIcon aria-hidden="true" /> نام کاربری یا شماره موبایل</label>
              <TextInput id="recovery-identifier" className="auth-input" name="identifier" autoComplete="username" spellCheck={false} dir="auto" value={identifier} onChange={(event) => { setIdentifier(event.target.value); setIdentifierError(false); }} required aria-invalid={identifierError} aria-describedby="recovery-identifier-help" />
              <p id="recovery-identifier-help" className={identifierError ? "auth-field-error" : "auth-field-description"}>{identifierError ? "نام کاربری یا شماره موبایل را وارد کنید." : "اطلاعات واردشده در گزارش امنیتی به‌شکل هش‌شده ثبت می‌شود."}</p>
            </div>
            {rateLimited ? <p className="auth-field-error" role="alert">تعداد درخواست‌ها زیاد است. پس از پایان بازه محدودیت دوباره تلاش کنید.</p> : null}
            <Button type="submit" className="auth-submit" loading={pending}>ثبت درخواست بازیابی</Button>
          </form>
        )}
        <p className="auth-inline-notice"><RouterLink to="/legal/privacy">نحوه حفاظت از داده‌ها</RouterLink></p>
      </section>
    </AuthPageShell>
  );
}
