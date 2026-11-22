/* ── تنظیمات سامانه (بندهای ۱۳، ۱۶، ۱۷، ۲۰، ۲۱، ۲۲ سند) ── */
import { Fragment, useEffect, useState } from "react";
import { Icon, Logo } from "../components/icons";
import { Badge, Btn, Confirm, EmptyState, Field, Modal, Reveal, Select, Tabs, Toggle, download } from "../components/ui";
import { useDB, mutate, toast, can, uuid, createServerBackup, listServerBackups, importLegacyDatabase } from "../lib/store";
import { ROLE_NAMES, type RoleId, type User } from "../lib/types";
import { fa, todayJ } from "../lib/jalali";

const MODULES: [string, string][] = [["dashboard", "داشبورد"], ["control", "کنترل روزانه"], ["reports", "گزارشات"], ["equipment", "تجهیزات و گروه‌ها"], ["settings", "تنظیمات"]];
const ACTIONS: [string, string][] = [["view", "مشاهده"], ["create", "ایجاد"], ["edit", "ویرایش"], ["delete", "حذف"], ["submit", "ثبت نهایی"], ["export", "خروجی"], ["print", "چاپ"], ["approve", "تایید / ابطال"]];
const ROLES = Object.keys(ROLE_NAMES) as RoleId[];
const THEMES = [
  { id: "industrial", name: "Industrial Dark", desc: "تاریک صنعتی — پیش‌فرض خطوط تولید", colors: ["#0d1117", "#151b23", "#f5a623"] },
  { id: "light", name: "Corporate Light", desc: "روشن سازمانی — اتاق‌های اداری", colors: ["#eef1f5", "#ffffff", "#c07f10"] },
  { id: "contrast", name: "High Contrast", desc: "کنتراست بالا — محیط‌های پرنور سوله", colors: ["#000000", "#141414", "#ffd60a"] },
];

