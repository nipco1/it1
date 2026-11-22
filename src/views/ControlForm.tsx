/* ── فرم یک‌پارچه کنترل روزانه (بند ۷، ۸، ۹، ۱۰، ۱۲ سند)
   تک‌صفحه‌ای — بدون Wizard — بدون دکمه «شروع بازدید» — Auto-Save دائمی ── */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Logo } from "../components/icons";
import { Badge, Btn, Confirm, Field, JDatePicker, Modal, Reveal, Select, StatusBadge } from "../components/ui";
import { useDB, checklistFor, groupById, eqById, userById, shiftById, userGroupVisible, saveDraft, deleteDraft, submitControl, cancelControl, toast, can, uid, uuid, printBus } from "../lib/store";
import type { User, DailyControl, ControlItemValue, ID } from "../lib/types";
import { todayKey, nowHM, shiftOfTime, fa, dateTitle } from "../lib/jalali";

export default function ControlForm({ user, nav, params }: { user: User; nav: (r: string, p?: any) => void; params: any }) {
  const db = useDB();
  const eq = eqById(db, params.equipmentId || "");
  const viewControl = params.controlId ? db.controls.find(c => c.id === params.controlId && c.equipmentId === params.equipmentId) : undefined;
  const group = eq ? groupById(db, eq.groupId) : undefined;
  const cl = eq ? checklistFor(db, eq) : undefined;
  const today = todayKey();

  // Resume only this technician's draft for this equipment and date.
  const initialDate = typeof params.dateKey === "string" && /^\d{4}\/\d{2}\/\d{2}$/.test(params.dateKey) ? params.dateKey : today;
  const initialDraft = db.drafts.find(d => d.equipmentId === params.equipmentId && d.techId === user.id && d.dateKey === initialDate);
  const [dateKey, setDateKey] = useState(initialDate);
  const [shiftId, setShiftId] = useState(() => {
    const candidate = initialDraft?.shiftId;
    if (candidate && db.shifts.some(s => s.id === candidate)) return candidate;
    return shiftOfTime(nowHM(), db.shifts);
  });
  const [items, setItems] = useState<Record<ID, ControlItemValue>>(() => initialDraft?.items || {});
  const [opHours, setOpHours] = useState<number | null>(initialDraft?.opHours ?? null);
  const [savedAt, setSavedAt] = useState<string>(initialDraft?.updatedAt || "");
  const [confirmDel, setConfirmDel] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<DailyControl | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDraft = db.drafts.find(d => d.equipmentId === params.equipmentId && d.techId === user.id && d.dateKey === dateKey);
  const draftKey = currentDraft?.id || `dr-${user.id}-${params.equipmentId}-${dateKey}`;
  const existingForDate = useMemo(() =>
    db.controls.filter(c => c.equipmentId === params.equipmentId && c.dateKey === dateKey && c.status !== "cancelled")
      .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""))[0],
    [db.controls, params.equipmentId, dateKey]);
  const readOnly = !!viewControl || (!!existingForDate && !currentDraft);
  const shownControl = viewControl || (readOnly ? existingForDate : undefined);
  const startedAt = useRef(initialDraft?.startedAt || `${today} - ${nowHM()}`);

  const changeDate = (nextDate: string) => {
    if (nextDate === dateKey || !eq || readOnly) return;
    // Save the old date before switching; never carry its answers to another date.
    if (!saveDraft({ id: draftKey, equipmentId: eq.id, dateKey, shiftId, techId: user.id,
      items, opHours, updatedAt: `${today} - ${nowHM()}`, startedAt: startedAt.current })) return;
    const next = db.drafts.find(d => d.equipmentId === eq.id && d.techId === user.id && d.dateKey === nextDate);
    setDateKey(nextDate);
    setShiftId(next?.shiftId && db.shifts.some(s => s.id === next.shiftId) ? next.shiftId : shiftOfTime(nowHM(), db.shifts));
    setItems(next?.items || {});
    setOpHours(next?.opHours ?? null);
    setSavedAt(next?.updatedAt || "");
    startedAt.current = next?.startedAt || `${today} - ${nowHM()}`;
  };

  /* Auto-Save → پایگاه داده مرکزی از طریق API (بند ۸) */
  const first = useRef(true);
  useEffect(() => {
    if (readOnly || !eq || submitting) return;
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      const at = `${today} - ${nowHM()}`;
      if (saveDraft({
        id: draftKey, equipmentId: eq.id, dateKey, shiftId, techId: user.id,
        items, opHours, updatedAt: at, startedAt: startedAt.current,
      })) setSavedAt(at);
    }, 450);
    autoSaveTimer.current = t;
    return () => { clearTimeout(t); autoSaveTimer.current = null; };
  }, [items, opHours, shiftId, dateKey, draftKey, readOnly, submitting]); // eslint-disable-line

  if (!eq || !group || !cl || !userGroupVisible(user, eq.groupId) || (params.controlId && !viewControl)) {
    return (
      <div className="max-w-2xl mx-auto card p-8 text-center space-y-4">
        <Icon name="alert" size={40} className="text-nok mx-auto" />
        <h2 className="font-disp text-xl">تجهیز یافت نشد</h2>
        <p className="text-sm text-mut">ممکن است تجهیز حذف یا گروه آن غیرفعال شده باشد.</p>
        <Btn kind="primary" onClick={() => nav("control")}>بازگشت به کنترل روزانه</Btn>
      </div>
    );
  }

  if (success) {
    const nokCount = Object.values(success.items).filter(v => v.result === "nok").length;
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card p-10 text-center a-pop">
          <span className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto border-4 ${success.status === "nok" ? "bg-nok/12 border-nok/40 text-nok" : "bg-ok/12 border-ok/40 text-ok"}`}>
            <Icon name={success.status === "nok" ? "alert" : "check"} size={40} />
          </span>
          <h2 className="font-disp text-2xl mt-5">فرم با موفقیت ثبت نهایی شد</h2>
          <p className="text-sm text-mut mt-2 leading-7">
            سند <b className="tabnums" dir="ltr">DC-{success.id.replace("dc-", "").padStart(4, "0")}</b> — {eq.name} — وضعیت:
          </p>
          <div className="flex justify-center mt-2"><StatusBadge status={success.status} /></div>
          {success.status === "nok" && <p className="text-xs text-nok mt-3">{fa(nokCount)} آیتم دارای انحراف ثبت شد و به فهرست NOK گزارشات ارسال گردید.</p>}
          <div className="flex flex-wrap justify-center gap-2.5 mt-7">
            <Btn kind="primary" onClick={() => printBus.send({ kind: "control", controlId: success.id })}><Icon name="printer" size={17} />چاپ / PDF (A4)</Btn>
            <Btn kind="soft" onClick={() => nav("reports", { tab: "daily" })}><Icon name="chart" size={17} />مشاهده در گزارشات</Btn>
            <Btn kind="ghost" onClick={() => nav("control")}>بازگشت به فهرست تجهیزات</Btn>
          </div>
        </div>
      </div>
    );
  }

  const get = (itemId: ID): ControlItemValue => items[itemId] || { itemId, result: null };
  const set = (itemId: ID, patch: Partial<ControlItemValue>) =>
    setItems(prev => ({ ...prev, [itemId]: { ...(prev[itemId] || { itemId, result: null }), ...patch } }));

  const evalNum = (v: number | null | undefined, min?: number, max?: number): "ok" | "nok" | null => {
    if (v === null || v === undefined || isNaN(v)) return null;
    if ((min !== undefined && v < min) || (max !== undefined && v > max)) return "nok";
    return "ok";
  };

  const total = cl.items.length;
  const answered = cl.items.filter(i => {
    const v = get(i.id);
    return i.type === "oknok" ? v.result !== null : evalNum(v.value, i.min, i.max) !== null;
  }).length;
  const nokItems = cl.items.filter(i => {
    const v = get(i.id);
    return i.type === "oknok" ? v.result === "nok" : evalNum(v.value, i.min, i.max) === "nok";
  });
  const invalid = nokItems.filter(i => {
    const v = get(i.id);
    return !v.failLocId || !(v.desc || "").trim();
  });
  const datedHours = db.opHours.filter(r => r.equipmentId === eq.id).sort((a, b) => (a.dateKey + a.time).localeCompare(b.dateKey + b.time));
  const previousHours = datedHours.filter(r => r.dateKey <= dateKey);
  const lastRec = previousHours[previousHours.length - 1] || null;
  const nextRec = datedHours.find(r => r.dateKey > dateKey) || null;
  const badHours = group.trackHours && (opHours === null || !Number.isFinite(opHours) || opHours < 0 ||
    (lastRec !== null && opHours < lastRec.hours) || (nextRec !== null && opHours > nextRec.hours));
  const dateInFuture = dateKey > today;
  const canSubmit = total > 0 && answered === total && invalid.length === 0 && !badHours && !dateInFuture && !existingForDate && group.isActive && can("control:submit");

  const doSubmit = async () => {
    if (!canSubmit || submitting) return;
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    setSubmitting(true);
    try {
      const hasNok = nokItems.length > 0;
      const finalItems: Record<ID, ControlItemValue> = {};
      cl.items.forEach(i => {
        const v = get(i.id);
        const result = i.type === "oknok" ? v.result : evalNum(v.value, i.min, i.max);
        const clean: ControlItemValue = { itemId: i.id, result };
        if (i.type === "numeric") clean.value = v.value;
        if (result === "nok") {
          clean.failLocId = v.failLocId;
          clean.desc = (v.desc || "").trim();
        }
        finalItems[i.id] = clean;
      });
      const control: DailyControl = {
        id: "dc-" + uuid(), equipmentId: eq.id, dateKey, shiftId, techId: user.id,
        status: hasNok ? "nok" : "completed", items: finalItems,
        opHours: group.trackHours ? opHours : undefined,
        opSource: group.trackHours ? "MANUAL" : undefined,
        createdAt: `${today} - ${nowHM()}`, submittedAt: `${today} - ${nowHM()}`,
        startedAt: startedAt.current,
      };
      let opRec: any;
      if (group.trackHours && opHours !== null && opHours !== lastRec?.hours) {
        opRec = {
          equipmentId: eq.id, hours: opHours,
          diff: lastRec ? Number((opHours - lastRec.hours).toFixed(2)) : null,
          source: "MANUAL", techId: user.id, dateKey, time: nowHM(),
          note: "ثبت دستی در فرم کنترل روزانه",
        };
      }
      const result = await submitControl(control, opRec);
      if (result !== "ok") {
        if (result === "duplicate") toast("برای این تجهیز و تاریخ سند ثبت‌شده وجود دارد؛ ثبت تکراری انجام نشد", "err");
        return;
      }
      setSuccess(control);
      toast(hasNok ? "فرم با انحراف (NOK) ثبت شد" : "فرم کنترل روزانه با موفقیت ثبت شد", hasNok ? "err" : "ok");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── نمای فقط‌خواندنی (فرم ثبت‌شده) ── */
  if (shownControl) {
    const sc = shownControl;
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Btn kind="ghost" onClick={() => nav("control")}><Icon name="back" size={17} />بازگشت</Btn>
            <h1 className="font-disp text-xl">سند ثبت‌شده کنترل روزانه</h1>
            <StatusBadge status={sc.status} />
          </div>
          <div className="flex gap-2">
            <Btn kind="primary" onClick={() => printBus.send({ kind: "control", controlId: sc.id })}><Icon name="printer" size={16} />چاپ / PDF</Btn>
            {can("control:approve") && sc.status !== "cancelled" && (
              <Btn kind="danger" onClick={() => setCancelOpen(true)}><Icon name="x" size={16} />ابطال سند</Btn>
            )}
          </div>
        </div>
        <FormBody db={db} eq={eq} group={group} cl={cl} dateKey={sc.dateKey} shiftId={sc.shiftId} techId={sc.techId}
          items={sc.items} opHours={sc.opHours ?? null} readOnly evalNum={evalNum} onCancelReason={sc.cancelReason} />
        <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="ابطال سند کنترل روزانه" footer={
          <>
            <Btn kind="danger" disabled={!cancelReason.trim()} onClick={() => { cancelControl(sc.id, cancelReason.trim()); toast("سند ابطال شد", "info"); setCancelOpen(false); nav("reports", { tab: "daily" }); }}>ابطال سند</Btn>
            <Btn kind="ghost" onClick={() => setCancelOpen(false)}>انصراف</Btn>
          </>
        }>
          <Field label="دلیل ابطال (الزامی)" req>
            <textarea className="inp min-h-24" value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="مثلاً: ثبت تکراری توسط تکنسین…" />
          </Field>
        </Modal>
      </div>
    );
  }

  /* ── نمای ویرایش ── */
  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-28">
      {/* هدر فرم */}
      <Reveal>
        <div className="card p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <Btn kind="ghost" size="sm" onClick={() => nav("control")}><Icon name="back" size={16} />بازگشت</Btn>
              <span className="w-14 h-14 rounded-xl bg-acc/10 text-acc border border-acc/25 flex items-center justify-center"><Icon name={group.icon} size={28} /></span>
              <div>
                <h1 className="font-disp text-2xl leading-tight">{eq.name}</h1>
                <div className="text-xs text-mut mt-1 flex flex-wrap gap-x-3 gap-y-1 tabnums">
                  <span dir="ltr">{eq.code}</span>
                  <span className="flex items-center gap-1"><Icon name="layers" size={12} />{group.name}</span>
                  <span className="flex items-center gap-1"><Icon name="factory" size={12} />{eq.hall} / {eq.line} / {eq.area}</span>
                </div>
              </div>
            </div>
            <div className="text-left">
              <Badge tone={group.trackHours ? "info" : "mut"}>{cl.checklist?.name}</Badge>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-mut">
                <span className={`w-2 h-2 rounded-full ${savedAt ? "bg-ok dot-live" : "bg-line2"}`} />
                {savedAt ? <span>Auto-Save: <b dir="ltr" className="tabnums">{savedAt}</b></span> : "در انتظار اولین تغییر…"}
              </div>
            </div>
          </div>
          {!group.isActive && <p className="mt-3 text-xs text-warn bg-warn/10 border border-warn/30 rounded-lg px-3 py-2 flex items-center gap-2"><Icon name="alert" size={14} />گروه این تجهیز غیرفعال است؛ ثبت فرم جدید محدود شده ولی سوابق قبلی محفوظ است.</p>}
          {/* اطلاعات پایه */}
          <div className="grid sm:grid-cols-3 gap-3.5 mt-5">
            <Field label="تاریخ شمسی"><JDatePicker value={dateKey} onChange={changeDate} /></Field>
            <Field label="شیفت کاری فعال">
              <Select value={shiftId} onChange={setShiftId} options={db.shifts.map(s => ({ value: s.id, label: `${s.name} (${s.from}–${s.to})` }))} />
            </Field>
            <Field label="تکنسین بازرسی"><div className="inp !bg-panel flex items-center gap-2 text-sm font-bold !cursor-default"><Icon name="user" size={15} className="text-acc" />{user.name}</div></Field>
          </div>
        </div>
      </Reveal>

        <FormBody db={db} eq={eq} group={group} cl={cl} dateKey={dateKey} shiftId={shiftId} techId={user.id}
          items={items} opHours={opHours} setOpHours={setOpHours} get={get} set={set} evalNum={evalNum} lastRec={lastRec} />

      {(dateInFuture || existingForDate || badHours) && <div role="alert" className="card p-3 text-xs text-nok border-nok/30">
        {dateInFuture && <p>ثبت برای تاریخ آینده مجاز نیست.</p>}
        {existingForDate && <p>برای این تجهیز و تاریخ سند ثبت‌شده وجود دارد؛ ثبت تکراری مجاز نیست.</p>}
        {badHours && <p>ساعت کارکرد الزامی است، باید نامنفی و بین قرائت‌های قبلی و بعدی باشد.</p>}
      </div>}

      {/* نوار عملیات چسبان */}
      <div className="fixed bottom-0 right-0 left-0 z-40 border-t border-line bg-panel/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <div className="flex justify-between text-[11px] font-bold mb-1.5">
              <span className="text-mut">پیشرفت تکمیل</span>
              <span className={answered === total ? "text-ok" : "text-acc tabnums"}>{fa(answered)} از {fa(total)} آیتم</span>
            </div>
            <div className="h-2 rounded-full bg-panel2 border border-line overflow-hidden">
              <div className={`h-full transition-all duration-500 ${answered === total ? "bg-ok" : "bg-acc"}`} style={{ width: `${(answered / Math.max(1, total)) * 100}%` }} />
            </div>
          </div>
          {currentDraft && <Btn kind="ghost" onClick={() => setConfirmDel(true)}><Icon name="trash" size={16} />حذف پیش‌نویس</Btn>}
          <Btn kind="primary" size="lg" disabled={!canSubmit || submitting} onClick={() => void doSubmit()} className="min-w-44">
            <Icon name={submitting ? "sync" : "check"} size={19} className={submitting ? "animate-spin" : ""} />{submitting ? "در حال ثبت در سرور…" : "ثبت نهایی فرم"}
          </Btn>
        </div>
      </div>

      <Confirm open={confirmDel} onClose={() => setConfirmDel(false)} danger title="حذف پیش‌نویس" yesLabel="حذف قطعی"
        text="این پیش‌نویس به‌طور دائم حذف می‌شود و اطلاعات واردشده قابل بازیابی نیست. ادامه می‌دهید؟"
        onYes={() => { deleteDraft(currentDraft?.id || draftKey); toast("پیش‌نویس حذف شد", "info"); nav("control"); }} />
    </div>
  );
}

/* ── بدنه مشترک فرم (ویرایش / فقط‌خواندنی) ── */
function FormBody({ db, eq, group, cl, items, opHours, setOpHours, readOnly, get, set, evalNum, lastRec, onCancelReason }: any) {
  const failLocName = (id: ID) => db.failLocs.find((f: any) => f.id === id)?.name || "—";
  return (
    <div className="space-y-4">
      {/* ساعت کارکرد — فقط لیفتراک و کمپرسور (بند ۱۲) */}
      {group.trackHours && (
        <Reveal delay={40}>
          <div className="card p-5 border-info/35">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h3 className="font-disp text-lg flex items-center gap-2"><Icon name="timer" size={19} className="text-info" />ساعت کارکرد تجهیز <Badge tone="info">Operating Hours</Badge></h3>
              {lastRec && <span className="text-xs text-mut tabnums">آخرین ثبت: <b dir="ltr">{lastRec.hours.toLocaleString("en-US")}</b> ساعت <span dir="ltr">({lastRec.dateKey})</span></span>}
            </div>
            {readOnly ? (
              <div className="flex items-center gap-3">
                <span className="font-disp text-3xl tabnums">{opHours != null ? fa(opHours.toLocaleString("en-US")) : "—"}</span>
                <span className="text-mut text-sm">ساعت</span>
                {opHours != null && lastRec && <Badge tone="acc">اختلاف: +{fa(Number((opHours - (lastRec.hours - (lastRec.diff || 0))).toFixed(1)).toLocaleString("en-US"))} از بازدید قبل</Badge>}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4 items-end">
                <Field label="ساعت کارکرد فعلی (بدون محدودیت عددی)" req>
                  <div className="relative">
                    <input type="number" step="0.1" min="0" dir="ltr" style={{ textAlign: "left" }} className="inp font-bold tabnums text-lg !py-3"
                      value={opHours ?? ""} placeholder={lastRec ? String(lastRec.hours) : "مثلاً 12480.5"}
                      onChange={e => setOpHours(e.target.value === "" ? null : Number(e.target.value))} />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mut text-xs font-bold">Hours</span>
                  </div>
                </Field>
                <div className="flex items-center gap-2.5">
                  <Badge tone="mut"><Icon name="edit" size={12} />ثبت دستی</Badge>
                  {opHours != null && lastRec && (
                    <Badge tone={opHours >= lastRec.hours ? "ok" : "nok"}>Δ {opHours >= lastRec.hours ? "+" : ""}{fa(Number((opHours - lastRec.hours).toFixed(1)))}</Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </Reveal>
      )}

      {/* بخش‌های بازرسی */}
      {cl.sections.map((sec: any, si: number) => {
        const secItems = cl.items.filter((i: any) => i.sectionId === sec.id);
        const done = secItems.filter((i: any) => {
          const v = items[i.id];
          return i.type === "oknok" ? v?.result : v?.value !== null && v?.value !== undefined;
        }).length;
        return (
          <Reveal key={sec.id} delay={si * 60}>
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 bg-panel2/70 border-b border-line">
                <h3 className="font-disp text-base flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-acc/15 text-acc font-disp flex items-center justify-center text-sm tabnums">{fa(si + 1)}</span>
                  {sec.title}
                </h3>
                <span className={`text-[11px] font-bold tabnums ${done === secItems.length ? "text-ok" : "text-mut"}`}>{fa(done)}/{fa(secItems.length)}</span>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {secItems.map((item: any) => {
                  const v: ControlItemValue = get ? get(item.id) : (items[item.id] || { itemId: item.id, result: null });
                  const numState = item.type === "numeric" ? evalNum?.(v.value, item.min, item.max) : null;
                  const isNok = item.type === "oknok" ? v.result === "nok" : numState === "nok";
                  return (
                    <div key={item.id} className={`px-5 py-4 transition-colors ${isNok ? "bg-nok/[.045]" : ""}`}>
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${isNok ? "bg-nok" : v.result === "ok" || numState === "ok" ? "bg-ok" : "bg-line2"}`} />
                          <span className="text-sm font-semibold">{item.title}</span>
                          {item.type === "numeric" && (
                            <span className="text-[10px] text-mut border border-line rounded-full px-2 py-0.5 tabnums whitespace-nowrap">
                              {item.min}–{item.max} {item.unit}
                            </span>
                          )}
                        </div>
                        {item.type === "oknok" ? (
                          readOnly ? (
                            <Badge tone={v.result === "ok" ? "ok" : v.result === "nok" ? "nok" : "mut"}>{v.result === "ok" ? "سالم OK" : v.result === "nok" ? "معیوب NOK" : "بدون ثبت"}</Badge>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => set(item.id, { result: v.result === "ok" ? null : "ok", failLocId: null, desc: "" })}
                                className={`pressable min-w-[92px] py-2.5 rounded-xl border-2 font-disp text-base transition-all ${v.result === "ok" ? "bg-ok border-ok text-white shadow-[0_4px_16px_-4px_var(--ok)]" : "border-line text-mut hover:border-ok/60 hover:text-ok"}`}>
                                ✓ سالم
                              </button>
                              <button onClick={() => set(item.id, { result: v.result === "nok" ? null : "nok" })}
                                className={`pressable min-w-[92px] py-2.5 rounded-xl border-2 font-disp text-base transition-all ${v.result === "nok" ? "bg-nok border-nok text-white shadow-[0_4px_16px_-4px_var(--nok)]" : "border-line text-mut hover:border-nok/60 hover:text-nok"}`}>
                                ✗ معیوب
                              </button>
                            </div>
                          )
                        ) : readOnly ? (
                          <div className="flex items-center gap-2">
                            <span className="font-disp text-xl tabnums">{v.value ?? "—"}</span>
                            <span className="text-xs text-mut">{item.unit}</span>
                            <Badge tone={numState === "ok" ? "ok" : numState === "nok" ? "nok" : "mut"}>{numState === "nok" ? "خارج از محدوده" : numState === "ok" ? "در محدوده" : "—"}</Badge>
                          </div>
                        ) : (
                          <div className="relative w-40">
                            <input type="number" dir="ltr" step={item.precision ? 1 / (10 ** item.precision) : 1} style={{ textAlign: "left" }}
                              className={`inp font-bold tabnums !py-2.5 ${numState === "nok" ? "!border-nok" : numState === "ok" ? "!border-ok/60" : ""}`}
                              placeholder="—" value={v.value ?? ""}
                              onChange={e => set(item.id, { value: e.target.value === "" ? null : Number(e.target.value) })} />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-mut">{item.unit}</span>
                          </div>
                        )}
                      </div>
                      {isNok && numState === "nok" && !readOnly && (
                        <p className="text-[11px] text-nok mt-2 pr-4 flex items-center gap-1.5 a-fadein"><Icon name="alert" size={13} />خروج از محدوده مجاز ({item.min}–{item.max} {item.unit}) — به‌صورت خودکار NOK شد</p>
                      )}
                      {isNok && (
                        readOnly ? (
                          <div className="mt-3 pr-4 grid sm:grid-cols-2 gap-3 text-sm">
                            <div className="bg-panel2/70 border border-line rounded-lg px-3 py-2"><span className="text-[11px] text-mut block">موقعیت خرابی</span><b className="text-nok">{failLocName(v.failLocId || "")}</b></div>
                            <div className="bg-panel2/70 border border-line rounded-lg px-3 py-2"><span className="text-[11px] text-mut block">شرح ایراد</span>{v.desc || "—"}</div>
                          </div>
                        ) : (
                          <div className="mt-3.5 pr-4 grid sm:grid-cols-2 gap-3 a-fadeup">
                            <Field label="موقعیت خرابی (Failure Location)" req>
                              <Select value={v.failLocId || ""} onChange={val => set(item.id, { failLocId: val })} placeholder="انتخاب کنید…"
                                options={db.failLocs.map((f: any) => ({ value: f.id, label: f.name }))} />
                            </Field>
                            <Field label="شرح ایراد (الزامی)" req>
                              <textarea className="inp min-h-[42px] !py-2" rows={1} value={v.desc || ""} placeholder="توضیح فنی ایراد مشاهده‌شده…"
                                onChange={e => set(item.id, { desc: e.target.value })} />
                            </Field>
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Reveal>
        );
      })}

      {onCancelReason && (
        <div className="card p-4 border-nok/40 bg-nok/[.05] flex items-center gap-3 text-sm">
          <Icon name="alert" size={20} className="text-nok shrink-0" />
          <div><b className="text-nok">سند ابطال شده</b><span className="text-mut"> — دلیل: {onCancelReason}</span></div>
        </div>
      )}
    </div>
  );
}

