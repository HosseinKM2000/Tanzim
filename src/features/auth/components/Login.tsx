import { LockClosedIcon, PersonIcon } from "@radix-ui/react-icons";
import { Callout } from "@radix-ui/themes";
import { Link as RouterLink } from "@tanstack/react-router";

import { useAppForm } from "@/shared/lib/form/use-app-form";
import { preventEventHandler } from "@/shared/lib/prevent-event";
import { Button } from "@/shared/ui/button/button";
import { Form } from "@/shared/ui/form/form";
import { PasswordInput } from "@/shared/ui/form/input/password-input";
import { TextInput } from "@/shared/ui/form/input/text-input";

import { authErrorMessage } from "../auth-error";
import { useLogin } from "../mutations/use-register";
import { loginSchema } from "../validators/login.schema";
import { AuthPageShell } from "./AuthPageShell";

function LoginComponent() {
  const loginMutation = useLogin();
  const form = useAppForm({
    schema: loginSchema,
    initialValues: { username: "", password: "", remember: false },
    onSubmit(values) { loginMutation.mutate(values); },
  });
  const serverError = loginMutation.isError
    ? authErrorMessage(loginMutation.error, "ورود ناموفق بود. اتصال اینترنت را بررسی و دوباره تلاش کنید.")
    : null;

  return (
    <AuthPageShell
      title="ورود به تنظیم"
      description="با نام کاربری یا شماره موبایل وارد شوید و مدیریت موجودی، فروش و ابزارها را ادامه دهید."
      badge="ورود امن و سریع به حساب کاربری"
      badgeIcon={<LockClosedIcon />}
      switchText="هنوز حساب ندارید؟"
      switchLabel="ساخت حساب"
      switchTo="/auth/register"
      trustText="اطلاعات شما به‌صورت امن نگهداری می‌شود."
    >
      <section className="auth-card" aria-label="فرم ورود">
        {serverError ? <Callout.Root color="red" dir="rtl" className="auth-server-error" role="alert"><Callout.Text>{serverError}</Callout.Text></Callout.Root> : null}
        <Form isDirty={form.isDirty} isSubmitting={loginMutation.isPending} onSubmit={preventEventHandler(form.submit)} className="auth-form" noValidate>
          <div className="auth-field">
            <label className="auth-field-label" htmlFor="login-identifier"><PersonIcon /> نام کاربری یا شماره موبایل</label>
            <TextInput id="login-identifier" className="auth-input" name="username" size="3" autoComplete="username" dir="auto" placeholder="مثلاً HosseinKM2000 یا ۰۹۱۲۳۴۵۶۷۸۹" value={form.values.username} onChange={form.handleChange} aria-invalid={Boolean(form.errors.username)} aria-describedby="login-identifier-help" />
            <p id="login-identifier-help" className={form.errors.username ? "auth-field-error" : "auth-field-description"}>{form.errors.username ?? "با نام کاربری ثبت‌شده یا شماره موبایل خود وارد شوید."}</p>
          </div>

          <div className="auth-field">
            <label className="auth-field-label" htmlFor="login-password"><LockClosedIcon /> رمز عبور</label>
            <PasswordInput id="login-password" className="auth-input" name="password" size="3" eyeSide="left" autoComplete="current-password" placeholder="رمز عبور خود را وارد کنید" value={form.values.password} onChange={form.handleChange} aria-invalid={Boolean(form.errors.password)} aria-describedby={form.errors.password ? "login-password-error" : undefined} />
            {form.errors.password ? <p id="login-password-error" className="auth-field-error">{form.errors.password}</p> : null}
          </div>

          <div className="auth-login-options">
            <label className="auth-remember"><input type="checkbox" name="remember" checked={form.values.remember} onChange={(event) => form.setValue("remember", event.target.checked)} /> مرا به خاطر بسپار</label>
            <RouterLink className="auth-recovery" to="/auth/recovery">رمز عبور را فراموش کرده‌اید؟</RouterLink>
          </div>
          <Button type="submit" className="auth-submit" loading={loginMutation.isPending}>ورود</Button>
        </Form>
      </section>
    </AuthPageShell>
  );
}

export default LoginComponent;