export default function Settings({ user }: { user: User }) {
  const db = useDB();
  const isAdmin = user.role === "admin";
  const [tab, setTab] = useState(isAdmin ? "branding" : "logs");
  const [uModal, setUModal] = useState<User | "new" | null>(null);

  const tabs = isAdmin ? [
    { id: "branding", label: "برندینگ و صفحه ورود", icon: "palette" },
    { id: "themes", label: "تم‌ها", icon: "moon" },
    { id: "users", label: "کاربران", icon: "users" },
    { id: "perms", label: "ماتریس دسترسی", icon: "shield" },
    { id: "backup", label: "پشتیبان‌گیری", icon: "database" },
    { id: "migration", label: "انتقال داده نسخه قبلی", icon: "history" },
    { id: "logs", label: "لاگ فعالیت‌ها", icon: "history" },
    { id: "years", label: "سال شمسی و آرشیو", icon: "calendar" },
  ] : [
    { id: "logs", label: "لاگ فعالیت‌ها", icon: "history" },
  ];

  return (
    <div className="space-y-4">
      <Reveal><div>
        <h1 className="font-disp text-2xl">تنظیمات سامانه</h1>
        <p className="text-xs text-mut mt-1">پیکربندی زنده بدون دست‌کاری سورس‌کد — همه تغییرات در Audit Log ثبت می‌شود</p>
      </div></Reveal>
      <Reveal delay={50}><Tabs tabs={tabs} value={tab} onChange={setTab} /></Reveal>

      {tab === "branding" && <BrandingTab />}
      {tab === "themes" && <ThemesTab />}
      {tab === "users" && (
        <div className="space-y-3">
          {isAdmin && <Btn kind="primary" onClick={() => setUModal("new")}><Icon name="plus" size={16} />کاربر جدید</Btn>}
          <div className="card overflow-hidden">
            <table className="tbl">
              <thead><tr><th>نام</th><th>نام کاربری</th><th>نقش</th><th>دسترسی گروه‌ها</th><th>وضعیت</th>{isAdmin && <th>عملیات</th>}</tr></thead>
              <tbody>
                {db.users.map(u => (
                  <tr key={u.id}>
                    <td className="font-semibold flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full bg-acc/12 text-acc border border-acc/25 flex items-center justify-center font-disp">{u.name.slice(0, 1)}</span>{u.name}
                    </td>
                    <td className="tabnums text-mut" dir="ltr">{u.username}</td>
                    <td><Badge tone={u.role === "admin" ? "acc" : u.role === "technician" ? "info" : "mut"}>{ROLE_NAMES[u.role]}</Badge></td>
                    <td className="text-xs text-mut">{u.groupIds === "all" ? "همه گروه‌ها" : (u.groupIds as string[]).map(id => db.groups.find(g => g.id === id)?.name).filter(Boolean).join("، ")}</td>
                    <td><Badge tone={u.active ? "ok" : "nok"}>{u.active ? "فعال" : "غیرفعال"}</Badge></td>
                    {isAdmin && <td>
                      <div className="flex gap-0.5">
                        <button className="p-1.5 rounded-md hover:bg-panel2 text-mut hover:text-acc" onClick={() => setUModal(u)}><Icon name="edit" size={15} /></button>
                        {u.id !== user.id && (
                          <button className="p-1.5 rounded-md hover:bg-panel2 text-mut hover:text-warn" title={u.active ? "غیرفعال‌سازی" : "فعال‌سازی با تعیین رمز جدید"}
                            onClick={() => {
                              if (u.active) mutate(d => { const x = d.users.find(y => y.id === u.id)!; x.active = false; }, { action: "UPDATE", entity: "Users", detail: `غیرفعال‌سازی کاربر «${u.name}»` });
                              else setUModal(u);
                            }}>
                            <Icon name={u.active ? "eye" : "check"} size={15} />
                          </button>
                        )}
                      </div>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {uModal && <UserModal init={uModal === "new" ? null : uModal} onClose={() => setUModal(null)} />}
        </div>
      )}

      {tab === "perms" && (
        <div className="card overflow-hidden">
          <div className="overflow-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="min-w-44">ماژول / دسترسی</th>
                  {ROLES.map(r => <th key={r} className="text-center !text-[11px]">{ROLE_NAMES[r].split(" ")[0]}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODULES.map(([m, mName]) => (
                  <Fragment key={m}>
                    <tr className="bg-panel2/60"><td colSpan={ROLES.length + 1} className="font-disp !py-2">{mName}</td></tr>
                    {ACTIONS.map(([a, aName]) => (
                      <tr key={m + a}>
                        <td className="text-mut text-xs">{aName} <span className="tabnums text-[10px]" dir="ltr">({m}:{a})</span></td>
                        {ROLES.map(r => (
                          <td key={r} className="text-center">
                            <input type="checkbox" className="accent-[var(--acc)] w-4 h-4 cursor-pointer" disabled={!isAdmin}
                              checked={db.perms[r]?.[`${m}:${a}`] ?? false}
                              onChange={e => mutate(d => { d.perms[r] = { ...d.perms[r], [`${m}:${a}`]: e.target.checked }; }, { action: "UPDATE", entity: "RolePermissions", detail: `تغییر دسترسی ${mName}/${aName} برای نقش ${ROLE_NAMES[r]}` })} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-mut px-4 py-3 border-t border-line">تفکیک سطح دسترسی بر اساس ماژول، عملیات و نقش — تغییرات بلافاصله در منوها و دکمه‌ها اعمال می‌شود.</p>
        </div>
      )}

      {tab === "backup" && <BackupTab isAdmin={isAdmin} />}
      {tab === "migration" && isAdmin && <LegacyMigrationTab />}

      {tab === "logs" && <LogsTab />}
      {tab === "years" && <YearsTab />}

    </div>
  );
}

function LegacyMigrationTab() {
  const [legacy, setLegacy] = useState<any | null>(null);
  const [fileName, setFileName] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<any | null>(null);
  const counts = legacy ? {
    groups: legacy.groups?.length || 0,
    equipments: legacy.equipments?.length || 0,
    checklists: legacy.checklists?.length || 0,
    controls: legacy.controls?.length || 0,
    opHours: legacy.opHours?.length || 0,
    drafts: legacy.drafts?.length || 0,
    users: legacy.users?.length || 0,
  } : null;
  const chooseFile = async (file?: File) => {
    setError(""); setDone(null); setLegacy(null); setFileName(""); setConfirmation("");
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { setError("حجم فایل نباید بیش از ۱۰۰ مگابایت باشد."); return; }
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.equipments) || !Array.isArray(parsed.controls)) throw new Error("این فایل ساختار خروجی نسخه قدیمی NIPCO را ندارد.");
      setLegacy(parsed); setFileName(file.name);
    } catch (e: any) { setError(e?.message || "خواندن فایل ناموفق بود."); }
  };
  const runImport = async () => {
    if (!legacy || confirmation !== "IMPORT NIPCO") return;
    setBusy(true); setError("");
    try {
      const result = await importLegacyDatabase(legacy);
      setDone(result); setLegacy(null); setConfirmation(""); setFileName("");
      toast("انتقال داده‌های نسخه قبلی با موفقیت ثبت شد.", "ok");
    } catch (e: any) { setError(e?.message || "انتقال داده‌ها انجام نشد."); toast(e?.message || "انتقال داده‌ها انجام نشد.", "err"); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <div className="card p-5 space-y-3">
      <h3 className="font-disp text-lg">انتقال یک‌باره اطلاعات از LocalStorage نسخه قدیمی</h3>
      <p className="text-xs text-mut leading-7">این ابزار فقط روی پایگاه تازه و خالی اجرا می‌شود و هیچ داده فعلی را بازنویسی نمی‌کند. ابتدا در صفحه نسخه قدیمی، فایل <span dir="ltr">migration/Export-Legacy-Storage.js</span> را در Console مرورگر اجرا و خروجی JSON را دریافت کنید؛ سپس فایل را اینجا انتخاب کنید.</p>
      <label className="lbl">فایل خروجی JSON نسخه قبلی</label>
      <input type="file" accept="application/json,.json" className="inp" onChange={e => void chooseFile(e.target.files?.[0])} />
      {fileName && <div className="text-xs text-mut" dir="ltr">{fileName}</div>}
      {counts && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[["گروه تجهیزات",counts.groups],["تجهیزات",counts.equipments],["چک‌لیست",counts.checklists],["سوابق کنترل",counts.controls],["ساعت کارکرد",counts.opHours],["پیش‌نویس",counts.drafts],["حساب‌های قدیمی",counts.users]].map(([label,value]) => <div key={String(label)} className="rounded-lg border border-line bg-panel2 p-3"><div className="text-[11px] text-mut">{label}</div><div className="font-disp text-xl tabnums">{fa(Number(value))}</div></div>)}
      </div>}
      {counts && <div className="rounded-lg border border-warn/30 bg-warn/5 p-3 text-xs leading-6">حساب‌های کاربری قدیمی فقط به‌عنوان هویت تاریخی و غیرفعال منتقل می‌شوند. هیچ رمز متنی یا نشست قدیمی منتقل نمی‌شود؛ برای فعال‌سازی هر کاربر باید مدیر رمز جدید تعیین کند. رکوردهای صف همگام‌سازی و اطلاعات خودکار PLC منتقل نمی‌شوند.</div>}
      <Field label="برای تأیید انتقال عبارت IMPORT NIPCO را وارد کنید"><input className="inp" dir="ltr" value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="IMPORT NIPCO" /></Field>
      <Btn kind="primary" disabled={!legacy || confirmation !== "IMPORT NIPCO" || busy} onClick={() => void runImport()}><Icon name="upload" size={16}/>{busy ? "در حال انتقال به SQL Server…" : "انتقال اطلاعات به دیتابیس مرکزی"}</Btn>
      {error && <div className="rounded-lg border border-nok/30 bg-nok/5 p-3 text-xs text-nok">{error}</div>}
      {done && <div className="rounded-lg border border-ok/30 bg-ok/5 p-3 text-xs text-ok leading-6">انتقال انجام شد: {fa(done.groups)} گروه، {fa(done.equipments)} تجهیز، {fa(done.controls)} کنترل، {fa(done.opHours)} رکورد ساعت کارکرد. {fa(done.importedLegacyAccountsDisabled)} حساب قدیمی به‌صورت غیرفعال نگهداری شد.</div>}
    </div>
  </div>;
}

function BackupTab({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = () => listServerBackups().then(setRows).catch((e: any) => setError(e?.message || "خواندن فهرست پشتیبان ممکن نیست"));
  useEffect(() => { if (isAdmin) void refresh(); }, [isAdmin]);
  const runBackup = async () => {
    setBusy(true); setError("");
    try {
      const result = await createServerBackup();
      toast(`پشتیبان SQL با CHECKSUM ساخته شد (آزمون بازیابی جداگانه است): ${result.fileName}`, "ok");
      await refresh();
    } catch (e: any) { setError(e?.message || "ساخت پشتیبان ناموفق بود"); toast(e?.message || "ساخت پشتیبان ناموفق بود", "err"); }
    finally { setBusy(false); }
  };
  return <div className="grid md:grid-cols-2 gap-4">
    <div className="card p-5">
      <span className="w-11 h-11 rounded-xl bg-ok/12 text-ok border border-ok/25 flex items-center justify-center mb-3"><Icon name="download" size={22} /></span>
      <h3 className="font-disp text-lg">پشتیبان‌گیری فوری از SQL Server</h3>
      <p className="text-xs text-mut leading-6 mt-1">فایل کامل دیتابیس روی دیسک سرور با CHECKSUM ساخته می‌شود. تأیید نهایی قابلیت بازیابی باید با اسکریپت Restore و دسترسی DBA انجام شود.</p>
      <Btn kind="ok" className="mt-4 w-full" disabled={!isAdmin || busy} onClick={runBackup}><Icon name="database" size={16} />{busy ? "در حال تهیه پشتیبان…" : "تهیه پشتیبان اکنون"}</Btn>
    </div>
    <div className="card p-5">
      <span className="w-11 h-11 rounded-xl bg-info/12 text-info border border-info/25 flex items-center justify-center mb-3"><Icon name="upload" size={22} /></span>
      <h3 className="font-disp text-lg">بازیابی پایگاه داده</h3>
      <p className="text-xs text-mut leading-6 mt-1">برای جلوگیری از قطع‌شدن فرایند در میانه Restore، بازیابی از روی سرور و با توقف کنترل‌شده سرویس انجام می‌شود. فقط از فایل‌های پوشه Backups استفاده کنید.</p>
      <div className="mt-3 rounded-lg bg-panel2 border border-line p-3 text-xs leading-6" dir="ltr">.\deploy\windows\Restore-Database.ps1 -BackupFile "C:\NIPCO\Control\Backups\FILE.bak" -Confirm</div>
      <p className="text-[11px] text-mut mt-2">این دستور باید در PowerShell با دسترسی Administrator روی خود سرور اجرا شود.</p>
    </div>
    {error && <div className="md:col-span-2 card border-nok/30 text-nok text-xs p-3">{error}</div>}
    <div className="card p-4 md:col-span-2">
      <div className="flex items-center justify-between mb-3"><h3 className="font-disp text-base">تاریخچه نسخه‌های پشتیبان</h3><Btn kind="soft" size="sm" onClick={() => void refresh()}><Icon name="sync" size={14}/>به‌روزرسانی</Btn></div>
      {rows.length ? <div className="overflow-auto"><table className="tbl"><thead><tr><th>نام فایل</th><th>زمان</th><th>حجم</th><th>وضعیت صحت‌سنجی</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td dir="ltr" className="text-xs">{r.fileName}</td><td className="tabnums" dir="ltr">{new Date(r.createdAt).toLocaleString()}</td><td className="tabnums" dir="ltr">{r.size ? `${(Number(r.size)/1024/1024).toFixed(2)} MB` : "—"}</td><td><Badge tone={r.verified ? "ok" : "nok"}>{r.verified ? "بازیابی‌شده/تأییدشده" : "تهیه‌شده؛ بازیابی آزمایش نشده"}</Badge></td></tr>)}</tbody></table></div> : <EmptyState icon="database" title="نسخه پشتیبانی ثبت نشده است" />}
    </div>
    <div className="card p-4 md:col-span-2"><h3 className="font-disp mb-2 text-base">زمان‌بندی خودکار</h3><p className="text-xs text-mut leading-6">نصب‌کننده، وظیفه زمان‌بندی‌شده Windows Task Scheduler را برای تهیه پشتیبان روزانه ساعت ۰۲:۰۰ ایجاد می‌کند. برای بازیابی، فایل و گزارش‌ها در پوشه Backups و logs روی سرور نگهداری می‌شوند.</p></div>
  </div>;
}

function BrandingTab() {
  const db = useDB();
  const [b, setB] = useState({ ...db.branding });
  const dirty = JSON.stringify(b) !== JSON.stringify(db.branding);
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <div className="card p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="متن لوگو"><input className="inp" dir="ltr" value={b.logoText} onChange={e => setB({ ...b, logoText: e.target.value })} /></Field>
          <Field label="نسخه سیستم"><input className="inp" dir="ltr" value={b.version} onChange={e => setB({ ...b, version: e.target.value })} /></Field>
        </div>
        <Field label="عنوان سیستم"><input className="inp" value={b.title} onChange={e => setB({ ...b, title: e.target.value })} /></Field>
        <Field label="زیرعنوان (انگلیسی)"><input className="inp" dir="ltr" value={b.subtitle} onChange={e => setB({ ...b, subtitle: e.target.value })} /></Field>
        <Field label="متن خوش‌آمدگویی"><textarea className="inp min-h-20" value={b.welcome} onChange={e => setB({ ...b, welcome: e.target.value })} /></Field>
        <Field label="پاورقی / کپی‌رایت"><input className="inp" value={b.footer} onChange={e => setB({ ...b, footer: e.target.value })} /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="رنگ اصلی برند (Primary)">
            <div className="flex items-center gap-2">
              <input type="color" value={b.primary} onChange={e => setB({ ...b, primary: e.target.value })} className="w-11 h-10 rounded-lg border border-line bg-panel2 cursor-pointer" />
              <input className="inp tabnums" dir="ltr" value={b.primary} onChange={e => setB({ ...b, primary: e.target.value })} />
            </div>
          </Field>
          <Field label={`گردی گوشه‌ها: ${b.radius}px`}>
            <input type="range" min={0} max={22} value={b.radius} onChange={e => setB({ ...b, radius: +e.target.value })} className="w-full accent-[var(--acc)] mt-3" />
          </Field>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Btn kind="primary" disabled={!dirty} onClick={() => {
            mutate(d => { d.branding = b; }, { action: "UPDATE", entity: "BrandingSettings", detail: "بروزرسانی تنظیمات برندینگ صفحه ورود" });
            toast("برندینگ منتشر شد (Publish) و در لاگ ثبت شد", "ok");
          }}><Icon name="check" size={16} />انتشار تغییرات (Publish)</Btn>
          <Btn kind="ghost" disabled={!dirty} onClick={() => setB({ ...db.branding })}>بازگردانی</Btn>
          <Badge tone="mut"><Icon name="camera" size={11} />تصویر کاور: از پنل فایل سرور</Badge>
        </div>
      </div>
      <div className="card p-5">
        <h3 className="font-disp mb-3 flex items-center gap-2"><Icon name="eye" size={17} className="text-acc" />پیش‌نمایش زنده صفحه ورود</h3>
        <div className="rounded-xl overflow-hidden border border-line bg-bg2 grid grid-cols-[1fr_130px]" style={{ ["--acc" as any]: b.primary, ["--radius" as any]: `${b.radius}px` }}>
          <div className="p-5 bg-panel">
            <div className="flex items-center gap-2"><Logo size={30} /><span className="font-disp text-xl" style={{ color: "var(--acc)" }}>{b.logoText}</span></div>
            <div className="font-disp text-lg mt-4">{b.title}</div>
            <div className="text-[11px] text-mut mt-1 leading-5">{b.welcome}</div>
            <div className="mt-4 space-y-2">
              <div className="h-8 rounded-lg bg-panel2 border border-line" style={{ borderRadius: b.radius }} />
              <div className="h-8 rounded-lg bg-panel2 border border-line" style={{ borderRadius: b.radius }} />
              <div className="h-8 rounded-lg font-bold text-[11px] flex items-center justify-center text-white" style={{ background: b.primary, borderRadius: b.radius }}>ورود به سامانه</div>
            </div>
            <div className="text-[9px] text-mut mt-3">{b.footer} — v{b.version}</div>
          </div>
          <div aria-label="پیش‌نمایش پس‌زمینه صنعتی" className="industrial-cover relative hidden sm:block" />
        </div>
      </div>
    </div>
  );
}

function ThemesTab() {
  const db = useDB();
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3.5">
        {THEMES.map((t, i) => (
          <Reveal key={t.id} delay={i * 60}>
            <button onClick={() => { mutate(d => { d.theme = t.id; }, { action: "UPDATE", entity: "UserSettings", detail: `تغییر تم به «${t.name}»` }); toast(`تم «${t.name}» اعمال شد`, "ok"); }}
              className={`card card-h w-full p-4 text-right ${db.theme === t.id ? "!border-acc" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">{t.colors.map(c => <span key={c} className="w-6 h-6 rounded-md border border-line" style={{ background: c }} />)}</div>
                {db.theme === t.id && <Badge tone="acc"><Icon name="check" size={11} />فعال</Badge>}
              </div>
              <div className="font-disp text-lg mt-3">{t.name}</div>
              <div className="text-xs text-mut mt-0.5">{t.desc}</div>
            </button>
          </Reveal>
        ))}
      </div>
      <div className="card p-4">
        <h3 className="font-disp text-base mb-2">Custom Theme Builder</h3>
        <p className="text-xs text-mut leading-6">رنگ تأکیدی و گردی گوشه‌ها از تب «برندینگ» قابل تنظیم است و روی همه تم‌ها اعمال می‌شود — تم اختصاصی شما با حساب کاربری ذخیره می‌گردد.</p>
      </div>
    </div>
  );
}

function UserModal({ init, onClose }: { init: User | null; onClose: () => void }) {
  const db = useDB();
  const [u, setU] = useState<User>(init ? { ...init, groupIds: init.groupIds === "all" ? "all" : [...(init.groupIds as string[])] } :
    { id: uuid(), username: "", pass: "", name: "", role: "technician", groupIds: [], active: true });
  const allGroups = u.groupIds === "all";
  const needsNewPassword = !init || (!!init && !init.active && u.active);
  const strongPassword = typeof u.pass === "string" && u.pass.length >= 14 && /[A-Za-z]/.test(u.pass) && /\d/.test(u.pass);
  return (
    <Modal open onClose={onClose} title={init ? "ویرایش کاربر" : "کاربر جدید"} wide footer={
      <>
        <Btn kind="primary" disabled={!u.name.trim() || !/^[A-Za-z0-9._@-]{3,128}$/.test(u.username.trim()) || (needsNewPassword && !strongPassword) || (!!u.pass && !strongPassword)} onClick={() => {
          const cleanUser: User = { ...u, username: u.username.trim().toLowerCase(), name: u.name.trim() };
          if (!cleanUser.pass) delete cleanUser.pass;
          mutate(d => { const i = d.users.findIndex(x => x.id === cleanUser.id); if (i >= 0) d.users[i] = cleanUser; else d.users.push(cleanUser); },
            { action: init ? "UPDATE" : "INSERT", entity: "Users", detail: `${init ? "ویرایش" : "ایجاد"} کاربر «${cleanUser.name}» با نقش ${ROLE_NAMES[cleanUser.role]}` });
          toast("کاربر ذخیره شد", "ok"); onClose();
        }}><Icon name="save" size={16} />ذخیره کاربر</Btn>
        <Btn kind="ghost" onClick={onClose}>انصراف</Btn>
      </>
    }>
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="نام و نام خانوادگی" req><input className="inp" value={u.name} onChange={e => setU({ ...u, name: e.target.value })} /></Field>
        <Field label="نام کاربری" req><input className="inp" dir="ltr" value={u.username} onChange={e => setU({ ...u, username: e.target.value })} /></Field>
        <Field label={needsNewPassword ? "رمز عبور جدید (حداقل ۱۴ نویسه با ترکیب حرف و عدد)" : "تغییر رمز عبور (اختیاری، حداقل ۱۴ نویسه با ترکیب حرف و عدد)"}><input className="inp" dir="ltr" type="password" autoComplete="new-password" value={u.pass || ""} placeholder={needsNewPassword ? "برای فعال‌سازی حساب الزامی است" : "برای حفظ رمز فعلی خالی بماند"} onChange={e => setU({ ...u, pass: e.target.value })} /></Field>
        {init && <div className="sm:col-span-3"><Toggle checked={u.active} onChange={active => setU({ ...u, active })} label={u.active ? "حساب فعال باشد" : "حساب غیرفعال بماند"} /></div>}
        <Field label="نقش سیستم">
          <Select value={u.role} onChange={v => setU({ ...u, role: v as RoleId })} options={ROLES.map(r => ({ value: r, label: ROLE_NAMES[r] }))} />
        </Field>
        <div className="sm:col-span-2">
          <label className="lbl">محدودیت گروه‌های تجهیزات (Group-Level Access)</label>
          <Toggle checked={allGroups} onChange={v => setU({ ...u, groupIds: v ? "all" : [] })} label="دسترسی به همه گروه‌ها" />
          {!allGroups && (
            <div className="flex flex-wrap gap-2 mt-2.5">
              {db.groups.map(g => {
                const sel = (u.groupIds as string[]).includes(g.id);
                return (
                  <button key={g.id} onClick={() => setU({ ...u, groupIds: sel ? (u.groupIds as string[]).filter(x => x !== g.id) : [...(u.groupIds as string[]), g.id] })}
                    className={`pressable text-xs font-bold border rounded-full px-3 py-1.5 flex items-center gap-1.5 ${sel ? "bg-acc/15 border-acc/50 text-acc" : "border-line text-mut"}`}>
                    <Icon name={g.icon} size={13} />{g.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function LogsTab() {
  const db = useDB();
  const [fAction, setFAction] = useState("");
  const [fUser, setFUser] = useState("");
  const logs = db.logs.filter(l => (!fAction || l.action === fAction) && (!fUser || l.userId === fUser)).reverse();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2.5 items-center">
        <Select className="w-44" value={fAction} onChange={setFAction} placeholder="همه عملیات‌ها"
          options={[...new Set(db.logs.map(l => l.action))].map(a => ({ value: a, label: a }))} />
        <Select className="w-44" value={fUser} onChange={setFUser} placeholder="همه کاربران"
          options={db.users.map(u => ({ value: u.id, label: u.name }))} />
        <span className="text-xs text-mut tabnums">{fa(logs.length)} رویداد</span>
        <span className="flex-1" />
        <Btn kind="outline" size="sm" onClick={() => {
          const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
          download("nipco-audit-log.csv", [["تاریخ", "زمان", "کاربر", "عملیات", "موجودیت", "شرح", "IP"].join(","),
          ...logs.map(l => [l.dateKey, l.time, esc(l.userName), l.action, esc(l.entity), esc(l.detail), esc(l.ip)].join(","))].join("\n"));
          mutate(() => { }, { action: "EXPORT", entity: "ActivityLogs", detail: "خروجی Excel لاگ فعالیت‌ها" });
          toast("خروجی لاگ‌ها تولید شد", "ok");
        }}><Icon name="download" size={14} />Excel</Btn>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-auto max-h-[520px]">
          <table className="tbl">
            <thead><tr><th>تاریخ / زمان</th><th>کاربر</th><th>عملیات</th><th>موجودیت</th><th>شرح</th><th>IP</th></tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td className="tabnums whitespace-nowrap" dir="ltr">{l.dateKey} - {l.time}</td>
                  <td className="font-semibold">{l.userName}</td>
                  <td><Badge tone={l.action === "DELETE" || l.action === "CANCEL" ? "nok" : l.action === "EXPORT" ? "info" : l.action === "LOGIN" ? "acc" : "ok"}>{l.action}</Badge></td>
                  <td className="text-mut text-xs">{l.entity}</td>
                  <td className="text-xs">{l.detail}</td>
                  <td className="tabnums text-mut text-xs" dir="ltr">{l.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function YearsTab() {
  const db = useDB();
  const [closeOpen, setCloseOpen] = useState(false);
  const tj = todayJ();
  const years = [...new Set([...Object.keys(db.yearAccess), String(tj.jy), String(tj.jy - 1), String(tj.jy - 2)])].sort((a, b) => b.localeCompare(a));
  return (
    <div className="grid md:grid-cols-2 gap-4 items-start">
      <div className="card p-5">
        <h3 className="font-disp text-lg mb-1">سطح دسترسی سالانه</h3>
        <p className="text-xs text-mut leading-6 mb-4">سال جاری Full Access؛ سال‌های قبل در حالت فقط‌خواندنی یا بدون دسترسی — مطابق سیاست آرشیو.</p>
        <div className="space-y-2.5">
          {years.map(y => (
            <div key={y} className="flex items-center justify-between gap-3 bg-panel2/60 border border-line rounded-lg px-4 py-2.5">
              <span className="font-disp text-lg tabnums">سال {fa(y)}</span>
              {db.archivedYears.includes(y) && <Badge tone="mut"><Icon name="database" size={11} />آرشیوشده</Badge>}
              <Select className="w-40" value={db.yearAccess[y] || "readonly"} onChange={v =>
                mutate(d => { d.yearAccess[y] = v as any; }, { action: "UPDATE", entity: "YearAccess", detail: `تغییر سطح دسترسی سال ${y} به ${v}` })}
                options={[{ value: "full", label: "دسترسی کامل" }, { value: "readonly", label: "فقط خواندنی" }, { value: "none", label: "بدون دسترسی" }]} />
            </div>
          ))}
        </div>
      </div>
      <div className="card p-5 border-warn/30">
        <span className="w-11 h-11 rounded-xl bg-warn/12 text-warn border border-warn/25 flex items-center justify-center mb-3"><Icon name="calendar" size={22} /></span>
        <h3 className="font-disp text-lg">بستن سال شمسی (Close Shamsi Year)</h3>
        <p className="text-xs text-mut leading-7 mt-1">انتقال داده‌های تاریخی به جداول آرشیو برای حفظ سرعت پایگاه‌داده اصلی. پس از بستن، سال قبل به‌صورت پیش‌فرض «فقط خواندنی» می‌شود و در لاگ امنیتی ثبت خواهد شد.</p>
        <Btn kind="primary" className="mt-4" onClick={() => setCloseOpen(true)}><Icon name="lock" size={16} />بستن سال {fa(tj.jy - 1)}</Btn>
      </div>
      <Confirm open={closeOpen} onClose={() => setCloseOpen(false)} title="بستن سال شمسی" yesLabel="بستن سال و آرشیو"
        text={<>سال <b className="tabnums">{fa(tj.jy - 1)}</b> بسته و به آرشیو منتقل می‌شود. داده‌ها قابل مشاهده (Read Only) باقی می‌مانند.</>}
        onYes={() => {
          const y = String(tj.jy - 1);
          mutate(d => { d.archivedYears = [...new Set([...d.archivedYears, y])]; d.yearAccess[y] = "readonly"; },
            { action: "UPDATE", entity: "Backups", detail: `بستن سال شمسی ${y} و انتقال به آرشیو` });
          toast(`سال ${fa(y)} بسته و آرشیو شد`, "ok");
        }} />
    </div>
  );
}
