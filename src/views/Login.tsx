/* ── صفحه ورود پویا (بند ۱۶ سند — Branding Engine) ── */
import { useEffect, useState } from "react";
import { Logo, Icon } from "../components/icons";
import { Btn, useNow } from "../components/ui";
import { login, useDB } from "../lib/store";
import type { User } from "../lib/types";
import { dateTitle, todayKey, nowHMS, fa } from "../lib/jalali";


export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const db = useDB();
  const b = db.branding;
  const [username, setUsername] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useNow(1000);
  const [serverOnline, setServerOnline] = useState(false);
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const result = await response.json();
        if (active) setServerOnline(response.ok && result?.ok === true && result?.database === "connected");
      } catch { if (active) setServerOnline(false); }
    };
    void check();
    const timer = window.setInterval(check, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const doLogin = (u = username, p = pass) => {
    setErr(""); setBusy(true);
    void login(u, p).then(onLogin).catch((e: any) => setErr(e?.message || "ورود ناموفق بود")).finally(() => setBusy(false));
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[460px_1fr] bg-bg">
      {/* ── پنل ورود ── */}
      <div className="flex flex-col justify-between p-8 lg:p-10 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1.5 hz" />
        <div className="a-fadeup">
          <div className="flex items-center gap-3.5">
            <Logo size={52} />
            <div>
              <div className="font-disp text-3xl leading-none tracking-wide">{b.logoText}</div>
              <div className="text-[11px] text-mut mt-1 font-semibold">{b.subtitle}</div>
            </div>
          </div>
          <h1 className="font-disp text-[26px] mt-9 leading-snug">{b.title}</h1>
          <p className="text-sm text-mut leading-7 mt-2 max-w-sm">{b.welcome}</p>

          <form className="mt-8 space-y-4 max-w-sm" onSubmit={e => { e.preventDefault(); doLogin(); }}>
            <div>
              <label className="lbl">نام کاربری</label>
              <div className="relative">
                <Icon name="user" size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-mut" />
                <input className="inp pr-9" dir="ltr" style={{ textAlign: "left" }} value={username}
                  onChange={e => setUsername(e.target.value)} placeholder="username" autoFocus autoComplete="username" />
              </div>
            </div>
            <div>
              <label className="lbl">رمز عبور</label>
              <div className="relative">
                <Icon name="lock" size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-mut" />
                <input className="inp pr-9 pl-10" dir="ltr" style={{ textAlign: "left" }}
                  type={showPass ? "text" : "password"} value={pass} onChange={e => setPass(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password" />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-mut hover:text-ink">
                  <Icon name={showPass ? "eye" : "lock"} size={16} />
                </button>
              </div>
            </div>
            {err && (
              <div className="flex items-center gap-2 text-nok bg-nok/10 border border-nok/30 rounded-lg px-3.5 py-2.5 text-sm a-pop">
                <Icon name="alert" size={17} /> {err}
              </div>
            )}
            <Btn kind="primary" size="lg" className="w-full !py-3.5 text-base" disabled={busy || !username || !pass}>
              {busy ? <span className="flex items-center gap-2"><Icon name="sync" size={18} className="animate-spin" />در حال احراز هویت…</span> : "ورود به سامانه"}
            </Btn>
          </form>

        </div>

        <div className="mt-10 a-fadeup" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center gap-2 text-xs text-mut">
            <span className={`w-2 h-2 rounded-full ${serverOnline ? "bg-ok dot-live" : "bg-nok"}`} />
            {serverOnline ? "اتصال به سرور و پایگاه داده برقرار است" : "در انتظار اتصال به سرور مرکزی"}
            <span className="mr-auto tabnums">نسخه {b.version}</span>
          </div>
          <p className="text-[11px] text-mut mt-2">{b.footer}</p>
        </div>
      </div>

      {/* ── کاور صنعتی ── */}
      <div className="relative hidden lg:block overflow-hidden">
        <div aria-label="پس‌زمینه صنعتی NIPCO" className="industrial-cover absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-l from-[var(--bg)] via-transparent to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
        <div className="absolute bottom-0 inset-x-0 p-10">
          <div className="a-fadeup" style={{ animationDelay: "250ms" }}>
            <div className="font-disp text-4xl text-white leading-relaxed">
              کنترل روزانه تجهیزات؛<br />
              <span className="text-[var(--acc)]">پیش از آنکه خط بایستد.</span>
            </div>
            <p className="text-white/70 text-sm mt-4 max-w-md leading-7">
              بازرسی شیفتی پرس‌ها، ربات‌ها، کمپرسورها و لیفتراک‌ها — با ثبت وضعیت تجهیزات، مستندسازی نتایج کنترل و گزارش‌گیری نگهداری و تعمیرات.
            </p>
            <div className="flex items-center gap-6 mt-6 text-white/85 text-sm">
              <span className="flex items-center gap-2"><Icon name="calendar" size={17} className="text-[var(--acc)]" /><span className="tabnums">{fa(dateTitle(todayKey()))}</span></span>
              <span className="flex items-center gap-2 tabnums"><Icon name="clock" size={17} className="text-[var(--acc)]" />{nowHMS()}</span>
              <span className="flex items-center gap-2"><Icon name="factory" size={17} className="text-[var(--acc)]" />تجهیزات و خطوط تولید</span>
            </div>
          </div>
        </div>
        <div className="absolute top-0 inset-x-0 h-1.5 hz" />
      </div>
    </div>
  );
}
