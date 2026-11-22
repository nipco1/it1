/* ── داشبورد ماژولار و شخصی‌سازی‌پذیر (بند ۱۴ سند) ── */
import { useMemo, useState } from "react";
import { Icon } from "../components/icons";
import { Badge, Btn, BarChart, CountUp, Donut, LineChart, Modal, Reveal, Select, JRangePicker, Seg, StatusBadge, EmptyState } from "../components/ui";
import { mutate, useDB, userGroupVisible, eqById, userById, groupById, lastOpHours } from "../lib/store";
import type { DashLayout, User, DB } from "../lib/types";
import { addDays, todayKey, fa, parseKey, dateTitle } from "../lib/jalali";

const PALETTE = ["#f5a623", "#4cc3d9", "#e5484d", "#33b474", "#a78bfa", "#f472b6", "#94a3b8", "#fb923c"];

const WIDGET_META: Record<string, { title: string; icon: string }> = {
  kpis: { title: "شاخص‌های کلیدی", icon: "activity" },
  groups: { title: "وضعیت کنترل به تفکیک گروه", icon: "layers" },
  barShift: { title: "مقایسه OK / NOK در شیفت‌ها", icon: "chart" },
  trend: { title: "روند انحرافات بازه انتخابی", icon: "activity" },
  failLoc: { title: "توزیع خرابی بر اساس موقعیت", icon: "alert" },
  failGroup: { title: "توزیع خرابی بر اساس گروه", icon: "layers" },
  hours: { title: "ساعت کارکرد کمپرسورها و لیفتراک‌ها", icon: "timer" },
  overdue: { title: "تجهیزات عقب‌افتاده امروز", icon: "clock" },
  tech: { title: "تکنسین‌های فعال", icon: "users" },
  activity: { title: "آخرین رویدادهای سامانه", icon: "history" },
};
const DEFAULT_LAYOUT: DashLayout = [
  { key: "kpis", span: 12 }, { key: "groups", span: 6 }, { key: "barShift", span: 6 },
  { key: "trend", span: 7 }, { key: "failLoc", span: 5 }, { key: "hours", span: 7 },
  { key: "overdue", span: 5 }, { key: "tech", span: 6 }, { key: "activity", span: 6 },
];

