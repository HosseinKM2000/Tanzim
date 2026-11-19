import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { Link as RouterLink } from "@tanstack/react-router";

import "./auth-pages.css";

type LegalStatusPageProps = {
  kind: "terms" | "privacy";
};

const content = {
  terms: {
    title: "وضعیت قوانین استفاده",
    description: "متن الزام‌آور قوانین استفاده هنوز از سوی مالک محصول و مشاور حقوقی تأیید و نسخه‌گذاری نشده است.",
    requirements: ["دامنه خدمات و محدودیت‌های نسخه V1", "شرایط حساب، اشتراک و خاتمه خدمت", "مسئولیت‌ها، پشتیبانی و روش اعلام تغییرات"],
  },
  privacy: {
    title: "وضعیت حریم خصوصی",
    description: "سیاست حریم خصوصی نهایی هنوز تأیید و منتشر نشده است. این صفحه جایگزین سند حقوقی مصوب نیست.",
    requirements: ["هدف و مبنای پردازش هر گروه داده", "مدت نگهداری، حذف، خروجی و بازیابی", "ارائه‌دهندگان، محل پردازش و راه ارتباطی صاحب داده"],
  },
} as const;

export function LegalStatusPage({ kind }: LegalStatusPageProps) {
  const page = content[kind];
  return (
    <main className="auth-page legal-page" dir="rtl">
      <section className="legal-shell" aria-labelledby="legal-title">
        <p className="legal-kicker"><ExclamationTriangleIcon aria-hidden="true" /> وضعیت انتشار حقوقی</p>
        <h1 id="legal-title" className="auth-page-title">{page.title}</h1>
        <p className="auth-page-description">{page.description}</p>
        <div className="auth-card legal-card">
          <h2>موارد لازم پیش از انتشار</h2>
          <ul>{page.requirements.map((item) => <li key={item}>{item}</li>)}</ul>
          <p>تا پیش از ثبت تأیید رسمی، برنامه هیچ نسخه رضایت یا زمان پذیرشی را به حساب کاربر نسبت نمی‌دهد.</p>
        </div>
        <nav className="legal-actions" aria-label="پیوندهای حساب و اسناد حقوقی">
          <RouterLink to="/auth/register">بازگشت به ساخت حساب</RouterLink>
          <RouterLink to={kind === "terms" ? "/legal/privacy" : "/legal/terms"}>{kind === "terms" ? "وضعیت حریم خصوصی" : "وضعیت قوانین استفاده"}</RouterLink>
        </nav>
      </section>
    </main>
  );
}
