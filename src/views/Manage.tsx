/* ── مدیریت تجهیزات، گروه‌ها و چک‌لیست‌ساز پویا (بندهای ۴، ۵، ۱۱) ── */
import { useEffect, useState } from "react";
import { Icon } from "../components/icons";
import { Badge, Btn, Confirm, EmptyState, Field, JDatePicker, Modal, QRPattern, Reveal, SearchInput, Select, Tabs, Toggle } from "../components/ui";
import { useDB, mutate, toast, can, uid } from "../lib/store";
import type { EquipmentGroup, Equipment, ChecklistItem } from "../lib/types";
import { fa } from "../lib/jalali";

const ICONS = ["press", "robot", "compressor", "forklift", "flame", "zap", "wrench", "gauge", "factory", "box", "cog", "timer", "plug", "database", "shield"];

export default function Manage({ user, params }: { user: any; params: any }) {
  const db = useDB();
  const isAdmin = user?.role === "admin";
  const editable = can("equipment:edit");
  const [tab, setTab] = useState(params?.tab === "equipment" ? "equipment" : "groups");
  const [q, setQ] = useState("");

  /* ── Groups state ── */
  const [gModal, setGModal] = useState<EquipmentGroup | "new" | null>(null);
  const [gDel, setGDel] = useState<EquipmentGroup | null>(null);

  /* ── Equipment state ── */
  const [eModal, setEModal] = useState<Equipment | "new" | null>(null);
  const [eDel, setEDel] = useState<Equipment | null>(null);
  const [qr, setQr] = useState<Equipment | null>(null);
  const [fGroup, setFGroup] = useState("");

  /* ── Checklist state ── */
  const [clId, setClId] = useState(db.checklists[0]?.id || "");
  useEffect(() => {
    if (!clId && db.checklists.length) setClId(db.checklists[0].id);
  }, [clId, db.checklists]);
  const [secModal, setSecModal] = useState(false);
  const [secName, setSecName] = useState("");
  const [itModal, setItModal] = useState<{ secId: string; item?: ChecklistItem } | null>(null);
  const [clNew, setClNew] = useState(false);

  const groups = [...db.groups].sort((a, b) => a.displayOrder - b.displayOrder);
  const eqCount = (gid: string) => db.equipments.filter(e => e.groupId === gid).length;

  const saveGroup = (g: EquipmentGroup) => {
    mutate(d => {
      const i = d.groups.findIndex(x => x.id === g.id);
      if (i >= 0) d.groups[i] = g; else d.groups.push(g);
    }, { action: gModal === "new" ? "INSERT" : "UPDATE", entity: "EquipmentGroups", detail: `${gModal === "new" ? "ایجاد" : "ویرایش"} گروه «${g.name}» (${g.code})` });
    toast(`گروه «${g.name}» ذخیره شد`, "ok");
    setGModal(null);
  };

  const saveEq = (e: Equipment) => {
    mutate(d => {
      const i = d.equipments.findIndex(x => x.id === e.id);
      if (i >= 0) d.equipments[i] = e; else d.equipments.push(e);
    }, { action: eModal === "new" ? "INSERT" : "UPDATE", entity: "Equipment", detail: `${eModal === "new" ? "ثبت" : "ویرایش"} تجهیز «${e.name}» (${e.code})` });
    toast(`تجهیز «${e.name}» ذخیره شد`, "ok");
    setEModal(null);
  };

  const eqs = db.equipments.filter(e => (!fGroup || e.groupId === fGroup) &&
    (!q.trim() || e.name.includes(q.trim()) || e.code.toLowerCase().includes(q.trim().toLowerCase())));

  const cl = db.checklists.find(c => c.id === clId);
  const clSections = db.sections.filter(s => s.checklistId === clId).sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      <Reveal><div className="flex items-end justify-between flex-wrap gap-3">
        <div><h1 className="font-disp text-2xl">مدیریت پایه‌های سامانه</h1>
          <p className="text-xs text-mut mt-1">گروه‌ها، تجهیزات و موتور چک‌لیست‌ساز — بدون Hard-Code، کاملاً پویا</p></div>
      </div></Reveal>
      <Reveal delay={50}><Tabs value={tab} onChange={setTab} tabs={[
        { id: "groups", label: "گروه‌های تجهیزات", icon: "layers" },
        { id: "equipment", label: "تجهیزات", icon: "box" },
        { id: "checklists", label: "چک‌لیست‌ساز", icon: "clipboard" },
      ]} /></Reveal>

      {/* ═══ گروه‌ها ═══ */}
      {tab === "groups" && (
        <div className="space-y-3">
          {isAdmin && <Btn kind="primary" onClick={() => setGModal("new")}><Icon name="plus" size={16} />گروه جدید</Btn>}
          <div className="grid md:grid-cols-2 gap-3.5">
            {groups.map((g, i) => (
              <Reveal key={g.id} delay={i * 50}>
                <div className={`card p-4 ${!g.isActive ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3.5">
                    <span className="w-12 h-12 rounded-xl bg-acc/10 text-acc border border-acc/25 flex items-center justify-center shrink-0"><Icon name={g.icon} size={24} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-disp text-lg">{g.name}</span>
                        <Badge tone="mut"><span dir="ltr">{g.code}</span></Badge>
                        {g.trackHours && <Badge tone="info"><Icon name="timer" size={11} />ساعت کارکرد</Badge>}
                        <Badge tone={g.isActive ? "ok" : "nok"}>{g.isActive ? "فعال" : "غیرفعال"}</Badge>
                      </div>
                      <p className="text-xs text-mut mt-1 leading-6">{g.description}</p>
                      <div className="flex items-center gap-4 mt-2.5 text-[11px] text-mut">
                        <span className="tabnums">{fa(eqCount(g.id))} تجهیز</span>
                        <span className="tabnums">اولویت: {fa(g.displayOrder)}</span>
                        <span className="mr-auto flex gap-1">
                          {isAdmin && <>
                            <button className="p-1.5 rounded-md hover:bg-panel2 text-mut hover:text-acc" onClick={() => setGModal(g)} title="ویرایش"><Icon name="edit" size={15} /></button>
                            <button className="p-1.5 rounded-md hover:bg-panel2 text-mut hover:text-nok" onClick={() => setGDel(g)} title="حذف"><Icon name="trash" size={15} /></button>
                            <button className="p-1.5 rounded-md hover:bg-panel2 text-mut hover:text-warn" title={g.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
                              onClick={() => { mutate(d => { const x = d.groups.find(y => y.id === g.id)!; x.isActive = !x.isActive; }, { action: "UPDATE", entity: "EquipmentGroups", detail: `${g.isActive ? "غیرفعال" : "فعال"}‌سازی گروه «${g.name}» — سوابق گذشته محفوظ می‌ماند` }); toast(g.isActive ? "گروه غیرفعال شد — از فرم‌های جدید مخفی می‌شود" : "گروه فعال شد", "info"); }}>
                              <Icon name={g.isActive ? "eye" : "check"} size={15} />
                            </button>
                          </>}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      )}

      {/* ═══ تجهیزات ═══ */}
      {tab === "equipment" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2.5 items-center">
            <div className="w-64"><SearchInput value={q} onChange={setQ} placeholder="جستجوی نام یا کد…" /></div>
            <Select className="w-52" value={fGroup} onChange={setFGroup} placeholder="همه گروه‌ها" options={groups.map(g => ({ value: g.id, label: g.name }))} />
            <span className="text-xs text-mut tabnums">{fa(eqs.length)} تجهیز</span>
            <span className="flex-1" />
            {editable && <Btn kind="primary" onClick={() => setEModal("new")}><Icon name="plus" size={16} />تجهیز جدید</Btn>}
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-auto max-h-[560px]">
              <table className="tbl">
                <thead><tr><th>کد اموال</th><th>نام تجهیز</th><th>گروه</th><th>برند / مدل</th><th>ظرفیت</th><th>موقعیت</th><th>وضعیت</th><th>عملیات</th></tr></thead>
                <tbody>
                  {eqs.map(e => {
                    const g = db.groups.find(x => x.id === e.groupId);
                    return (
                      <tr key={e.id}>
                        <td className="tabnums font-bold text-acc" dir="ltr">{e.code}</td>
                        <td className="font-semibold">{e.name}</td>
                        <td><span className="flex items-center gap-1.5 text-mut"><Icon name={g?.icon || "box"} size={14} className="text-acc" />{g?.name}</span></td>
                        <td className="text-mut text-xs">{e.brand} — {e.model}</td>
                        <td className="text-mut text-xs">{e.capacity}</td>
                        <td className="text-xs tabnums">{e.hall} / {e.line} / {e.area}</td>
                        <td><Badge tone={e.status === "active" ? "ok" : e.status === "repair" ? "warn" : "nok"}>{e.status === "active" ? "فعال" : e.status === "repair" ? "در حال تعمیر" : "از رده خارج"}</Badge></td>
                        <td>
                          <div className="flex gap-0.5">
                            <button className="p-1.5 rounded-md hover:bg-panel2 text-mut hover:text-acc" onClick={() => setQr(e)} title="برچسب QR"><Icon name="qr" size={15} /></button>
                            {editable && <>
                              <button className="p-1.5 rounded-md hover:bg-panel2 text-mut hover:text-acc" onClick={() => setEModal(e)} title="ویرایش"><Icon name="edit" size={15} /></button>
                              {isAdmin && <button className="p-1.5 rounded-md hover:bg-panel2 text-mut hover:text-nok" onClick={() => setEDel(e)} title="حذف"><Icon name="trash" size={15} /></button>}
                            </>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!eqs.length && <EmptyState icon="box" title="تجهیزی یافت نشد" />}
            </div>
          </div>
        </div>
      )}

      {/* ═══ چک‌لیست‌ساز ═══ */}
      {tab === "checklists" && (
        <div className="grid lg:grid-cols-[290px_1fr] gap-4 items-start">
          <div className="card p-3 space-y-1.5">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs font-bold text-mut">چک‌لیست‌ها ({fa(db.checklists.length)})</span>
              {editable && <button className="p-1.5 rounded-md hover:bg-panel2 text-acc" onClick={() => setClNew(true)} title="چک‌لیست جدید"><Icon name="plus" size={16} /></button>}
            </div>
            {db.checklists.map(c => {
              const g = db.groups.find(x => x.id === c.groupId);
              const e = db.equipments.find(x => x.id === c.equipmentId);
              return (
                <button key={c.id} onClick={() => setClId(c.id)}
                  className={`w-full text-right rounded-lg px-3 py-2.5 transition-colors border ${clId === c.id ? "bg-acc/10 border-acc/40" : "border-transparent hover:bg-panel2"}`}>
                  <div className="text-sm font-bold flex items-center gap-2"><Icon name={g?.icon || "clipboard"} size={15} className="text-acc" />{c.name}</div>
                  <div className="text-[11px] text-mut mt-0.5">
                    {g ? <span>اختصاصی به گروه: {g.name}</span> : e ? <span>اختصاصی به تجهیز: {e.name}</span> : "عمومی"}
                    <span className="tabnums"> · {fa(db.sections.filter(s => s.checklistId === c.id).length)} بخش · {fa(db.items.filter(i => db.sections.some(s => s.checklistId === c.id && s.id === i.sectionId)).length)} آیتم</span>
                  </div>
                </button>
              );
            })}
            <p className="text-[11px] text-mut leading-6 px-1 pt-2 border-t border-line">هر تجهیز جدید به‌صورت خودکار چک‌لیست گروه خود را به ارث می‌برد؛ چک‌لیست اختصاصی تجهیز، اولویت بالاتری دارد.</p>
          </div>

          {cl ? (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="font-disp text-xl">{cl.name}</h3>
                {editable && <Btn kind="soft" size="sm" onClick={() => { setSecName(""); setSecModal(true); }}><Icon name="plus" size={15} />بخش جدید</Btn>}
              </div>
              {clSections.map((sec, si) => {
                const secItems = db.items.filter(i => i.sectionId === sec.id);
                return (
                  <Reveal key={sec.id} delay={si * 50}>
                    <div className="card overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-panel2/70 border-b border-line">
                        <span className="font-disp flex items-center gap-2"><span className="w-6 h-6 rounded-md bg-acc/15 text-acc flex items-center justify-center text-xs tabnums">{fa(si + 1)}</span>{sec.title}</span>
                        <span className="flex gap-1">
                          {editable && <>
                            <button className="p-1.5 rounded-md hover:bg-panel text-acc" onClick={() => setItModal({ secId: sec.id })} title="افزودن آیتم"><Icon name="plus" size={15} /></button>
                            {isAdmin && <button className="p-1.5 rounded-md hover:bg-panel text-nok" title="حذف بخش"
                              onClick={() => mutate(d => { d.items = d.items.filter(i => i.sectionId !== sec.id); d.sections = d.sections.filter(s => s.id !== sec.id); }, { action: "DELETE", entity: "ChecklistSections", detail: `حذف بخش «${sec.title}» و آیتم‌های آن` })}>
                              <Icon name="trash" size={15} /></button>}
                          </>}
                        </span>
                      </div>
                      <div className="divide-y divide-[var(--line)]">
                        {secItems.map(it => (
                          <div key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                            <Badge tone={it.type === "oknok" ? "ok" : "info"}>{it.type === "oknok" ? "OK / NOK" : "عددی"}</Badge>
                            <span className="text-sm flex-1">{it.title}</span>
                            {it.type === "numeric" && <span className="text-[11px] text-mut tabnums border border-line rounded-full px-2 py-0.5" dir="ltr">{it.min}–{it.max} {it.unit}</span>}
                            {editable && <>
                              <button className="p-1.5 rounded-md hover:bg-panel2 text-mut hover:text-acc" onClick={() => setItModal({ secId: sec.id, item: it })}><Icon name="edit" size={14} /></button>
                              {isAdmin && <button className="p-1.5 rounded-md hover:bg-panel2 text-mut hover:text-nok" onClick={() => mutate(d => { d.items = d.items.filter(x => x.id !== it.id); }, { action: "DELETE", entity: "ChecklistItems", detail: `حذف آیتم «${it.title}»` })}><Icon name="trash" size={14} /></button>}
                            </>}
                          </div>
                        ))}
                        {!secItems.length && <p className="text-xs text-mut px-4 py-3">آیتمی ندارد — با دکمه + آیتم OK/NOK یا عددی اضافه کنید.</p>}
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          ) : <div className="card p-8"><EmptyState icon="clipboard" title="چک‌لیستی انتخاب نشده" /></div>}
        </div>
      )}

      {/* ── مودال گروه ── */}
      {gModal && <GroupModal init={gModal === "new" ? null : gModal} onClose={() => setGModal(null)} onSave={saveGroup} />}
      {eModal && <EqModal init={eModal === "new" ? null : eModal} onClose={() => setEModal(null)} onSave={saveEq} />}

      {/* حذف گروه — قانون وابستگی */}
      <Confirm open={!!gDel} onClose={() => setGDel(null)} danger title="حذف گروه تجهیزات" yesLabel="حذف گروه"
        text={gDel && eqCount(gDel.id) > 0
          ? <>گروه «{gDel.name}» دارای <b className="text-nok tabnums">{fa(eqCount(gDel.id))}</b> تجهیز است. طبق قانون حذف ایمن، حذف فیزیکی گروه دارای تجهیزات <b>ممنوع</b> است. می‌توانید آن را غیرفعال کنید.</>
          : <>گروه «{gDel?.name}» برای همیشه حذف می‌شود. سوابق گزارشات گذشته محفوظ می‌مانند.</>}
        onYes={() => {
          if (gDel && eqCount(gDel.id) > 0) { toast("حذف گروه دارای تجهیزات مجاز نیست — از غیرفعال‌سازی استفاده کنید", "err"); return; }
          if (gDel) { mutate(d => { d.groups = d.groups.filter(x => x.id !== gDel.id); }, { action: "DELETE", entity: "EquipmentGroups", detail: `حذف گروه «${gDel.name}»` }); toast("گروه حذف شد", "info"); }
        }} />

      <Confirm open={!!eDel} onClose={() => setEDel(null)} danger title="حذف تجهیز" yesLabel="حذف تجهیز"
        text={<>تجهیز «{eDel?.name}» حذف می‌شود. سوابق کنترل‌های گذشته در گزارشات باقی می‌مانند ولی دیگر قابل انتخاب در فرم جدید نیست.</>}
        onYes={() => { if (eDel) { mutate(d => { d.equipments = d.equipments.filter(x => x.id !== eDel.id); }, { action: "DELETE", entity: "Equipment", detail: `حذف تجهیز «${eDel.name}» (${eDel.code})` }); toast("تجهیز حذف شد", "info"); } }} />

      {/* QR */}
      <Modal open={!!qr} onClose={() => setQr(null)} title="برچسب QR / بارکد تجهیز">
        {qr && (
          <div className="flex flex-col items-center gap-3">
            <QRPattern seed={qr.code} size={170} />
            <div className="text-center">
              <div className="font-disp text-lg">{qr.name}</div>
              <div className="tabnums text-sm text-mut" dir="ltr">{qr.code} · S/N: {qr.serial}</div>
              <div className="text-xs text-mut mt-1">{qr.hall} / {qr.line} / {qr.area}</div>
            </div>
            <p className="text-[11px] text-mut text-center leading-6">این برچسب را روی بدنه تجهیز نصب کنید تا تکنسین‌ها با اسکن، مستقیم وارد فرم کنترل روزانه شوند.</p>
          </div>
        )}
      </Modal>

      {/* بخش جدید */}
      <Modal open={secModal} onClose={() => setSecModal(false)} title="افزودن بخش به چک‌لیست" footer={
        <>
          <Btn kind="primary" disabled={!secName.trim()} onClick={() => {
            mutate(d => { d.sections.push({ id: uid(), checklistId: clId, title: secName.trim(), order: d.sections.length + 1 }); },
              { action: "INSERT", entity: "ChecklistSections", detail: `افزودن بخش «${secName}» به چک‌لیست` });
            setSecModal(false); toast("بخش اضافه شد", "ok");
          }}>افزودن بخش</Btn>
          <Btn kind="ghost" onClick={() => setSecModal(false)}>انصراف</Btn>
        </>
      }>
        <Field label="عنوان بخش" req><input className="inp" value={secName} onChange={e => setSecName(e.target.value)} placeholder="مثلاً: سیستم ایمنی" autoFocus /></Field>
      </Modal>

      {/* آیتم جدید / ویرایش */}
      {itModal && <ItemModal secId={itModal.secId} item={itModal.item} onClose={() => setItModal(null)} />}

      {/* چک‌لیست جدید */}
      <NewChecklistModal open={clNew} onClose={() => setClNew(false)} onCreated={id => setClId(id)} />
    </div>
  );
}

function GroupModal({ init, onClose, onSave }: { init: EquipmentGroup | null; onClose: () => void; onSave: (g: EquipmentGroup) => void }) {
  const [g, setG] = useState<EquipmentGroup>(init || { id: uid(), code: "", name: "", icon: "box", description: "", displayOrder: 8, isActive: true, trackHours: false });
  return (
    <Modal open onClose={onClose} title={init ? "ویرایش گروه تجهیزات" : "گروه تجهیزات جدید"} wide footer={
      <>
        <Btn kind="primary" disabled={!g.code.trim() || !g.name.trim()} onClick={() => onSave(g)}><Icon name="save" size={16} />ذخیره گروه</Btn>
        <Btn kind="ghost" onClick={onClose}>انصراف</Btn>
      </>
    }>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="کد اختصاری (GroupCode)" req><input className="inp" dir="ltr" style={{ textAlign: "left" }} value={g.code} onChange={e => setG({ ...g, code: e.target.value.toUpperCase() })} placeholder="HYD-PRESS" /></Field>
        <Field label="عنوان فارسی گروه" req><input className="inp" value={g.name} onChange={e => setG({ ...g, name: e.target.value })} placeholder="پرس‌های هیدرولیک" /></Field>
        <Field label="شرح و ملاحظات فنی"><input className="inp" value={g.description} onChange={e => setG({ ...g, description: e.target.value })} /></Field>
        <Field label="اولویت نمایش (DisplayOrder)"><input type="number" className="inp tabnums" dir="ltr" value={g.displayOrder} onChange={e => setG({ ...g, displayOrder: +e.target.value })} /></Field>
        <div className="sm:col-span-2">
          <label className="lbl">آیکون گروه</label>
          <div className="flex flex-wrap gap-2">
            {ICONS.map(ic => (
              <button key={ic} onClick={() => setG({ ...g, icon: ic })}
                className={`w-11 h-11 rounded-lg border flex items-center justify-center transition-all ${g.icon === ic ? "bg-acc text-accink border-acc scale-110" : "border-line text-mut hover:border-acc/50"}`}>
                <Icon name={ic} size={20} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <Toggle checked={g.isActive} onChange={v => setG({ ...g, isActive: v })} label="گروه فعال" />
          <Toggle checked={g.trackHours} onChange={v => setG({ ...g, trackHours: v })} label="پایش ساعت کارکرد" />
        </div>
      </div>
    </Modal>
  );
}

function EqModal({ init, onClose, onSave }: { init: Equipment | null; onClose: () => void; onSave: (e: Equipment) => void }) {
  const db = useDB();
  const [e, setE] = useState<Equipment>(init || { id: uid(), code: "", name: "", groupId: db.groups[0]?.id || "", brand: "", model: "", serial: "", capacity: "", hall: "", line: "", area: "", status: "active", commissionDate: "1403/01/01" });
  const U = (p: any) => setE({ ...e, ...p });
  return (
    <Modal open onClose={onClose} title={init ? "ویرایش شناسنامه تجهیز" : "ثبت تجهیز جدید"} wide footer={
      <>
        <Btn kind="primary" disabled={!e.code.trim() || !e.name.trim() || !e.groupId} onClick={() => onSave(e)}><Icon name="save" size={16} />ذخیره تجهیز</Btn>
        <Btn kind="ghost" onClick={onClose}>انصراف</Btn>
      </>
    }>
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="کد اموال (یکتا)" req><input className="inp" dir="ltr" style={{ textAlign: "left" }} value={e.code} onChange={ev => U({ code: ev.target.value.toUpperCase() })} placeholder="PRS-1000" /></Field>
        <Field label="نام تجهیز" req><input className="inp" value={e.name} onChange={ev => U({ name: ev.target.value })} /></Field>
        <Field label="گروه تجهیزات (الزامی)" req>
          <Select value={e.groupId} onChange={v => U({ groupId: v })} options={db.groups.filter(g => g.isActive || g.id === e.groupId).map(g => ({ value: g.id, label: g.name }))} />
        </Field>
        <Field label="برند"><input className="inp" value={e.brand} onChange={ev => U({ brand: ev.target.value })} /></Field>
        <Field label="مدل"><input className="inp" value={e.model} onChange={ev => U({ model: ev.target.value })} /></Field>
        <Field label="شماره سریال"><input className="inp" dir="ltr" style={{ textAlign: "left" }} value={e.serial} onChange={ev => U({ serial: ev.target.value })} /></Field>
        <Field label="ظرفیت / توان فنی"><input className="inp" value={e.capacity} onChange={ev => U({ capacity: ev.target.value })} placeholder="۱۰۰۰ تن" /></Field>
        <Field label="سالن (Hall)"><input className="inp" value={e.hall} onChange={ev => U({ hall: ev.target.value })} /></Field>
        <Field label="خط (Line)"><input className="inp" value={e.line} onChange={ev => U({ line: ev.target.value })} /></Field>
        <Field label="ناحیه (Area)"><input className="inp" value={e.area} onChange={ev => U({ area: ev.target.value })} /></Field>
        <Field label="وضعیت">
          <Select value={e.status} onChange={v => U({ status: v })} options={[{ value: "active", label: "فعال" }, { value: "repair", label: "در حال تعمیر" }, { value: "retired", label: "از رده خارج" }]} />
        </Field>
        <Field label="تاریخ بهره‌برداری (شمسی)"><JDatePicker value={e.commissionDate} onChange={v => U({ commissionDate: v })} /></Field>
      </div>
    </Modal>
  );
}

function ItemModal({ secId, item, onClose }: { secId: string; item?: ChecklistItem; onClose: () => void }) {
  const [it, setIt] = useState<ChecklistItem>(item ? { ...item } : { id: uid(), sectionId: secId, title: "", type: "oknok" });
  const save = () => {
    mutate(d => {
      const i = d.items.findIndex(x => x.id === it.id);
      if (i >= 0) d.items[i] = it; else d.items.push(it);
    }, { action: item ? "UPDATE" : "INSERT", entity: "ChecklistItems", detail: `${item ? "ویرایش" : "افزودن"} آیتم «${it.title}»` });
    toast("آیتم ذخیره شد", "ok"); onClose();
  };
  return (
    <Modal open onClose={onClose} title={item ? "ویرایش آیتم چک‌لیست" : "آیتم جدید"} footer={
      <>
        <Btn kind="primary" disabled={!it.title.trim() || (it.type === "numeric" && (it.min === undefined || it.max === undefined))} onClick={save}><Icon name="save" size={16} />ذخیره آیتم</Btn>
        <Btn kind="ghost" onClick={onClose}>انصراف</Btn>
      </>
    }>
      <div className="space-y-4">
        <Field label="عنوان آیتم" req><input className="inp" value={it.title} onChange={e => setIt({ ...it, title: e.target.value })} autoFocus /></Field>
        <Field label="نوع آیتم">
          <div className="flex gap-2">
            {(["oknok", "numeric"] as const).map(t => (
              <button key={t} onClick={() => setIt({ ...it, type: t })}
                className={`flex-1 py-2.5 rounded-lg border-2 font-bold text-sm transition-all ${it.type === t ? "border-acc bg-acc/10 text-acc" : "border-line text-mut"}`}>
                {t === "oknok" ? "انتخابی OK / NOK" : "ورودی عددی (Min/Max)"}
              </button>
            ))}
          </div>
        </Field>
        {it.type === "numeric" && (
          <div className="grid grid-cols-4 gap-3 a-fadeup">
            <Field label="حداقل" req><input type="number" className="inp tabnums" dir="ltr" value={it.min ?? ""} onChange={e => setIt({ ...it, min: e.target.value === "" ? undefined : +e.target.value })} /></Field>
            <Field label="حداکثر" req><input type="number" className="inp tabnums" dir="ltr" value={it.max ?? ""} onChange={e => setIt({ ...it, max: e.target.value === "" ? undefined : +e.target.value })} /></Field>
            <Field label="اعشار"><input type="number" className="inp tabnums" dir="ltr" value={it.precision ?? 0} onChange={e => setIt({ ...it, precision: +e.target.value })} /></Field>
            <Field label="واحد"><input className="inp" dir="ltr" value={it.unit || ""} onChange={e => setIt({ ...it, unit: e.target.value })} placeholder="bar" /></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

function NewChecklistModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const db = useDB();
  const [name, setName] = useState("");
  const [scope, setScope] = useState("group");
  const [target, setTarget] = useState(db.groups[0]?.id || "");
  useEffect(() => {
    if (!open) return;
    setName("");
    setScope("group");
    setTarget(db.groups[0]?.id || "");
  }, [open, db.groups]);
  return (
    <Modal open={open} onClose={onClose} title="چک‌لیست جدید" footer={
      <>
        <Btn kind="primary" disabled={!name.trim() || !target} onClick={() => {
          const id = uid();
          mutate(d => { d.checklists.push({ id, name: name.trim(), ...(scope === "group" ? { groupId: target } : { equipmentId: target }) }); },
            { action: "INSERT", entity: "Checklists", detail: `ایجاد چک‌لیست «${name}»` });
          toast("چک‌لیست ایجاد شد — اکنون بخش‌ها و آیتم‌ها را بسازید", "ok");
          onCreated(id); onClose();
        }}><Icon name="plus" size={16} />ایجاد چک‌لیست</Btn>
        <Btn kind="ghost" onClick={onClose}>انصراف</Btn>
      </>
    }>
      <div className="space-y-4">
        <Field label="نام چک‌لیست" req><input className="inp" value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
        <Field label="سطح تخصیص">
          <div className="flex gap-2">
            <button onClick={() => { setScope("group"); setTarget(db.groups[0]?.id || ""); }} className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold ${scope === "group" ? "border-acc bg-acc/10 text-acc" : "border-line text-mut"}`}>کل گروه تجهیزات</button>
            <button onClick={() => { setScope("eq"); setTarget(db.equipments[0]?.id || ""); }} className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold ${scope === "eq" ? "border-acc bg-acc/10 text-acc" : "border-line text-mut"}`}>تجهیز مشخص</button>
          </div>
        </Field>
        <Field label={scope === "group" ? "گروه مقصد" : "تجهیز مقصد"}>
          <Select value={target} onChange={setTarget} options={scope === "group" ? db.groups.map(g => ({ value: g.id, label: g.name })) : db.equipments.map(e => ({ value: e.id, label: e.name }))} />
        </Field>
      </div>
    </Modal>
  );
}