export default function Dashboard({ user, nav }: { user: User; nav: (route: string, params?: any) => void }) {
  const db = useDB();
  const [flt, setFlt] = useState({ group: "", from: addDays(todayKey(), -6), to: todayKey(), shift: "" });
  const layout = db.layouts[user.id] || DEFAULT_LAYOUT;
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [resetLayout, setResetLayout] = useState(false);

  const setLayout = (l: DashLayout) => mutate(d => { d.layouts[user.id] = l; });

  const visGroups = db.groups.filter(g => g.isActive && userGroupVisible(user, g.id)).sort((a, b) => a.displayOrder - b.displayOrder);
  const visEq = db.equipments.filter(e => userGroupVisible(user, e.groupId));

  /* ── Dataset مشترک ویجت‌ها (فیلتر اصلی داشبورد) ── */
  const data = useMemo(() => {
    const inRange = (k: string) => k >= flt.from && k <= flt.to;
    const controls = db.controls.filter(c => {
      if (!inRange(c.dateKey) || c.status === "cancelled") return false;
      const eq = eqById(db, c.equipmentId); if (!eq) return false;
      if (flt.group && eq.groupId !== flt.group) return false;
      if (flt.shift && c.shiftId !== flt.shift) return false;
      if (!userGroupVisible(user, eq.groupId)) return false;
      return true;
    });
    const okC = controls.filter(c => c.status === "completed").length;
    const nokC = controls.filter(c => c.status === "nok").length;
    const visibleDrafts = db.drafts.filter(d => {
      const eq = eqById(db, d.equipmentId);
      return !!eq && userGroupVisible(user, eq.groupId) && inRange(d.dateKey) &&
        (!flt.group || eq.groupId === flt.group) && (!flt.shift || d.shiftId === flt.shift);
    });
    const inProg = controls.filter(c => c.status === "inprogress").length + visibleDrafts.length;
    const failItems: { eqId: string; groupId: string; failLocId: string }[] = [];
    controls.forEach(c => Object.values(c.items).forEach(v => {
      if (v.result === "nok") {
        const eq = eqById(db, c.equipmentId)!;
        failItems.push({ eqId: c.equipmentId, groupId: eq.groupId, failLocId: v.failLocId || "fl-other" });
      }
    }));
    // today
    const today = todayKey();
    const todaysControls = db.controls.filter(c => c.dateKey === today && c.status !== "cancelled" && userGroupVisible(user, eqById(db, c.equipmentId)?.groupId || ""));
    const doneToday = new Set(todaysControls.map(c => c.equipmentId));
    const draftEq = new Set(db.drafts.filter(d => d.dateKey === today && userGroupVisible(user, eqById(db, d.equipmentId)?.groupId || "")).map(d => d.equipmentId));
    const activeEq = visEq.filter(e => e.status === "active" && (!flt.group || e.groupId === flt.group));
    const overdue = activeEq.filter(e => !doneToday.has(e.id) && !draftEq.has(e.id));
    return { controls, okC, nokC, inProg, failItems, doneToday, overdue, activeEq, todaysControls };
  }, [db, flt, user]);

  const drill = (tab: string, extra: any = {}) => nav("reports", { tab, filters: { from: flt.from, to: flt.to, group: flt.group, shift: flt.shift, ...extra } });

  /* ── بدنه ویجت‌ها ── */
  const W: Record<string, () => React.ReactNode> = {
    kpis: () => {
      const cards = [
        { label: "تجهیزات تحت پوشش", v: data.activeEq.length, icon: "box", tone: "text-ink", go: () => nav("manage", { tab: "equipment" }) },
        { label: "کنترل‌های بازه", v: data.okC + data.nokC, icon: "clipboard", tone: "text-acc", go: () => drill("daily") },
        { label: "سالم (OK)", v: data.okC, icon: "check", tone: "text-ok", go: () => drill("daily", { status: "completed" }) },
        { label: "دارای انحراف (NOK)", v: data.nokC, icon: "alert", tone: "text-nok", go: () => drill("nok") },
        { label: "در حال تکمیل", v: data.inProg, icon: "edit", tone: "text-warn", go: () => drill("daily", { status: "inprogress" }) },
        { label: "عقب‌افتاده امروز", v: data.overdue.length, icon: "clock", tone: "text-info", go: () => nav("control") },
      ];
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {cards.map((c, i) => (
            <button key={c.label} onClick={c.go} className="card card-h pressable p-4 text-right" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-mut">{c.label}</span>
                <Icon name={c.icon} size={16} className="text-mut" />
              </div>
              <div className={`font-disp text-3xl mt-2 ${c.tone}`}><CountUp value={c.v} /></div>
              <div className="text-[10px] text-mut mt-1">کلیک برای Drill-down →</div>
            </button>
          ))}
        </div>
      );
    },
    groups: () => {
      const today = todayKey();
      return (
        <div className="space-y-3.5">
          {visGroups.map(g => {
            const eqs = data.activeEq.filter(e => e.groupId === g.id);
            const done = eqs.filter(e => data.doneToday.has(e.id)).length;
            const pct = eqs.length ? Math.round((done / eqs.length) * 100) : 0;
            return (
              <button key={g.id} onClick={() => drill("daily", { group: g.id })} className="w-full text-right group">
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="flex items-center gap-2 font-semibold"><Icon name={g.icon} size={16} className="text-acc" />{g.name}</span>
                  <span className="tabnums text-xs text-mut">{fa(done)}/{fa(eqs.length)} · {fa(pct)}٪</span>
                </div>
                <div className="h-2 rounded-full bg-panel2 overflow-hidden border border-line">
                  <div className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-ok" : pct > 0 ? "bg-acc" : "bg-line2"}`} style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
          {!visGroups.length && <EmptyState icon="layers" title="گروهی در دسترس نیست" />}
        </div>
      );
    },
    barShift: () => {
      const rows = db.shifts.map(s => ({
        label: s.name.replace(" (شب)", ""),
        a: data.controls.filter(c => c.shiftId === s.id && c.status === "completed").length,
        b: data.controls.filter(c => c.shiftId === s.id && c.status === "nok").length,
      }));
      return <BarChart data={rows} aLabel="سالم (OK)" bLabel="انحراف (NOK)" onBar={l => drill("daily", { shift: db.shifts.find(s => s.name.replace(" (شب)", "") === l)?.id || "" })} />;
    },
    trend: () => {
      const days: string[] = []; let k = flt.from; let guard = 0;
      while (k <= flt.to && guard < 366) { days.push(k); k = addDays(k, 1); guard++; }
      const nokSeries = days.map(dk => data.controls.filter(c => c.dateKey === dk && c.status === "nok").length);
      const allSeries = days.map(dk => data.controls.filter(c => c.dateKey === dk).length);
      return <>
        {k <= flt.to && <p className="text-xs text-warn mb-2">نمودار فقط ۳۶۶ روز نخست بازه را نشان می‌دهد؛ برای مشاهدهٔ همه، بازه را کوتاه‌تر کنید.</p>}
        <LineChart labels={days.map(d => { const p = parseKey(d); return `${p.jm}/${p.jd}`; })}
          series={[{ name: "کل کنترل‌ها", color: "#4cc3d9", points: allSeries }, { name: "انحرافات (NOK)", color: "#e5484d", points: nokSeries }]} />
      </>;
    },
    failLoc: () => {
      const m = new Map<string, number>();
      data.failItems.forEach(f => m.set(f.failLocId, (m.get(f.failLocId) || 0) + 1));
      const slices = db.failLocs.map((fl, i) => ({ label: fl.name, value: m.get(fl.id) || 0, color: PALETTE[i % PALETTE.length] })).filter(s => s.value > 0);
      return slices.length ? <Donut slices={slices} centerLabel="خرابی" onSlice={() => drill("nok")} /> : <EmptyState icon="check" title="بدون انحراف در بازه" sub="هیچ مورد NOK ثبت نشده است" />;
    },
    failGroup: () => {
      const m = new Map<string, number>();
      data.failItems.forEach(f => m.set(f.groupId, (m.get(f.groupId) || 0) + 1));
      const slices = db.groups.map((g, i) => ({ label: g.name, value: m.get(g.id) || 0, color: PALETTE[i % PALETTE.length] })).filter(s => s.value > 0);
      return slices.length ? <Donut slices={slices} centerLabel="خرابی" onSlice={l => drill("nok", { group: db.groups.find(g => g.name === l)?.id || "" })} /> : <EmptyState icon="check" title="بدون انحراف در بازه" />;
    },
    hours: () => {
      const eqs = visEq.filter(e => db.groups.find(g => g.id === e.groupId)?.trackHours && e.status !== "retired").slice(0, 6);
      if (!eqs.length) return <EmptyState icon="timer" title="تجهیز مشمول ساعت کارکرد نیست" />;
      return (
        <div className="grid sm:grid-cols-2 gap-2.5">
          {eqs.map(e => {
            const last = lastOpHours(db, e.id);
            const g = groupById(db, e.groupId);
            return (
              <button key={e.id} onClick={() => drill("hours", { equipment: e.id })} className="card-h border border-line rounded-lg p-3 text-right hover:border-acc/50 transition-colors bg-panel2/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold truncate flex items-center gap-1.5"><Icon name={g?.icon || "box"} size={14} className="text-acc" />{e.name}</span>
                  <Badge tone="mut">{last?.source === "ADJUSTED" ? "اصلاحی" : last ? "دستی" : "نامشخص"}</Badge>
                </div>
                <div className="flex items-end justify-between mt-2">
                  <span className="font-disp text-xl tabnums text-ink">{last ? fa(last.hours.toLocaleString("en-US")) : "—"}</span>
                  <span className="text-[10px] text-mut mb-0.5">ساعت کارکرد {last?.diff != null && <b className="text-acc">+{fa(last.diff)}</b>}</span>
                </div>
              </button>
            );
          })}
        </div>
      );
    },
    overdue: () => {
      const list = data.overdue.slice(0, 7);
      if (!list.length) return <EmptyState icon="check" title="همه تجهیزات امروز کنترل شده‌اند" sub="هیچ مورد عقب‌افتاده‌ای وجود ندارد" />;
      return (
        <div className="space-y-2">
          {list.map(e => {
            const g = groupById(db, e.groupId);
            return (
              <div key={e.id} className="flex items-center gap-3 border border-line rounded-lg px-3 py-2.5 bg-panel2/40">
                <span className="w-8 h-8 rounded-lg bg-nok/12 text-nok border border-nok/25 flex items-center justify-center shrink-0"><Icon name={g?.icon || "box"} size={16} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{e.name}</div>
                  <div className="text-[11px] text-mut tabnums">{e.code} · {e.hall} / {e.line}</div>
                </div>
                <Btn size="sm" kind="outline" onClick={() => nav("form", { equipmentId: e.id })}>ثبت کنترل</Btn>
              </div>
            );
          })}
          {data.overdue.length > 7 && <p className="text-[11px] text-mut text-center pt-1">و {fa(data.overdue.length - 7)} مورد دیگر…</p>}
        </div>
      );
    },
    tech: () => {
      const techs = db.users.filter(u => u.role === "technician" || u.role === "engineer");
      const today = todayKey();
      const rows = techs.map(t => ({
        t,
        n: db.controls.filter(c => c.techId === t.id && c.dateKey === today && c.status !== "cancelled").length,
        nok: db.controls.filter(c => c.techId === t.id && c.dateKey === today && c.status === "nok").length,
      })).sort((a, b) => b.n - a.n);
      const max = Math.max(1, ...rows.map(r => r.n));
      return (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.t.id} className="flex items-center gap-3">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-disp shrink-0 ${i === 0 && r.n > 0 ? "bg-acc text-accink" : "bg-panel2 text-mut border border-line"}`}>{r.t.name.slice(0, 1)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-xs mb-1"><span className="font-bold truncate">{r.t.name}</span><span className="tabnums text-mut">{fa(r.n)} بازدید {r.nok > 0 && <b className="text-nok">· {fa(r.nok)} NOK</b>}</span></div>
                <div className="h-1.5 bg-panel2 rounded-full overflow-hidden"><div className="h-full bg-acc rounded-full transition-all duration-700" style={{ width: `${(r.n / max) * 100}%` }} /></div>
              </div>
            </div>
          ))}
        </div>
      );
    },
    activity: () => user.role !== "admin" ? <EmptyState icon="shield" title="دسترسی به رویدادها محدود است" /> : (
      <div className="space-y-1">
        {db.logs.slice(-8).reverse().map(l => (
          <div key={l.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-panel2/60 transition-colors">
            <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${l.action === "DELETE" || l.action === "CANCEL" ? "bg-nok/10 text-nok border-nok/25" : l.action === "EXPORT" ? "bg-info/10 text-info border-info/25" : l.action === "LOGIN" ? "bg-acc/10 text-acc border-acc/25" : "bg-ok/10 text-ok border-ok/25"}`}>
              <Icon name={l.action === "EXPORT" ? "download" : l.action === "LOGIN" ? "key" : l.action === "DELETE" || l.action === "CANCEL" ? "trash" : l.action === "SYNC" ? "sync" : l.action === "BACKUP" ? "database" : "edit"} size={13} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate">{l.detail}</div>
              <div className="text-[10px] text-mut tabnums">{l.userName} · <span dir="ltr">{l.dateKey} - {l.time}</span></div>
            </div>
            <Badge tone="mut">{l.action}</Badge>
          </div>
        ))}
      </div>
    ),
  };

  const missing = Object.keys(WIDGET_META).filter(k => !layout.some(w => w.key === k));
  const spanCls = (s: number) => (s === 12 ? "col-span-12" : s === 8 ? "col-span-12 lg:col-span-8" : s === 7 ? "col-span-12 lg:col-span-7" : s === 6 ? "col-span-12 lg:col-span-6" : s === 5 ? "col-span-12 lg:col-span-5" : "col-span-12 lg:col-span-4");

  return (
    <div className="space-y-5">
      {/* فیلتر اصلی داشبورد — همگام با همه ویجت‌ها */}
      <Reveal>
        <div className="card p-4 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-bold"><Icon name="filter" size={17} className="text-acc" />فیلتر داشبورد</span>
          <Select className="w-52" value={flt.group} onChange={v => setFlt({ ...flt, group: v })} placeholder="همه گروه‌های تجهیزات"
            options={visGroups.map(g => ({ value: g.id, label: g.name }))} />
          <JRangePicker from={flt.from} to={flt.to} onChange={(f, t) => setFlt({ ...flt, from: f, to: t })} />
          <Select className="w-36" value={flt.shift} onChange={v => setFlt({ ...flt, shift: v })} placeholder="همه شیفت‌ها"
            options={db.shifts.map(s => ({ value: s.id, label: s.name }))} />
          <span className="flex-1" />
          <span className="text-[11px] text-mut tabnums hidden md:block">{fa(dateTitle(flt.from))} ← {fa(dateTitle(flt.to))}</span>
        </div>
      </Reveal>

      <Reveal delay={80}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-disp text-2xl">مرکز فرماندهی نگهداری</h1>
            <p className="text-xs text-mut mt-0.5">نمای کلی زنده بر اساس اطلاعات ثبت‌شده در پایگاه داده مرکزی</p>
          </div>
          <div className="flex gap-2">
            <Btn kind="soft" size="sm" onClick={() => setAddOpen(true)}><Icon name="plus" size={15} />افزودن ویجت</Btn>
            <Btn kind="ghost" size="sm" onClick={() => setResetLayout(true)}><Icon name="sync" size={15} />چیدمان پیش‌فرض</Btn>
          </div>
        </div>
      </Reveal>

      <div className="grid grid-cols-12 gap-4">
        {layout.map((w, i) => (
          <Reveal key={w.key} delay={i * 55} className={spanCls(w.span)}>
            <div draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => {
                if (dragIdx === null || dragIdx === i) return;
                const l = [...layout]; const [m] = l.splice(dragIdx, 1); l.splice(i, 0, m);
                setLayout(l); setDragIdx(null);
              }}
              className={`card p-4 h-full ${dragIdx === i ? "opacity-40 border-dashed border-acc" : ""} transition-opacity`}>
              <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-line">
                <span className="flex items-center gap-2 text-sm font-disp text-base">
                  <Icon name={WIDGET_META[w.key]?.icon || "box"} size={16} className="text-acc" />
                  {WIDGET_META[w.key]?.title}
                </span>
                <span className="flex items-center gap-0.5 text-mut">
                  <button title="کشیدن و جابه‌جایی" className="p-1.5 hover:text-ink cursor-grab active:cursor-grabbing"><Icon name="drag" size={15} /></button>
                  <button title="تغییر اندازه" className="p-1.5 hover:text-ink" onClick={() => {
                    const order = [12, 8, 7, 6, 5, 4];
                    const next = order[(order.indexOf(w.span) + 1) % order.length];
                    setLayout(layout.map(x => x.key === w.key ? { ...x, span: next } : x));
                  }}><Icon name="expand" size={14} /></button>
                  <button title="حذف ویجت" className="p-1.5 hover:text-nok" onClick={() => setLayout(layout.filter(x => x.key !== w.key))}><Icon name="x" size={15} /></button>
                </span>
              </div>
              {W[w.key]?.()}
            </div>
          </Reveal>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="افزودن ویجت به داشبورد">
        {missing.length === 0 ? <EmptyState icon="grid" title="همه ویجت‌ها اضافه شده‌اند" /> : (
          <div className="grid sm:grid-cols-2 gap-2.5">
            {missing.map(k => (
              <button key={k} onClick={() => { setLayout([...layout, { key: k, span: 6 }]); setAddOpen(false); }}
                className="card-h border border-line rounded-lg p-3.5 text-right hover:border-acc/60 transition-colors flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-acc/12 text-acc flex items-center justify-center"><Icon name={WIDGET_META[k].icon} size={18} /></span>
                <div><div className="text-sm font-bold">{WIDGET_META[k].title}</div><div className="text-[11px] text-mut">افزودن به چیدمان من</div></div>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {resetLayout && (
        <Modal open onClose={() => setResetLayout(false)} title="بازنشانی چیدمان" footer={
          <>
            <Btn kind="primary" onClick={() => { setLayout(DEFAULT_LAYOUT); setResetLayout(false); }}>بازنشانی</Btn>
            <Btn kind="ghost" onClick={() => setResetLayout(false)}>انصراف</Btn>
          </>
        }>
          <p className="text-sm text-mut leading-7">چیدمان فعلی داشبورد شما با چیدمان پیش‌فرض سامانه جایگزین می‌شود. این عمل فقط روی حساب کاربری شما اثر دارد.</p>
        </Modal>
      )}
    </div>
  );
}

export function kpiOf(db: DB, user: User) {
  const today = todayKey();
  const visEq = db.equipments.filter(e => userGroupVisible(user, e.groupId));
  const doneToday = new Set(db.controls.filter(c => c.dateKey === today && c.status !== "cancelled").map(c => c.equipmentId));
  return { total: visEq.length, done: doneToday.size };
}
export { StatusBadge, userById };