/* ── برگه چاپ A4 با ۳ کادر امضا (بند ۱۰ سند) ── */
export function PrintSheet({ controlId }: { controlId: ID }) {
  const db = useDB();
  const c = db.controls.find(x => x.id === controlId);
  if (!c) return null;
  const eq = eqById(db, c.equipmentId)!;
  const group = groupById(db, eq.groupId);
  const cl = checklistFor(db, eq);
  const tech = userById(db, c.techId);
  const shift = shiftById(db, c.shiftId);
  const docNo = `DC-${c.id.replace("dc-", "").padStart(4, "0")}`;
  const nokList = cl.items.filter(i => c.items[i.id]?.result === "nok");
  // Older documents lack a direct source reference; infer only an unambiguous match.
  const matchingReadings = db.opHours.filter(r => r.equipmentId === c.equipmentId && r.dateKey === c.dateKey && r.techId === c.techId && r.hours === c.opHours);
  const printedSource = c.opSource || (matchingReadings.length === 1 ? matchingReadings[0].source : undefined);
  return (
    <div className="print-sheet">
      <table style={{ marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={{ width: 64, textAlign: "center", background: "#fff" }}>
              <Logo size={46} light />
            </td>
            <td style={{ borderLeft: "1px solid #444" }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>شرکت NIPCO — {db.branding.title}</div>
              <div style={{ fontSize: 11, color: "#444" }}>فرم کنترل و بازدید روزانه تجهیزات (Daily Equipment Control)</div>
            </td>
            <td style={{ width: 170, textAlign: "center", fontSize: 11 }}>
              <div>کد فرم: <b dir="ltr">{docNo}</b></div>
              <div>نسخه: {db.branding.version} — صفحه ۱ از ۱</div>
              <div>تاریخ صدور: <b dir="ltr">{c.dateKey}</b></div>
            </td>
          </tr>
        </tbody>
      </table>
      <table style={{ marginBottom: 10 }}>
        <thead><tr><th>تجهیز</th><th>کد اموال</th><th>گروه تجهیز</th><th>موقعیت</th><th>تاریخ</th><th>شیفت</th><th>تکنسین</th><th>وضعیت</th></tr></thead>
        <tbody>
          <tr>
            <td><b>{eq.name}</b></td>
            <td dir="ltr">{eq.code}</td>
            <td>{group?.name}</td>
            <td>{eq.hall} / {eq.line} / {eq.area}</td>
            <td dir="ltr">{c.dateKey}</td>
            <td>{shift?.name}</td>
            <td>{tech?.name}</td>
            <td><b style={{ color: c.status === "nok" ? "#c00" : "#060" }}>{c.status === "nok" ? "دارای انحراف (NOK)" : c.status === "cancelled" ? "ابطال‌شده" : "سالم (OK)"}</b></td>
          </tr>
        </tbody>
      </table>
      {cl.sections.map(sec => {
        const secItems = cl.items.filter(i => i.sectionId === sec.id);
        return (
          <div key={sec.id} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 800, background: "#eee", border: "1px solid #444", padding: "4px 8px", fontSize: 12 }}>{sec.title}</div>
            <table>
              <thead><tr><th style={{ width: 24 }}>ردیف</th><th>آیتم بازرسی</th><th style={{ width: 90 }}>نتیجه</th><th style={{ width: 110 }}>مقدار / محدوده</th><th style={{ width: 100 }}>موقعیت خرابی</th><th>شرح ایراد</th></tr></thead>
              <tbody>
                {secItems.map((i, idx) => {
                  const v = c.items[i.id];
                  const r = v?.result;
                  return (
                    <tr key={i.id}>
                      <td>{idx + 1}</td>
                      <td>{i.title}</td>
                      <td style={{ color: r === "nok" ? "#c00" : "#060", fontWeight: 700 }}>{r === "ok" ? "سالم ✓" : r === "nok" ? "معیوب ✗" : "—"}</td>
                      <td dir="ltr" style={{ fontSize: 11 }}>{i.type === "numeric" ? `${v?.value ?? "—"} ${i.unit || ""} (${i.min}–${i.max})` : "OK / NOK"}</td>
                      <td>{r === "nok" ? (db.failLocs.find(f => f.id === v?.failLocId)?.name || "—") : "—"}</td>
                      <td style={{ fontSize: 11 }}>{r === "nok" ? v?.desc || "—" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {group?.trackHours && (
        <table style={{ marginBottom: 8 }}>
          <thead><tr><th>ساعت کارکرد ثبت‌شده</th><th>منبع ثبت</th><th>توضیحات تکمیلی</th></tr></thead>
          <tbody><tr>
            <td dir="ltr"><b>{c.opHours ?? "—"}</b> Hours</td>
            <td>{printedSource || "نامشخص"}</td>
            <td style={{ fontSize: 11 }}>ثبت در فرم کنترل روزانه.</td>
          </tr></tbody>
        </table>
      )}
      {nokList.length > 0 && (
        <div style={{ border: "1px solid #c00", background: "#fff5f5", padding: "6px 10px", marginBottom: 8, fontSize: 11.5 }}>
          <b style={{ color: "#c00" }}>موارد عدم انطباق ({nokList.length} مورد):</b>{" "}
          {nokList.map((i, x) => `${x + 1}) ${i.title} — ${c.items[i.id]?.desc || "بدون شرح"}`).join(" ؛ ")}
        </div>
      )}
      <table>
        <tbody>
          <tr>
            {[
              { t: "امضاء و نام تکنسین مجری", n: tech?.name || "" },
              { t: "امضاء و نام کارشناس نت", n: "........................" },
              { t: "امضاء و نام مدیر واحد نت و تعمیرات", n: "محمد روشندل" },
            ].map(s => (
              <td key={s.t} style={{ width: "33.3%", textAlign: "center", height: 92, verticalAlign: "bottom", paddingBottom: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700 }}>{s.t}</div>
                <div style={{ fontSize: 11.5, marginTop: 2 }}>{s.n}</div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#666", marginTop: 6 }}>
        <span>این سند بدون مهر و امضای سه‌گانه فاقد اعتبار است.</span>
        <span dir="ltr">NIPCO Daily Equipment Control — Generated {c.submittedAt}</span>
      </div>
    </div>
  );
}
