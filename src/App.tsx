/* ── NIPCO Daily Equipment Control System — پوسته اصلی ── */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, Logo } from "./components/icons";
import { Badge, Btn, useNow } from "./components/ui";
import Login from "./views/Login";
import Dashboard from "./views/Dashboard";
import Control from "./views/Control";
import ControlForm, { PrintSheet } from "./views/ControlForm";
import Reports from "./views/Reports";
import History from "./views/History";
import Manage from "./views/Manage";
import Settings from "./views/Settings";
import { useDB, getSessionUser, getStartupStorageIssue, restoreSession, logout, can, userGroupVisible, refreshRemoteState, printBus, toastBus, eqById, groupById, type PrintPayload } from "./lib/store";
import type { User } from "./lib/types";
import { dateTitle, todayKey, nowHMS, fa } from "./lib/jalali";

type Route = { name: string; params: any; n: number };

export default function App() {
  const db = useDB();
  const [user, setUser] = useState<User | null>(getSessionUser());
  const [authReady, setAuthReady] = useState(false);
  const [route, setRoute] = useState<Route>({ name: "dashboard", params: {}, n: 0 });
  const [online, setOnline] = useState(navigator.onLine);
  const [toasts, setToasts] = useState<{ id: string; text: string; kind: string }[]>([]);
  const [print, setPrint] = useState<PrintPayload | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);

  useEffect(() => {
    if (user && !getSessionUser()) setUser(null);
  }, [db, user]);

  useEffect(() => {
    let alive = true;
    restoreSession().then(restored => { if (alive) setUser(restored); }).finally(() => { if (alive) setAuthReady(true); });
    return () => { alive = false; };
  }, []);

  /* تم + برندینگ پویا */
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = db.theme || "industrial";
    if (db.branding.primary) root.style.setProperty("--acc", db.branding.primary);
    if (db.branding.radius != null) root.style.setProperty("--radius", `${db.branding.radius}px`);
  }, [db.theme, db.branding.primary, db.branding.radius]);

  /* شبکه + موتور Sync */
  useEffect(() => {
    const on = () => { setOnline(true); void refreshRemoteState(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const poll = window.setInterval(() => { if (navigator.onLine) void refreshRemoteState(); }, 15000);
    return () => { window.clearInterval(poll); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  /* Toast ها */
  useEffect(() => toastBus.on(t => {
    setToasts(p => [...p, t]);
    setTimeout(() => setToasts(p => p.filter(x => x.id !== t.id)), 3800);
  }), []);

  /* موتور چاپ */
  useEffect(() => {
    const un = printBus.on(p => { setPrint(p); setTimeout(() => window.print(), 320); });
    const after = () => setPrint(null);
    window.addEventListener("afterprint", after);
    return () => { un(); window.removeEventListener("afterprint", after); };
  }, []);

  const nav = (name: string, params: any = {}) => {
    const permission: Record<string, string> = { dashboard: "dashboard:view", control: "control:view", form: "control:view", history: "reports:view", reports: "reports:view", manage: "equipment:view", settings: "settings:view" };
    const current = getSessionUser();
    const eq = name === "form" ? eqById(db, params.equipmentId || "") : undefined;
    const target = params.controlId ? db.controls.find(c => c.id === params.controlId) : undefined;
    if (!current || !permission[name] || !can(permission[name]) ||
      (name === "form" && (!eq || !userGroupVisible(current, eq.groupId) || (params.controlId && (!target || target.equipmentId !== eq.id))))) {
      toastBus.send("دسترسی به این بخش یا تجهیز مجاز نیست", "err");
      return;
    }
    setRoute(r => ({ name, params, n: r.n + 1 }));
    setSideOpen(false); setBellOpen(false);
  };

  const today = todayKey();
  const notifs = useMemo(() => {
    const out: { id: string; icon: string; tone: string; text: string; go: () => void }[] = [];
    db.controls.filter(c => c.dateKey === today && c.status === "nok" && !!user && userGroupVisible(user, eqById(db, c.equipmentId)?.groupId || "")).slice(0, 5).forEach(c => {
      const eq = eqById(db, c.equipmentId);
      out.push({ id: c.id, icon: "alert", tone: "text-nok", text: `انحراف ثبت‌شده: ${eq?.name || "تجهیز"}`, go: () => nav("form", { equipmentId: c.equipmentId, controlId: c.id }) });
    });
    if (!out.length) out.push({ id: "none", icon: "check", tone: "text-ok", text: "اعلان جدیدی وجود ندارد", go: () => { } });
    return out;
  }, [db, today, user]);

  if (!authReady) return <div className="min-h-screen flex items-center justify-center bg-bg text-mut text-sm">در حال بررسی نشست امن و اتصال به پایگاه داده…</div>;

  const storageIssue = getStartupStorageIssue();
  if (storageIssue) {
    const downloadRecovery = () => {
      if (storageIssue.recovery === null) return;
      const url = URL.createObjectURL(new Blob([storageIssue.recovery], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "control-browser-recovery.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return <div className="min-h-screen flex items-center justify-center p-6 bg-bg">
      <div className="card max-w-xl p-7 space-y-4 text-right">
        <h1 className="font-disp text-xl text-nok">خطای راه‌اندازی سامانه</h1>
        <p className="text-sm text-mut leading-7">{storageIssue.message}</p>
        <p className="text-xs text-mut leading-6">پایگاه داده در مرورگر نگهداری نمی‌شود. برای رفع خطا، اتصال سرور و گزارش نصب را بررسی کنید.</p>
        {storageIssue.recovery !== null && <Btn kind="soft" onClick={downloadRecovery}><Icon name="download" size={16} />دریافت فایل خام برای بازیابی</Btn>}
      </div>
    </div>;
  }

  if (!user) {
    return (
      <>
        <Login onLogin={u => { setUser(u); nav("dashboard"); }} />
        <ToastHost toasts={toasts} />
      </>
    );
  }

  const NAV = [
    { id: "dashboard", label: "داشبورد", icon: "dashboard", perm: "dashboard:view" },
    { id: "control", label: "کنترل روزانه", icon: "clipboard", perm: "control:view" },
    { id: "history", label: "سابقه کنترل روزانه", icon: "history", perm: "reports:view" },
    { id: "form", label: "فرم کنترل", icon: "edit", perm: "control:view", hidden: true },
    { id: "reports", label: "گزارشات", icon: "chart", perm: "reports:view" },
    { id: "manage", label: "تجهیزات و گروه‌ها", icon: "layers", perm: "equipment:view" },
    { id: "settings", label: "تنظیمات", icon: "cog", perm: "settings:view" },
  ];



  return (
    <div id="app-shell" className="min-h-screen flex">
      {/* ── Sidebar ── */}
      <aside className={`fixed lg:static inset-y-0 right-0 z-50 w-60 bg-panel border-l border-line flex flex-col transition-transform lg:translate-x-0 ${sideOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}`}>
        <div className="flex items-center gap-3 px-5 h-16 border-b border-line">
          <Logo size={36} />
          <div>
            <div className="font-disp text-xl leading-none" style={{ color: "var(--acc)" }}>{db.branding.logoText}</div>
            <div className="text-[9.5px] text-mut mt-0.5 font-semibold">کنترل روزانه تجهیزات</div>
          </div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV.filter(n => !n.hidden && can(n.perm)).map(n => (
            <button key={n.id} onClick={() => nav(n.id)}
              className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-bold transition-all ${route.name === n.id ? "bg-acc/12 text-acc" : "text-mut hover:text-ink hover:bg-panel2"}`}>
              {route.name === n.id && <span className="absolute right-0 top-2 bottom-2 w-[3px] rounded-full bg-acc" />}
              <Icon name={n.icon} size={18} />{n.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-line">
          <div className="flex items-center gap-2 text-[11px] text-mut mb-2.5">
            <Icon name={online ? "wifi" : "wifioff"} size={14} className={online ? "text-ok" : "text-nok"} />
            شبکه مرورگر: {online ? "متصل" : "قطع"}
            <span className="mr-auto tabnums" dir="ltr">v{db.branding.version}</span>
          </div>
          <button onClick={() => { logout(); setUser(null); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-line text-sm font-bold text-mut hover:text-nok hover:border-nok/40 transition-colors pressable">
            <Icon name="logout" size={17} />خروج از سامانه
          </button>
        </div>
      </aside>
      {sideOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSideOpen(false)} />}

      {/* ── Main ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-panel/90 backdrop-blur-md border-b border-line">
          <div className="h-[3px] hz" />
          <div className="flex items-center gap-3 px-4 lg:px-6 h-16">
            <button className="lg:hidden p-2 text-mut hover:text-ink" onClick={() => setSideOpen(true)}><Icon name="list" size={20} /></button>
            <div className="hidden md:flex items-center gap-2 text-sm">
              <Icon name={NAV.find(n => n.id === route.name)?.icon || "dashboard"} size={17} className="text-acc" />
              <span className="font-bold">{NAV.find(n => n.id === route.name)?.label || "سامانه"}</span>
            </div>
            <span className="flex-1" />
            <Clock />
            {/* وضعیت اتصال شبکه */}
            <div className={`hidden sm:flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-[11px] font-bold ${online ? "border-ok/40 text-ok bg-ok/8" : "border-nok/40 text-nok bg-nok/8"}`}>
              <Icon name={online ? "wifi" : "wifioff"} size={13} />
              {online ? "شبکه متصل" : "شبکه قطع"}
            </div>
            {/* اعلان‌ها */}
            <div className="relative">
              <button className="relative p-2 rounded-lg text-mut hover:text-ink hover:bg-panel2 transition-colors" onClick={() => { setBellOpen(o => !o); setUserMenu(false); }}>
                <Icon name="bell" size={19} />
                {notifs[0]?.id !== "none" && <span className="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-nok border-2 border-panel dot-live" />}
              </button>
              {bellOpen && (
                <div className="absolute left-0 mt-2 w-80 card a-pop p-2 z-50">
                  <div className="px-3 py-2 text-xs font-bold text-mut border-b border-line mb-1">مرکز اعلان‌ها</div>
                  {notifs.map(n => (
                    <button key={n.id} onClick={() => { n.go(); setBellOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-panel2 text-right transition-colors">
                      <Icon name={n.icon} size={16} className={n.tone} />
                      <span className="text-xs flex-1">{n.text}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* کاربر */}
            <div className="relative">
              <button className="flex items-center gap-2.5 pl-2 pr-1 py-1 rounded-lg hover:bg-panel2 transition-colors" onClick={() => { setUserMenu(o => !o); setBellOpen(false); }}>
                <span className="w-8 h-8 rounded-full bg-acc/15 text-acc border border-acc/30 flex items-center justify-center font-disp">{user.name.slice(0, 1)}</span>
                <span className="hidden sm:block text-right">
                  <span className="block text-xs font-bold leading-4">{user.name}</span>
                  <span className="block text-[10px] text-mut">{{ admin: "مدیر سیستم", supervisor: "سرپرست نت", engineer: "کارشناس نت", technician: "تکنسین", viewer: "ممیز" }[user.role]}</span>
                </span>
                <Icon name="chevd" size={14} className="text-mut hidden sm:block" />
              </button>
              {userMenu && (
                <div className="absolute left-0 mt-2 w-52 card a-pop p-2 z-50">
                  <button onClick={() => { nav("settings"); setUserMenu(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-panel2 text-right text-sm"><Icon name="cog" size={16} className="text-mut" />تنظیمات</button>
                  <button onClick={() => { logout(); setUser(null); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-nok/10 text-right text-sm text-nok"><Icon name="logout" size={16} />خروج</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6" onClick={() => { setBellOpen(false); setUserMenu(false); }}>
          {route.name === "dashboard" && can("dashboard:view") && <Dashboard key={route.n} user={user} nav={nav} />}
          {route.name === "control" && can("control:view") && <Control key={route.n} user={user} nav={nav} />}
          {route.name === "history" && can("reports:view") && <History key={route.n} user={user} nav={nav} />}
          {route.name === "form" && can("control:view") && <ControlForm key={route.n} user={user} nav={nav} params={route.params} />}
          {route.name === "reports" && can("reports:view") && <Reports key={route.n} user={user} nav={nav} params={route.params} />}
          {route.name === "manage" && can("equipment:view") && <Manage key={route.n} user={user} params={route.params} />}
          {route.name === "settings" && can("settings:view") && <Settings user={user} />}
          <footer className="mt-10 pt-4 border-t border-line flex flex-wrap items-center gap-2 text-[11px] text-mut">
            <Logo size={18} />
            <span>{db.branding.footer}</span>
            <span className="mr-auto tabnums" dir="ltr">NIPCO Daily Equipment Control v{db.branding.version} — طراحی و تحلیل: محمد روشندل</span>
          </footer>
        </main>
      </div>

      <ToastHost toasts={toasts} />

      {/* ── موتور چاپ A4 ── */}
      {print && createPortal(
        print.kind === "control" && print.controlId ? <PrintSheet controlId={print.controlId} /> :
          <div className="print-sheet">
            <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 6 }}>شرکت NIPCO — {print.title}</div>
            <table>
              <thead><tr>{print.headers?.map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{print.rows?.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
            </table>
            <div style={{ fontSize: 10, color: "#666", marginTop: 8 }} dir="ltr">Generated {todayKey()} - {nowHMS()} — NIPCO Daily Equipment Control</div>
          </div>,
        document.getElementById("print-root")!
      )}
    </div>
  );
}

function Clock() {
  useNow(1000);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  useEffect(() => {
    setDate(dateTitle(todayKey()));
    const i = setInterval(() => { setDate(dateTitle(todayKey())); setTime(nowHMS()); }, 1000);
    setTime(nowHMS());
    return () => clearInterval(i);
  }, []);
  return (
    <div className="hidden md:flex items-center gap-2.5 border border-line rounded-lg px-3.5 py-1.5 bg-panel2/50">
      <Icon name="clock" size={15} className="text-acc" />
      <div className="leading-4">
        <div className="text-[11px] font-bold tabnums">{fa(date)}</div>
        <div className="text-[10px] text-mut tabnums" dir="ltr">{time}</div>
      </div>
    </div>
  );
}

function ToastHost({ toasts }: { toasts: { id: string; text: string; kind: string }[] }) {
  return (
    <div className="fixed bottom-5 left-5 z-[100] space-y-2 max-w-sm">
      {toasts.map(t => (
        <div key={t.id} className={`a-side card px-4 py-3 flex items-center gap-2.5 text-sm border-r-4 ${t.kind === "ok" ? "!border-r-ok" : t.kind === "err" ? "!border-r-nok" : "!border-r-info"}`}>
          <Icon name={t.kind === "ok" ? "check" : t.kind === "err" ? "alert" : "info"} size={17}
            className={t.kind === "ok" ? "text-ok" : t.kind === "err" ? "text-nok" : "text-info"} />
          {t.text}
        </div>
      ))}
    </div>
  );
}
