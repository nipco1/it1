/* ── ماژول گزارش‌گیری جامع (بند ۱۵ سند) — ۵ سربرگ، List + Chart ── */
import { useMemo, useState } from "react";
import { Icon } from "../components/icons";
import { Badge, Btn, BarChart, Donut, EmptyState, Field, JRangePicker, LineChart, Modal, Reveal, Seg, Select, StatusBadge, Tabs, download, styleTag } from "../components/ui";
import { useDB, userGroupVisible, eqById, groupById, userById, shiftById, mutate, toast, can, saveFilter, deleteFilter, printBus, defaultFilters } from "../lib/store";
import type { User, ReportFilters } from "../lib/types";
import { fa, parseKey, addDays } from "../lib/jalali";
import { operatingHoursTrend } from "../lib/analytics";

const PALETTE = ["#f5a623", "#4cc3d9", "#e5484d", "#33b474", "#a78bfa", "#f472b6", "#94a3b8", "#fb923c"];
const TABS = [
  { id: "daily", label: "گزارش جامع کنترل روزانه", icon: "clipboard" },
  { id: "nok", label: "خرابی‌ها و انحرافات (NOK)", icon: "alert" },
  { id: "hours", label: "کارکرد تجهیزات", icon: "timer" },
  { id: "perf", label: "عملکرد تکنسین و شیفت", icon: "users" },
  { id: "analytics", label: "تحلیلی و مدیریتی", icon: "chart" },
];

