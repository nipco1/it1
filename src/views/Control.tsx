/* ── ورود به کنترل روزانه (بند ۶: Scan / Group Hierarchy / Search) ── */
import { useMemo, useState } from "react";
import { Icon } from "../components/icons";
import { Badge, Btn, Confirm, EmptyState, Modal, Reveal, SearchInput, Seg, StatusBadge, QRPattern } from "../components/ui";
import { useDB, userGroupVisible, groupById, eqById, deleteDraft, toast } from "../lib/store";
import type { User, Equipment } from "../lib/types";
import { fa, todayKey, dateTitle } from "../lib/jalali";
import CameraScanner from "../components/CameraScanner";

export default function Control({ user, nav }: { user: User; nav: (r: string, p?: any) => void }) {
  const db = useDB();
  const [mode, setMode] = useState("groups");
  const [groupId, setGroupId] = useState("");
  const [q, setQ] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [scanErr, setScanErr] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [qrOf, setQrOf] = useState<Equipment | null>(null);
  const [delDraft, setDelDraft] = useState<string | null>(null);
  const today = todayKey();

  const visGroups = useMemo(() =>
    db.groups.filter(g => g.isActive && userGroupVisible(user, g.id)).sort((a, b) => a.displayOrder - b.displayOrder), [db, user]);

  const todayState = (eqId: string) => {
    const c = db.controls.filter(c => c.equipmentId === eqId && c.dateKey === today && c.status !== "cancelled").sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""))[0];
    const d = db.drafts.find(x => x.equipmentId === eqId && x.techId === user.id && x.dateKey === today);
    if (c) return { type: "done" as const, control: c };
    if (d) return { type: "draft" as const, draft: d };
    return { type: "overdue" as const };
  };

  const equipList = (list: Equipment[]) => (
    <div className="space-y-2.5">
      {list.map((e, i) => {
        const g = groupById(db, e.groupId);
        const st = todayState(e.id);
        const disabled = e.status === "retired";
        return (
          <Reveal key={e.id} delay={i * 40}>
            <button disabled={disabled} onClick={() => nav("form", { equipmentId: e.id })}
              className={`w-full card card-h p-4 text-right flex items-center gap-4 ${disabled ? "opacity-45 pointer-events-none" : ""}`}>
              <span className="w-12 h-12 rounded-xl bg-acc/10 text-acc border border-acc/25 flex items-center justify-center shrink-0">
                <Icon name={g?.icon || "box"} size={24} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[15px]">{e.name}</span>
                  <Badge tone={e.status === "active" ? "mut" : e.status === "repair" ? "warn" : "nok"}>
                    {e.status === "active" ? e.code : e.status === "repair" ? "در حال تعمیر" : "از رده خارج"}
                  </Badge>
                </div>
                <div className="text-xs text-mut mt-1 tabnums">{e.code} · {e.brand} {e.model} · {e.hall} / {e.line} / {e.area}</div>
              </div>
              <div className="text-left shrink-0">
                {st.type === "done" ? <StatusBadge status={st.control.status} />
                  : st.type === "draft" ? <Badge tone="info"><span className="w-1.5 h-1.5 rounded-full bg-info dot-live" />ادامه پیش‌نویس</Badge>
                    : <Badge tone="nok"><Icon name="clock" size={11} />عقب‌افتاده</Badge>}
                <div className="text-[10px] text-mut mt-1.5 flex items-center justify-end gap-1">
                  {st.type === "done" && st.control.submittedAt && <span className="tabnums" dir="ltr">{st.control.submittedAt}</span>}
                  <Icon name="back" size={14} className="rotate-180" />
                </div>
              </div>
            </button>
          </Reveal>
        );
      })}
    </div>
  );

  const searchResults = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.equipments.filter(e =>
      userGroupVisible(user, e.groupId) &&
      (!s || e.name.toLowerCase().includes(s) || e.code.toLowerCase().includes(s) ||
        e.hall.includes(s) || e.line.includes(s) || e.area.includes(s)));
  }, [q, db, user]);

  const myDrafts = db.drafts.filter(d => d.techId === user.id && userGroupVisible(user, eqById(db, d.equipmentId)?.groupId || ""));
  const doneCount = db.controls.filter(c => c.dateKey === today && c.status !== "cancelled" && userGroupVisible(user, eqById(db, c.equipmentId)?.groupId || "")).length;
  const activeEq = db.equipments.filter(e => userGroupVisible(user, e.groupId) && e.status === "active");
  const selGroup = groupId ? groupById(db, groupId) : null;

  const tryScan = (rawCode: string) => {
    let code = String(rawCode || "").replace(/[\r\n\t]/g, "").trim();
    // QR payloads may be a plain asset code or a NIPCO URL carrying the code in its query.
    try {
      const scannedUrl = new URL(code);
      code = scannedUrl.searchParams.get("code") || scannedUrl.searchParams.get("equipment") ||
        scannedUrl.searchParams.get("asset") || decodeURIComponent(scannedUrl.pathname.split("/").filter(Boolean).pop() || code);
    } catch {
      // Labels may also carry a compact JSON payload. Plain HID barcode values remain unchanged.
      try {
        const payload = JSON.parse(code);
        if (payload && typeof payload === "object") {
          code = String(payload.code || payload.equipmentCode || payload.assetCode || payload.serial || code);
        }
      } catch { /* A plain barcode value is expected in the common case. */ }
    }
    const normalized = code.trim().toLocaleLowerCase();
    const e = db.equipments.find(x => x.code.trim().toLocaleLowerCase() === normalized ||
      (x.serial && x.serial.trim().toLocaleLowerCase() === normalized));
    if (!e) { setScanErr(`تجهیزی با کد «${code || rawCode}» یافت نشد`); return; }
    if (!userGroupVisible(user, e.groupId)) { setScanErr("دسترسی شما به گروه این تجهیز مجاز نیست"); return; }
    if (e.status === "retired") { setScanErr("این تجهیز از رده خارج شده است و امکان ثبت کنترل جدید برای آن وجود ندارد"); return; }
    setScanErr("");
    setScanCode(code);
    toast(`تجهیز شناسایی شد: ${e.name}`, "ok");
    nav("form", { equipmentId: e.id });
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* سرصفحه + آمار لحظه‌ای امروز */}
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-disp text-2xl">کنترل روزانه تجهیزات</h1>
            <p className="text-xs text-mut mt-1 tabnums">{fa(dateTitle(today))} — انتخاب تجهیز، فرم بازرسی را مستقیم باز می‌کند</p>
          </div>
          <div className="flex gap-2.5">
            {[
              { l: "انجام‌شده امروز", v: doneCount, t: "text-ok", i: "check" },
              { l: "پیش‌نویس باز", v: myDrafts.length, t: "text-info", i: "edit" },
              { l: "باقی‌مانده", v: Math.max(0, activeEq.length - doneCount - myDrafts.length), t: "text-nok", i: "clock" },
            ].map(s => (
              <div key={s.l} className="card px-4 py-2.5 flex items-center gap-2.5">
                <Icon name={s.i} size={17} className={s.t} />
                <div><div className={`font-disp text-xl leading-none ${s.t} tabnums`}>{fa(s.v)}</div><div className="text-[10px] text-mut mt-0.5">{s.l}</div></div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* پیش‌نویس‌های ماندگار */}
      {myDrafts.length > 0 && (
        <Reveal delay={60}>
          <div className="card p-4 border-info/40 bg-info/[.04]">
            <div className="flex items-center gap-2 mb-3 text-info text-sm font-bold"><Icon name="edit" size={16} />پیش‌نویس‌های ذخیره‌شده در پایگاه داده مرکزی</div>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {myDrafts.map(d => {
                const e = eqById(db, d.equipmentId);
                return (
                  <div key={d.id} className="flex items-center gap-3 bg-panel rounded-lg border border-line px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{e?.name}</div>
                      <div className="text-[11px] text-mut tabnums" dir="ltr">{d.updatedAt}</div>
                    </div>
                    <Btn size="sm" kind="primary" onClick={() => nav("form", { equipmentId: d.equipmentId, dateKey: d.dateKey })}>ادامه</Btn>
                    <button className="p-1.5 text-mut hover:text-nok" onClick={() => setDelDraft(d.id)}><Icon name="trash" size={16} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>
      )}

      <Reveal delay={100}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Seg value={mode} onChange={m => { setMode(m); setGroupId(""); }} options={[
            { id: "groups", label: <span className="flex items-center gap-1.5"><Icon name="layers" size={15} />سلسله‌مراتب گروه‌ها</span> },
            { id: "search", label: <span className="flex items-center gap-1.5"><Icon name="search" size={15} />جستجو</span> },
            { id: "scan", label: <span className="flex items-center gap-1.5"><Icon name="scan" size={15} />ورود کد QR / بارکد</span> },
          ]} />
        </div>
      </Reveal>

      {mode === "groups" && !selGroup && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {visGroups.map((g, i) => {
            const eqs = activeEq.filter(e => e.groupId === g.id);
            const done = eqs.filter(e => todayState(e.id).type === "done").length;
            const pct = eqs.length ? Math.round((done / eqs.length) * 100) : 0;
            return (
              <Reveal key={g.id} delay={i * 55}>
                <button onClick={() => setGroupId(g.id)} className="card card-h w-full p-5 text-right group">
                  <div className="flex items-start justify-between">
                    <span className="w-13 h-13 p-3 rounded-xl bg-acc/10 text-acc border border-acc/25 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Icon name={g.icon} size={26} />
                    </span>
                    <Badge tone={g.trackHours ? "info" : "mut"}>{g.trackHours ? "دارای ساعت کارکرد" : g.code}</Badge>
                  </div>
                  <div className="font-disp text-xl mt-3.5">{g.name}</div>
                  <div className="text-xs text-mut mt-1 leading-6 h-6 overflow-hidden">{g.description}</div>
                  <div className="mt-3.5">
                    <div className="flex justify-between text-[11px] text-mut mb-1.5 tabnums"><span>پیشرفت بازدید امروز</span><span>{fa(done)}/{fa(eqs.length)}</span></div>
                    <div className="h-1.5 rounded-full bg-panel2 border border-line overflow-hidden">
                      <div className={`h-full transition-all duration-700 ${pct === 100 ? "bg-ok" : "bg-acc"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>
      )}

      {mode === "groups" && selGroup && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Btn kind="ghost" size="sm" onClick={() => setGroupId("")}><Icon name="back" size={16} />همه گروه‌ها</Btn>
            <span className="font-disp text-lg flex items-center gap-2"><Icon name={selGroup.icon} size={19} className="text-acc" />{selGroup.name}</span>
            <span className="text-xs text-mut tabnums">{fa(db.equipments.filter(e => e.groupId === selGroup.id && e.status !== "retired").length)} تجهیز</span>
          </div>
          {equipList(db.equipments.filter(e => e.groupId === selGroup.id && e.status !== "retired"))}
        </div>
      )}

      {mode === "search" && (
        <div className="space-y-4">
          <SearchInput value={q} onChange={setQ} placeholder="جستجوی نام، کد اموال، سالن، خط یا ناحیه…" />
          {q.trim() ? (
            searchResults.length ? equipList(searchResults) : <EmptyState icon="search" title="موردی یافت نشد" sub="عبارت دیگری را امتحان کنید یا از سلسله‌مراتب گروه‌ها استفاده کنید" />
          ) : (
            <div className="card p-6"><EmptyState icon="search" title="جستجوی سراسری تجهیزات" sub="نام تجهیز (مثلاً «پرس»)، کد اموال (PRS-1000) یا موقعیت (سوله ۲) را تایپ کنید" /></div>
          )}
        </div>
      )}

      {mode === "scan" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Reveal><div className="card p-6 overflow-hidden flex flex-col">
            <div className="relative h-56 rounded-xl bg-bg2 border border-line overflow-hidden flex items-center justify-center">
              <div className="absolute inset-x-8 h-[2px] bg-acc/50 shadow-[0_0_14px_2px_var(--acc)]" style={{ animation: "scanline 2.6s ease-in-out infinite", position: "absolute" }} />
              <span className="absolute top-3 right-3 w-7 h-7 border-t-2 border-r-2 border-acc rounded-tr-lg" />
              <span className="absolute top-3 left-3 w-7 h-7 border-t-2 border-l-2 border-acc rounded-tl-lg" />
              <span className="absolute bottom-3 right-3 w-7 h-7 border-b-2 border-r-2 border-acc rounded-br-lg" />
              <span className="absolute bottom-3 left-3 w-7 h-7 border-b-2 border-l-2 border-acc rounded-bl-lg" />
              <div className="flex flex-col items-center gap-2 text-mut">
                <Icon name="camera" size={58} />
                <span className="text-xs">اسکن زنده QR و بارکد با دوربین</span>
              </div>
            </div>
            <p className="text-xs text-mut leading-6 mt-4">برای استفاده با گوشی، این صفحه باید با HTTPS باز شده باشد و اجازه دوربین را تأیید کنید. دوربین پشت گوشی به‌صورت پیش‌فرض انتخاب می‌شود. تصویر ذخیره نمی‌شود.</p>
            <Btn kind="primary" className="mt-4 w-full" onClick={() => setCameraOpen(true)}><Icon name="camera" size={16} />شروع اسکن با دوربین</Btn>
          </div></Reveal>
          <Reveal delay={80}><div className="card p-6 flex flex-col">
            <label className="lbl">کد تجهیز / کد اموال</label>
            <div className="relative">
              <Icon name="scan" size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-mut" />
              <input dir="ltr" style={{ textAlign: "left" }} className="inp pr-9 font-bold tabnums" placeholder="PRS-1000"
                value={scanCode} autoFocus
                onChange={e => { setScanCode(e.target.value); setScanErr(""); }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); tryScan(e.currentTarget.value); } }} />
            </div>
            {scanErr && <p role="alert" className="text-nok text-xs mt-2 flex items-center gap-1.5 a-pop"><Icon name="alert" size={14} />{scanErr}</p>}
            <div className="flex gap-2 mt-4 flex-wrap">
              <Btn kind="primary" onClick={() => tryScan(scanCode)} disabled={!scanCode.trim()}><Icon name="check" size={16} />شناسایی و باز کردن فرم</Btn>
            </div>
            <div className="mt-5 rounded-lg bg-panel2 border border-line p-3 text-xs text-mut leading-6">
              <div className="font-bold text-ink mb-1">اتصال بارکدخوان سخت‌افزاری</div>
              بارکدخوان USB یا Bluetooth را در حالت HID/Keyboard وصل کنید. پسوند اسکن دستگاه را روی Enter تنظیم کنید؛ بعد از خواندن کد، تجهیز به‌صورت خودکار شناسایی می‌شود. نیازی به نصب درایور اختصاصی نیست.
            </div>
            <div className="mt-5 pt-4 border-t border-line">
              <p className="lbl !mb-3">نمونه برچسب QR تجهیزات</p>
              <div className="flex gap-3 flex-wrap">
                {activeEq.slice(0, 6).map(e => (
                  <button key={e.id} onClick={() => setQrOf(e)} className="card-h border border-line rounded-lg p-2 hover:border-acc/60 transition-colors" title={e.name}>
                    <QRPattern seed={e.code} size={54} />
                  </button>
                ))}
              </div>
            </div>
          </div></Reveal>
        </div>
      )}

      <CameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onDetected={(value) => { setCameraOpen(false); tryScan(value); }} />

      {/* مودال برچسب QR تجهیز */}
      <Modal open={!!qrOf} onClose={() => setQrOf(null)} title="برچسب شناسایی تجهیز">
        {qrOf && (
          <div className="flex flex-col items-center gap-3">
            <QRPattern seed={qrOf.code} size={168} />
            <div className="text-center">
              <div className="font-disp text-lg">{qrOf.name}</div>
              <div className="text-sm text-mut tabnums" dir="ltr">{qrOf.code}</div>
              <div className="text-xs text-mut mt-1">{groupById(db, qrOf.groupId)?.name} · {qrOf.hall} / {qrOf.line}</div>
            </div>
            <Btn kind="primary" onClick={() => nav("form", { equipmentId: qrOf.id })}>باز کردن فرم کنترل</Btn>
          </div>
        )}
      </Modal>

      <Confirm open={!!delDraft} onClose={() => setDelDraft(null)} danger
        title="حذف پیش‌نویس" yesLabel="حذف پیش‌نویس"
        text="پیش‌نویس فقط با ثبت نهایی یا حذف صریح پاک می‌شود. آیا از حذف این پیش‌نویس مطمئن هستید؟ اطلاعات واردشده قابل بازیابی نخواهد بود."
        onYes={() => { if (delDraft) { deleteDraft(delDraft); toast("پیش‌نویس حذف شد", "info"); } }} />
    </div>
  );
}
