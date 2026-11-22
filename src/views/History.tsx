import { useMemo, useState } from "react";
import { Icon } from "../components/icons";
import { Badge, Btn, EmptyState, JRangePicker, Reveal, SearchInput, Select, StatusBadge } from "../components/ui";
import { eqById, groupById, shiftById, userById, userGroupVisible, useDB } from "../lib/store";
import { fa, todayKey } from "../lib/jalali";
import type { User } from "../lib/types";

const normalize = (text: string) => text.toLocaleLowerCase().trim()
  .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/ي/g, "ی").replace(/ك/g, "ک");

export default function History({ user, nav }: { user: User; nav: (route: string, params?: any) => void }) {
  const db = useDB();
  const [range, setRange] = useState(() => {
    const accessible = new Set(db.equipments.filter(e => userGroupVisible(user, e.groupId)).map(e => e.id));
    const dates = db.controls.filter(c => accessible.has(c.equipmentId) && /^\d{4}\/\d{2}\/\d{2}$/.test(c.dateKey)).map(c => c.dateKey).sort();
    const today = todayKey();
    return { from: dates[0] || today, to: dates.length && dates[dates.length - 1] > today ? dates[dates.length - 1] : today };
  });
  const [group, setGroup] = useState("");
  const [equipment, setEquipment] = useState("");
  const [shift, setShift] = useState("");
  const [technician, setTechnician] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const groups = db.groups.filter(g => userGroupVisible(user, g.id));
  const equipmentOptions = db.equipments.filter(e => userGroupVisible(user, e.groupId) && (!group || e.groupId === group));
  const records = useMemo(() => {
    const q = normalize(query);
    return db.controls.filter(c => {
      const eq = eqById(db, c.equipmentId);
      if (!eq || !userGroupVisible(user, eq.groupId)) return false;
      if (c.dateKey < range.from || c.dateKey > range.to) return false;
      if (group && eq.groupId !== group) return false;
      if (equipment && c.equipmentId !== equipment) return false;
      if (shift && c.shiftId !== shift) return false;
      if (technician && c.techId !== technician) return false;
      if (status && c.status !== status) return false;
      if (q) {
        const searchable = [c.id, eq.name, eq.code, groupById(db, eq.groupId)?.name || "", userById(db, c.techId)?.name || "", c.dateKey];
        if (!searchable.some(value => normalize(value).includes(q))) return false;
      }
      return true;
    }).sort((a, b) => (b.dateKey + (b.submittedAt || "")).localeCompare(a.dateKey + (a.submittedAt || "")));
  }, [db, user, range, group, equipment, shift, technician, status, query]);

  return (
    <div className="space-y-4">
      <Reveal><div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-disp text-2xl">سابقه کنترل روزانه</h1>
          <p className="text-xs text-mut mt-1">سوابق ثبت‌شده تجهیزات در گروه‌های مجاز شما؛ برای مشاهده جزئیات یک سند را انتخاب کنید.</p>
        </div>
        <Badge tone="acc"><Icon name="history" size={13} /><span className="tabnums">{fa(records.length)} سند</span></Badge>
      </div></Reveal>
      <Reveal delay={50}>
        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div role="group" aria-label="بازه تاریخ"><JRangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} /></div>
            <div role="group" aria-label="فیلتر گروه"><Select className="w-40" value={group} onChange={v => { setGroup(v); setEquipment(""); }} placeholder="همه گروه‌ها" options={groups.map(g => ({ value: g.id, label: g.name }))} /></div>
            <div role="group" aria-label="فیلتر تجهیز"><Select className="w-44" value={equipment} onChange={setEquipment} placeholder="همه تجهیزات" options={equipmentOptions.map(e => ({ value: e.id, label: e.name }))} /></div>
            <div role="group" aria-label="فیلتر شیفت"><Select className="w-32" value={shift} onChange={setShift} placeholder="همه شیفت‌ها" options={db.shifts.map(s => ({ value: s.id, label: s.name }))} /></div>
            <div role="group" aria-label="فیلتر تکنسین"><Select className="w-36" value={technician} onChange={setTechnician} placeholder="همه تکنسین‌ها" options={db.users.map(u => ({ value: u.id, label: u.name }))} /></div>
            <div role="group" aria-label="فیلتر وضعیت"><Select className="w-40" value={status} onChange={setStatus} placeholder="همه وضعیت‌ها" options={[{ value: "completed", label: "تکمیل‌شده (OK)" }, { value: "nok", label: "دارای انحراف" }, { value: "inprogress", label: "در حال تکمیل" }, { value: "cancelled", label: "ابطال‌شده" }]} /></div>
          </div>
          <div className="max-w-sm"><SearchInput value={query} onChange={setQuery} placeholder="جست‌وجوی تجهیز، کد، تکنسین یا سند…" /></div>
        </div>
      </Reveal>
      <Reveal delay={90}>
        <div className="card overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 bg-panel2/60 border-b border-line text-xs flex-wrap">
            <span className="font-bold">سوابق کنترل روزانه</span>
            <span className="text-mut tabnums">{fa(records.length)} سند در نتیجه</span>
            <span className="text-ok tabnums">{fa(records.filter(c => c.status === "completed").length)} سالم</span>
            <span className="text-nok tabnums">{fa(records.filter(c => c.status === "nok").length)} انحراف</span>
            <span className="text-mut tabnums">{fa(records.filter(c => c.status === "cancelled").length)} ابطال‌شده</span>
          </div>
          <div className="overflow-auto max-h-[560px]">
            <table className="tbl">
              <thead><tr><th>سند</th><th>تاریخ</th><th>تجهیز</th><th>گروه</th><th>شیفت</th><th>تکنسین</th><th>وضعیت</th><th>زمان ثبت</th><th>جزئیات</th></tr></thead>
              <tbody>{records.map(c => {
                const eq = eqById(db, c.equipmentId);
                return <tr key={c.id}>
                  <td className="tabnums text-acc font-bold" dir="ltr">DC-{c.id.replace("dc-", "").slice(0, 8)}</td>
                  <td className="tabnums">{fa(c.dateKey)}</td>
                  <td className="font-semibold">{eq?.name || "—"}</td>
                  <td className="text-mut">{groupById(db, eq?.groupId || "")?.name || "—"}</td>
                  <td className="text-mut">{shiftById(db, c.shiftId)?.name || "—"}</td>
                  <td>{userById(db, c.techId)?.name || "—"}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="tabnums text-mut" dir="ltr">{c.submittedAt || "—"}</td>
                  <td><Btn kind="ghost" size="sm" aria-label={`مشاهده سند ${c.id}`} onClick={() => nav("form", { equipmentId: c.equipmentId, controlId: c.id })}><Icon name="eye" size={15} />مشاهده</Btn></td>
                </tr>;
              })}</tbody>
            </table>
            {!records.length && <EmptyState icon="history" title="سابقه‌ای با این فیلترها یافت نشد" sub="بازه زمانی یا فیلترها را تغییر دهید" />}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