export default function Reports({ user, nav, params }: { user: User; nav: (r: string, p?: any) => void; params: any }) {
  const db = useDB();
  const [tab, setTab] = useState<string>(params?.tab || "daily");
  const [flt, setFlt] = useState<ReportFilters>(() => ({ ...defaultFilters(), ...(params?.filters || {}) }));
  const [view, setView] = useState("list");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const visEqIds = new Set(db.equipments.filter(e => userGroupVisible(user, e.groupId)).map(e => e.id));
  const groups = db.groups.filter(g => userGroupVisible(user, g.id));

  const controls = useMemo(() => db.controls.filter(c => {
    if (!visEqIds.has(c.equipmentId)) return false;
    if (c.dateKey < flt.from || c.dateKey > flt.to) return false;
    const eq = eqById(db, c.equipmentId); if (!eq) return false;
    if (flt.group && eq.groupId !== flt.group) return false;
    if (flt.equipment && c.equipmentId !== flt.equipment) return false;
    if (flt.shift && c.shiftId !== flt.shift) return false;
    if (flt.tech && c.techId !== flt.tech) return false;
    if (flt.status && c.status !== flt.status) return false;
    return true;
  }).sort((a, b) => (b.dateKey + (b.submittedAt || "")).localeCompare(a.dateKey + (a.submittedAt || ""))), [db, flt, tab]); // eslint-disable-line

  const nokRows = useMemo(() => {
    const out: any[] = [];
    controls.filter(c => c.status !== "cancelled").forEach(c => {
      const eq = eqById(db, c.equipmentId)!;
      Object.values(c.items).forEach(v => {
        if (v.result === "nok") {
          const item = db.items.find(i => i.id === v.itemId);
          out.push({ c, eq, item, v });
        }
      });
    });
    return out;
  }, [controls, db]);

  const opRows = useMemo(() => db.opHours.filter(r => {
    if (!visEqIds.has(r.equipmentId)) return false;
    if (r.dateKey < flt.from || r.dateKey > flt.to) return false;
    const eq = eqById(db, r.equipmentId); if (!eq) return false;
    if (flt.group && eq.groupId !== flt.group) return false;
    if (flt.equipment && r.equipmentId !== flt.equipment) return false;
    if (flt.tech && r.techId !== flt.tech) return false;
    if (flt.source && r.source !== flt.source) return false;
    return true;
  }).sort((a, b) => (b.dateKey + b.time).localeCompare(a.dateKey + a.time)), [db, flt, tab]); // eslint-disable-line

  const set = (patch: Partial<ReportFilters>) => setFlt(f => ({ ...f, ...patch }));
  const myFilters = db.savedFilters.filter(f => f.userId === user.id && f.tab === tab);
  const eqOptions = db.equipments.filter(e => visEqIds.has(e.id) && (!flt.group || e.groupId === flt.group));

  /* ── خروجی بر اساس فیلتر فعال ── */
  const exportCSV = () => {
    let headers: string[] = [], rows: string[][] = [];
    if (tab === "daily") {
      headers = ["شماره سند", "تاریخ", "تجهیز", "گروه", "شیفت", "تکنسین", "وضعیت", "زمان ثبت"];
      rows = controls.map(c => {
        const eq = eqById(db, c.equipmentId);
        return [`DC-${c.id.replace("dc-", "")}`, c.dateKey, eq?.name || "—", groupById(db, eq?.groupId || "")?.name || "—", shiftById(db, c.shiftId)?.name || "—", userById(db, c.techId)?.name || "—", c.status, c.submittedAt || "—"];
      });
    } else if (tab === "nok") {
      headers = ["تاریخ", "تجهیز", "گروه", "آیتم", "مقدار", "محدوده", "موقعیت خرابی", "شرح", "تکنسین"];
      rows = nokRows.map(r => [r.c.dateKey, r.eq.name, groupById(db, r.eq.groupId)?.name || "—", r.item?.title || "—",
        r.v.value?.toString() || "—", r.item?.min !== undefined ? `${r.item.min}-${r.item.max} ${r.item.unit}` : "OK/NOK",
        db.failLocs.find(f => f.id === r.v.failLocId)?.name || "—", r.v.desc || "—", userById(db, r.c.techId)?.name || "—"]);
    } else if (tab === "hours") {
      headers = ["تاریخ", "زمان", "تجهیز", "ساعت کارکرد", "اختلاف", "منبع", "تکنسین"];
      rows = opRows.map(r => [r.dateKey, r.time, eqById(db, r.equipmentId)?.name || "—", String(r.hours), r.diff != null ? String(r.diff) : "—", r.source, userById(db, r.techId)?.name || "—"]);
    } else if (tab === "perf") {
      headers = ["تکنسین", "نقش", "تعداد بازدید", "سالم", "انحراف", "نرخ NOK"];
      rows = perfRows.map(r => [r.u.name, r.u.role, String(r.n), String(r.ok), String(r.nok), r.n ? `${Math.round((r.nok / r.n) * 100)}%` : "—"]);
    } else {
      headers = ["گروه تجهیزات", "تعداد انحراف", "سهم"];
      const tot = Math.max(1, byGroupNok.reduce((a, x) => a + x.v, 0));
      rows = byGroupNok.map(x => [x.label, String(x.v), `${Math.round((x.v / tot) * 100)}%`]);
    }
    download(`nipco-${tab}-${flt.from.replace(/\//g, "")}-${flt.to.replace(/\//g, "")}.csv`, [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n"));
    mutate(() => { }, { action: "EXPORT", entity: "Reports", detail: `خروجی Excel گزارش «${TABS.find(t => t.id === tab)?.label}» با فیلتر فعال` });
    toast("فایل Excel با فیلترهای فعال تولید شد", "ok");
  };

  const printTable = () => {
    let headers: string[] = [], rows: string[][] = [];
    if (tab === "daily") {
      headers = ["سند", "تاریخ", "تجهیز", "گروه", "شیفت", "تکنسین", "وضعیت"];
      rows = controls.slice(0, 40).map(c => { const eq = eqById(db, c.equipmentId); return [`DC-${c.id.replace("dc-", "")}`, c.dateKey, eq?.name || "—", groupById(db, eq?.groupId || "")?.name || "—", shiftById(db, c.shiftId)?.name || "—", userById(db, c.techId)?.name || "—", c.status]; });
    } else if (tab === "nok") {
      headers = ["تاریخ", "تجهیز", "آیتم", "موقعیت خرابی", "شرح"];
      rows = nokRows.slice(0, 40).map(r => [r.c.dateKey, r.eq.name, r.item?.title || "—", db.failLocs.find(f => f.id === r.v.failLocId)?.name || "—", r.v.desc || "—"]);
    } else {
      headers = ["تاریخ", "تجهیز", "ساعت", "منبع"];
      rows = opRows.slice(0, 40).map(r => [r.dateKey, eqById(db, r.equipmentId)?.name || "—", String(r.hours), r.source]);
    }
    printBus.send({ kind: "table", title: TABS.find(t => t.id === tab)?.label || "", headers, rows });
    mutate(() => { }, { action: "EXPORT", entity: "Reports", detail: "چاپ گزارش از ماژول گزارشات" });
  };

  /* ── محاسبات تب‌ها ── */
  const days: string[] = [];
  let nextDay = flt.from;
  while (nextDay <= flt.to && days.length < 366) { days.push(nextDay); nextDay = addDays(nextDay, 1); }
  const daysTruncated = nextDay <= flt.to;

  const perfRows = useMemo(() => {
    const techs = db.users.filter(u => ["technician", "engineer", "supervisor"].includes(u.role));
    return techs.map(u => {
      const cs = controls.filter(c => c.techId === u.id && c.status !== "cancelled");
      const ok = cs.filter(c => c.status === "completed").length;
      const nok = cs.filter(c => c.status === "nok").length;
      const durs = cs.map(c => {
        const a = (c.startedAt || "").split(" - ")[1], b = (c.submittedAt || "").split(" - ")[1];
        if (!a || !b) return null;
        const mA = +a.split(":")[0] * 60 + +a.split(":")[1], mB = +b.split(":")[0] * 60 + +b.split(":")[1];
        const d = (mB - mA + 1440) % 1440; return d;
      }).filter((x): x is number => x !== null && x < 600);
      return { u, n: cs.length, ok, nok, avg: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null };
    }).sort((a, b) => b.n - a.n);
  }, [controls, db]);

  const byGroupNok = useMemo(() => {
    const m = new Map<string, number>();
    nokRows.forEach(r => m.set(r.eq.groupId, (m.get(r.eq.groupId) || 0) + 1));
    return groups.map(g => ({ id: g.id, label: g.name, v: m.get(g.id) || 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  }, [nokRows, groups]);

  const byLocNok = useMemo(() => {
    const m = new Map<string, number>();
    nokRows.forEach(r => m.set(r.v.failLocId || "fl-other", (m.get(r.v.failLocId || "fl-other") || 0) + 1));
    return db.failLocs.map((f, i) => ({ label: f.name, value: m.get(f.id) || 0, color: PALETTE[i % PALETTE.length] })).filter(s => s.value > 0);
  }, [nokRows, db]);

  const trendSeries = useMemo(() => ({
    labels: days.map(d => { const p = parseKey(d); return `${p.jm}/${p.jd}`; }),
    nok: days.map(dk => controls.filter(c => c.dateKey === dk && c.status === "nok").length),
    all: days.map(dk => controls.filter(c => c.dateKey === dk && c.status !== "cancelled").length),
  }), [controls, flt]); // eslint-disable-line

  const totNok = nokRows.length;
  const totCtl = controls.filter(c => c.status !== "cancelled").length;
  const nokRate = totCtl ? Math.round((controls.filter(c => c.status === "nok").length / totCtl) * 100) : 0;

  const FilterBar = (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <JRangePicker from={flt.from} to={flt.to} onChange={(f, t) => set({ from: f, to: t })} />
        <Select className="w-40" value={flt.group} onChange={v => set({ group: v, equipment: "" })} placeholder="همه گروه‌ها" options={groups.map(g => ({ value: g.id, label: g.name }))} />
        <Select className="w-44" value={flt.equipment} onChange={v => set({ equipment: v })} placeholder="همه تجهیزات" options={eqOptions.map(e => ({ value: e.id, label: e.name }))} />
        <Select className="w-32" value={flt.shift} onChange={v => set({ shift: v })} placeholder="همه شیفت‌ها" options={db.shifts.map(s => ({ value: s.id, label: s.name }))} />
        <Select className="w-36" value={flt.tech} onChange={v => set({ tech: v })} placeholder="همه تکنسین‌ها" options={db.users.filter(u => u.role !== "viewer" && u.role !== "admin").map(u => ({ value: u.id, label: u.name }))} />
        {tab !== "hours" ? (
          <Select className="w-40" value={flt.status} onChange={v => set({ status: v })} placeholder="همه وضعیت‌ها"
            options={[{ value: "completed", label: "تکمیل‌شده (OK)" }, { value: "nok", label: "دارای انحراف" }, { value: "inprogress", label: "در حال تکمیل" }, { value: "cancelled", label: "ابطال‌شده" }]} />
        ) : (
          <Select className="w-40" value={flt.source} onChange={v => set({ source: v })} placeholder="همه منابع"
            options={[{ value: "MANUAL", label: "MANUAL (دستی)" }, { value: "ADJUSTED", label: "ADJUSTED (اصلاحی)" }]} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Seg value={view} onChange={setView} options={[{ id: "list", label: <span className="flex items-center gap-1.5"><Icon name="list" size={14} />جدول</span> }, { id: "chart", label: <span className="flex items-center gap-1.5"><Icon name="chart" size={14} />تحلیل نموداری</span> }]} />
        <span className="flex-1" />
        <Select className="w-52" value="" onChange={v => { const f = myFilters.find(x => x.id === v); if (f) { setFlt(f.filters); toast(`فیلتر «${f.name}» فراخوانی شد`, "info"); } }}
          placeholder={myFilters.length ? `فیلترهای ذخیره‌شده (${fa(myFilters.length)})` : "فیلتر ذخیره‌شده‌ای نیست"} options={myFilters.map(f => ({ value: f.id, label: f.name }))} />
        {myFilters.some(f => JSON.stringify(f.filters) === JSON.stringify(flt)) && (
          <Btn kind="ghost" size="sm" onClick={() => { const f = myFilters.find(x => JSON.stringify(x.filters) === JSON.stringify(flt))!; deleteFilter(f.id); toast("فیلتر حذف شد", "info"); }}><Icon name="trash" size={14} />حذف این فیلتر</Btn>
        )}
        <Btn kind="soft" size="sm" onClick={() => { setSaveName(""); setSaveOpen(true); }}><Icon name="save" size={14} />ذخیره فیلتر</Btn>
        {can("reports:export") && <Btn kind="outline" size="sm" onClick={exportCSV}><Icon name="download" size={14} />Excel</Btn>}
        {can("reports:print") && <Btn kind="outline" size="sm" onClick={printTable}><Icon name="printer" size={14} />چاپ</Btn>}
      </div>
    </div>
  );

  const wrap = (children: React.ReactNode) => (
    <div className="space-y-4">
      <Reveal><div className="flex items-end justify-between flex-wrap gap-3">
        <div><h1 className="font-disp text-2xl">گزارشات سامانه</h1>
          <p className="text-xs text-mut mt-1">۵ گزارش تخصصی بر پایه داده واقعی — خروجی‌ها دقیقاً منطبق بر فیلتر فعال</p></div>
        <Badge tone="acc"><Icon name="calendar" size={12} /><span className="tabnums">{fa(flt.from)} ← {fa(flt.to)}</span></Badge>
      </div></Reveal>
      <Reveal delay={50}><Tabs tabs={TABS} value={tab} onChange={t => { setTab(t); setView("list"); }} /></Reveal>
      <Reveal delay={90}>{FilterBar}</Reveal>
      {daysTruncated && <div role="alert" className="card p-3 text-xs text-warn border-warn/30">نمودارها فقط ۳۶۶ روز نخست بازه را نشان می‌دهند؛ برای مشاهدهٔ کل روند بازه را کوتاه‌تر کنید. جدول و خروجی با کل فیلتر نمایش داده می‌شوند.</div>}
      <Reveal delay={130}>{children}</Reveal>
      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="ذخیره فیلتر جاری" footer={
        <>
          <Btn kind="primary" disabled={!saveName.trim()} onClick={() => { saveFilter(user.id, tab, saveName.trim(), flt); setSaveOpen(false); toast("فیلتر ذخیره شد و در مراجعات بعدی قابل فراخوانی است", "ok"); }}>ذخیره فیلتر</Btn>
          <Btn kind="ghost" onClick={() => setSaveOpen(false)}>انصراف</Btn>
        </>
      }>
        <Field label="نام فیلتر" req hint="مثال: خرابی‌های گروه پرس‌ها — شهریور ۱۴۰۵">
          <input className="inp" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="نام دلخواه…" autoFocus />
        </Field>
      </Modal>
    </div>
  );

  /* ── Tab 1: Daily ── */
  if (tab === "daily") {
    const activeEq = db.equipments.filter(e => visEqIds.has(e.id) && e.status === "active" && (!flt.group || e.groupId === flt.group));
    const real = Math.min(100, totCtl ? Math.round((totCtl / Math.max(1, activeEq.length * days.length)) * 100) : 0);
    return wrap(
      view === "list" ? (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 bg-panel2/60 border-b border-line text-xs flex-wrap">
            <span className="font-bold">نرخ تحقق بازدید: <b className="text-acc tabnums">{daysTruncated ? "نامشخص — بازه بیش از ۳۶۶ روز" : `${fa(real)}٪`}</b></span>
            <span className="text-mut tabnums">{fa(totCtl)} سند در بازه</span>
            <span className="text-ok tabnums">{fa(controls.filter(c => c.status === "completed").length)} سالم</span>
            <span className="text-nok tabnums">{fa(controls.filter(c => c.status === "nok").length)} انحراف</span>
            <span className="text-mut tabnums">{fa(controls.filter(c => c.status === "cancelled").length)} ابطال</span>
          </div>
          <div className="overflow-auto max-h-[520px]">
            <table className="tbl">
              <thead><tr><th>سند</th><th>تاریخ</th><th>تجهیز</th><th>گروه</th><th>شیفت</th><th>تکنسین</th><th>وضعیت</th><th>زمان ثبت</th></tr></thead>
              <tbody>
                {controls.map(c => {
                  const eq = eqById(db, c.equipmentId);
                  return (
                    <tr key={c.id} className="cursor-pointer" onClick={() => nav("form", { equipmentId: c.equipmentId, controlId: c.id })}>
                      <td className="tabnums text-acc font-bold" dir="ltr">DC-{c.id.replace("dc-", "").slice(0, 8)}</td>
                      <td className="tabnums">{fa(c.dateKey)}</td>
                      <td className="font-semibold">{eq?.name || "حذف‌شده"}</td>
                      <td className="text-mut">{groupById(db, eq?.groupId || "")?.name || "—"}</td>
                      <td className="text-mut">{shiftById(db, c.shiftId)?.name}</td>
                      <td>{userById(db, c.techId)?.name}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td className="tabnums text-mut" dir="ltr">{c.submittedAt || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!controls.length && <EmptyState icon="clipboard" title="سندی با این فیلترها یافت نشد" sub="بازه زمانی یا فیلترها را تغییر دهید" />}
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card p-4"><h3 className="font-disp mb-2">OK / NOK روزانه بازه</h3>
            <BarChart data={days.slice(-14).map(dk => ({ label: (() => { const p = parseKey(dk); return `${p.jm}/${p.jd}`; })(), a: controls.filter(c => c.dateKey === dk && c.status === "completed").length, b: controls.filter(c => c.dateKey === dk && c.status === "nok").length }))} aLabel="سالم" bLabel="انحراف" /></div>
          <div className="card p-4"><h3 className="font-disp mb-2">تحقق بازدید به تفکیک گروه (امروز)</h3>
            <div className="space-y-3 pt-2">
              {groups.map(g => {
                const eqs = db.equipments.filter(e => e.groupId === g.id && e.status === "active");
                const done = new Set(controls.filter(c => c.status !== "cancelled" && eqById(db, c.equipmentId)?.groupId === g.id).map(c => c.equipmentId)).size;
                const pct = eqs.length ? Math.min(100, Math.round((done / eqs.length) * 100)) : 0;
                return <div key={g.id}>
                  <div className="flex justify-between text-xs mb-1"><span className="font-bold">{g.name}</span><span className="tabnums text-mut">{fa(pct)}٪</span></div>
                  <div className="h-2 rounded-full bg-panel2 border border-line overflow-hidden"><div className={`h-full ${pct >= 100 ? "bg-ok" : "bg-acc"} transition-all duration-700`} style={{ width: `${pct}%` }} /></div>
                </div>;
              })}
            </div>
          </div>
        </div>
      )
    );
  }

  /* ── Tab 2: NOK ── */
  if (tab === "nok") {
    return wrap(
      view === "list" ? (
        <div className="card overflow-hidden">
          <div className="overflow-auto max-h-[540px]">
            <table className="tbl">
              <thead><tr><th>تاریخ</th><th>تجهیز</th><th>گروه</th><th>آیتم بازرسی</th><th>مقدار / محدوده</th><th>موقعیت خرابی</th><th>شرح ایراد</th><th>تکنسین</th></tr></thead>
              <tbody>
                {nokRows.map((r, i) => (
                  <tr key={i} className="cursor-pointer" onClick={() => nav("form", { equipmentId: r.eq.id, controlId: r.c.id })}>
                    <td className="tabnums">{fa(r.c.dateKey)}</td>
                    <td className="font-semibold">{r.eq.name}</td>
                    <td className="text-mut">{groupById(db, r.eq.groupId)?.name}</td>
                    <td>{r.item?.title}</td>
                    <td className="tabnums">{r.v.value != null ? <span className="text-nok font-bold">{r.v.value} {r.item?.unit}</span> : <Badge tone="nok">NOK</Badge>}
                      {r.item?.min !== undefined && <span className="text-mut text-[11px]"> ({r.item.min}–{r.item.max})</span>}</td>
                    <td><Badge tone="warn">{db.failLocs.find(f => f.id === r.v.failLocId)?.name || "—"}</Badge></td>
                    <td className="text-mut text-xs max-w-56 truncate" title={r.v.desc}>{r.v.desc || "—"}</td>
                    <td>{userById(db, r.c.techId)?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!nokRows.length && <EmptyState icon="check" title="هیچ انحرافی در این بازه ثبت نشده" sub="همه کنترل‌ها سالم بوده‌اند" />}
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card p-4"><h3 className="font-disp mb-3">توزیع بر اساس موقعیت خرابی</h3>
            {byLocNok.length ? <Donut slices={byLocNok} centerLabel="انحراف" /> : <EmptyState icon="check" title="داده‌ای نیست" />}</div>
          <div className="card p-4"><h3 className="font-disp mb-3">انحراف به تفکیک گروه تجهیزات</h3>
            {byGroupNok.length ? <BarChart data={byGroupNok.map(x => ({ label: x.label.slice(0, 10), a: x.v, b: 0 }))} aLabel="تعداد NOK" bLabel="" /> : <EmptyState icon="check" title="داده‌ای نیست" />}</div>
        </div>
      )
    );
  }

  /* ── Tab 3: Hours ── */
  if (tab === "hours") {
    const avgDiff = opRows.filter(r => r.diff != null);
    const avg = avgDiff.length ? (avgDiff.reduce((a, r) => a + (r.diff || 0), 0) / avgDiff.length) : 0;
    const eqIds = [...new Set(opRows.map(r => r.equipmentId))].slice(0, 5);
    return wrap(
      <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { l: "رکوردهای کارکرد", v: opRows.length, i: "timer", t: "text-acc" },
            { l: "ثبت اصلاحی (ADJUSTED)", v: opRows.filter(r => r.source === "ADJUSTED").length, i: "edit", t: "text-info" },
            { l: "ثبت دستی (MANUAL)", v: opRows.filter(r => r.source === "MANUAL").length, i: "edit", t: "text-warn" },
            { l: "میانگین کارکرد روزانه", v: `${avg.toFixed(1)} h`, i: "activity", t: "text-ok" },
          ].map(k => (
            <div key={k.l} className="card p-4 flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg bg-panel2 border border-line flex items-center justify-center"><Icon name={k.i} size={19} className={k.t} /></span>
              <div><div className={`font-disp text-xl tabnums ${k.t}`}>{typeof k.v === "number" ? fa(k.v) : k.v}</div><div className="text-[11px] text-mut">{k.l}</div></div>
            </div>
          ))}
        </div>
        {view === "list" ? (
          <div className="card overflow-hidden">
            <div className="overflow-auto max-h-[480px]">
              <table className="tbl">
                <thead><tr><th>تاریخ</th><th>زمان</th><th>تجهیز</th><th>گروه</th><th>ساعت کارکرد</th><th>کارکرد بین دو بازدید</th><th>منبع</th><th>ثبت‌کننده</th></tr></thead>
                <tbody>
                  {opRows.map(r => {
                    const eq = eqById(db, r.equipmentId);
                    return (
                      <tr key={r.id}>
                        <td className="tabnums">{fa(r.dateKey)}</td>
                        <td className="tabnums" dir="ltr">{r.time}</td>
                        <td className="font-semibold">{eq?.name || "—"}</td>
                        <td className="text-mut">{groupById(db, eq?.groupId || "")?.name || "—"}</td>
                        <td className="tabnums font-bold">{r.hours.toLocaleString("en-US")}</td>
                        <td>{r.diff != null ? <Badge tone="acc">+{fa(r.diff)} h</Badge> : <span className="text-mut">—</span>}</td>
                        <td><Badge tone={r.source === "ADJUSTED" ? "warn" : "mut"}>{r.source}</Badge></td>
                        <td>{userById(db, r.techId)?.name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!opRows.length && <EmptyState icon="timer" title="رکورد کارکردی یافت نشد" sub="گروه لیفتراک یا کمپرسور را انتخاب کنید" />}
            </div>
          </div>
        ) : (
          <div className="card p-4">
            <h3 className="font-disp mb-3">تغییر ساعت کارکرد نسبت به نخستین قرائت موجود در بازه (۵ تجهیز برتر)</h3>
            <LineChart labels={days.map(d => { const p = parseKey(d); return `${p.jm}/${p.jd}`; })}
              series={eqIds.map((id, i) => ({
                name: eqById(db, id)?.name.slice(0, 14) || id,
                color: PALETTE[i % PALETTE.length],
                points: operatingHoursTrend(db.opHours, id, days),
              }))} height={230} />
          </div>
        )}
      </>
    );
  }

  /* ── Tab 4: Performance ── */
  if (tab === "perf") {
    return wrap(
      view === "list" ? (
        <div className="card overflow-hidden">
          <div className="overflow-auto max-h-[500px]">
            <table className="tbl">
              <thead><tr><th>تکنسین</th><th>نقش</th><th>بازدیدها</th><th>سالم</th><th>انحراف</th><th>نرخ NOK</th><th>میانگین زمان تکمیل</th></tr></thead>
              <tbody>
                {perfRows.map(r => (
                  <tr key={r.u.id}>
                    <td className="font-semibold flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full bg-acc/12 text-acc border border-acc/25 flex items-center justify-center font-disp text-sm">{r.u.name.slice(0, 1)}</span>{r.u.name}
                    </td>
                    <td className="text-mut">{{ admin: "مدیر", supervisor: "سرپرست", engineer: "کارشناس نت", technician: "تکنسین", viewer: "ممیز" }[r.u.role]}</td>
                    <td className="tabnums font-bold">{fa(r.n)}</td>
                    <td className="tabnums text-ok">{fa(r.ok)}</td>
                    <td className="tabnums text-nok">{fa(r.nok)}</td>
                    <td>{r.n ? <Badge tone={r.nok / r.n > 0.15 ? "nok" : r.nok > 0 ? "warn" : "ok"}>{fa(Math.round((r.nok / r.n) * 100))}٪</Badge> : "—"}</td>
                    <td className="tabnums text-mut">{r.avg != null ? `${fa(r.avg)} دقیقه` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card p-4"><h3 className="font-disp mb-2">مقایسه عملکرد تکنسین‌ها</h3>
            <BarChart data={perfRows.slice(0, 6).map(r => ({ label: r.u.name.split(" ")[0], a: r.ok, b: r.nok }))} aLabel="سالم" bLabel="انحراف" /></div>
          <div className="card p-4"><h3 className="font-disp mb-2">توزیع بازدید شیفت‌ها</h3>
            <BarChart data={db.shifts.map(s => ({ label: s.name.replace(" (شب)", ""), a: controls.filter(c => c.shiftId === s.id && c.status === "completed").length, b: controls.filter(c => c.shiftId === s.id && c.status === "nok").length }))} aLabel="سالم" bLabel="انحراف" /></div>
        </div>
      )
    );
  }

  /* ── Tab 5: Analytics ── */
  const cum = byGroupNok.reduce((a: { label: string; v: number; cum: number }[], x, i, arr) => {
    const s = arr.slice(0, i + 1).reduce((b, y) => b + y.v, 0);
    a.push({ ...x, cum: totNok ? Math.round((s / totNok) * 100) : 0 }); return a;
  }, []);
  return wrap(
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: "نرخ انحراف (NOK Rate)", v: `${fa(nokRate)}٪`, t: nokRate > 12 ? "text-nok" : "text-ok", i: "alert" },
          { l: "مجموع انحرافات بازه", v: fa(totNok), t: "text-acc", i: "activity" },
          { l: "پُرچالش‌ترین گروه", v: byGroupNok[0]?.label || "—", t: "text-warn", i: "layers" },
          { l: "پرتکرارترین موقعیت خرابی", v: [...byLocNok].sort((a, b) => b.value - a.value)[0]?.label || "—", t: "text-info", i: "alert" },
        ].map(k => (
          <div key={k.l} className="card p-4">
            <div className="flex items-center justify-between"><span className="text-[11px] font-bold text-mut">{k.l}</span><Icon name={k.i} size={15} className="text-mut" /></div>
            <div className={`font-disp text-xl mt-2 ${k.t}`}>{k.v}</div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="font-disp mb-2">تحلیل پارتو خرابی گروه‌ها</h3>
          {cum.length ? <Pareto data={cum} /> : <EmptyState icon="chart" title="داده‌ای برای تحلیل نیست" />}
        </div>
        <div className="card p-4">
          <h3 className="font-disp mb-2">روند زمانی انحرافات</h3>
          <LineChart labels={trendSeries.labels} series={[{ name: "انحرافات روزانه", color: "#e5484d", points: trendSeries.nok }, { name: "کل بازدیدها", color: "#4cc3d9", points: trendSeries.all }]} />
        </div>
      </div>
    </>
  );
}

function Pareto({ data }: { data: { label: string; v: number; cum: number }[] }) {
  const W = 460, H = 220, P = 34;
  const max = Math.max(1, ...data.map(d => d.v));
  const bw = (W - P - 10) / Math.max(1, data.length);
  return (
    <div>
      {styleTag}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 1, 2, 3, 4].map(i => {
          const y = H - 30 - (i / 4) * (H - 55);
          return <g key={i}><line x1={P} x2={W - 8} y1={y} y2={y} stroke="var(--line)" strokeDasharray={i ? "3 4" : ""} />
            <text x={P - 6} y={y + 4} fontSize="9" fill="var(--mut)" textAnchor="end">{Math.round((max * i) / 4)}</text></g>;
        })}
        {data.map((d, i) => {
          const h = (d.v / max) * (H - 55);
          return <g key={d.label}>
            <rect className="grow-y" x={P + i * bw + bw * 0.15} y={H - 30 - h} width={bw * 0.7} height={Math.max(2, h)} rx="3" fill={i === 0 ? "var(--nok)" : "var(--acc)"} opacity={i === 0 ? 1 : 0.85 - i * 0.06}>
              <title>{d.label}: {d.v}</title></rect>
            <text x={P + i * bw + bw / 2} y={H - 12} fontSize="9" fill="var(--mut)" textAnchor="middle">{d.label.slice(0, 8)}</text>
          </g>;
        })}
        <polyline className="draw-l" points={data.map((d, i) => `${P + i * bw + bw / 2},${H - 30 - (d.cum / 100) * (H - 55)}`).join(" ")} fill="none" stroke="var(--info)" strokeWidth="2.2" />
        {data.map((d, i) => <circle key={i} cx={P + i * bw + bw / 2} cy={H - 30 - (d.cum / 100) * (H - 55)} r="3" fill="var(--info)"><title>تجمعی: {d.cum}٪</title></circle>)}
      </svg>
      <div className="flex items-center gap-4 justify-center text-xs text-mut mt-1">
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-acc inline-block" />تعداد انحراف گروه</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-0.5 bg-info inline-block" />درصد تجمعی</span>
      </div>
    </div>
  );
}
