/* ── NIPCO Shared UI Kit ── */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import qrcode from "qrcode-generator";
import { J_MONTHS, J_WEEK_SHORT, todayJ, todayKey, jKey, monthLen, weekIndex, parseKey, addDays, fa } from "../lib/jalali";
import { STATUS_FA, type ControlStatus } from "../lib/types";

export const styleTag = (
  <style>{`
  @keyframes growY { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  .grow-y { animation: growY .7s cubic-bezier(.2,.7,.3,1) both; transform-box: fill-box; transform-origin: bottom; }
  @keyframes drawL { from { stroke-dashoffset: 900; } to { stroke-dashoffset: 0; } }
  .draw-l { stroke-dasharray: 900; animation: drawL 1.1s ease-out both; }
  `}</style>
);

export function useNow(interval = 1000) {
  const [, setT] = useState(0);
  useEffect(() => { const i = setInterval(() => setT(x => x + 1), interval); return () => clearInterval(i); }, [interval]);
  return Date.now();
}

export function download(name: string, content: string, mime = "text/csv;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + content], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── Buttons & Badges ── */
const btnKinds: Record<string, string> = {
  primary: "bg-acc text-accink hover:bg-acc2 border border-transparent font-bold",
  ok: "bg-ok text-white hover:brightness-110 border border-transparent font-bold",
  danger: "bg-nok text-white hover:brightness-110 border border-transparent font-bold",
  soft: "bg-panel2 text-ink border border-line hover:border-line2",
  ghost: "bg-transparent text-mut hover:text-ink border border-transparent hover:bg-panel2",
  outline: "bg-transparent text-acc border border-acc/50 hover:bg-acc/10 font-semibold",
};
export function Btn({ kind = "soft", size = "md", className = "", children, ...rest }:
  { kind?: keyof typeof btnKinds; size?: "sm" | "md" | "lg" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sz = size === "sm" ? "px-3 py-1.5 text-xs" : size === "lg" ? "px-6 py-3 text-base" : "px-4 py-2 text-sm";
  return (
    <button className={`pressable inline-flex items-center justify-center gap-2 rounded-lg transition-all disabled:opacity-40 disabled:pointer-events-none ${btnKinds[kind]} ${sz} ${className}`} {...rest}>
      {children}
    </button>
  );
}

const badgeTones: Record<string, string> = {
  ok: "bg-ok/15 text-ok border-ok/30",
  nok: "bg-nok/15 text-nok border-nok/30",
  warn: "bg-warn/15 text-warn border-warn/30",
  info: "bg-info/15 text-info border-info/30",
  mut: "bg-panel2 text-mut border-line",
  acc: "bg-acc/15 text-acc border-acc/30",
};
export function Badge({ tone = "mut", children, className = "" }: { tone?: string; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${badgeTones[tone] || badgeTones.mut} ${className}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: ControlStatus | "draft" }) {
  const tone = { completed: "ok", nok: "nok", inprogress: "warn", cancelled: "mut", draft: "info" }[status];
  return <Badge tone={tone}><span className={`w-1.5 h-1.5 rounded-full ${status === "inprogress" ? "dot-live" : ""} ${tone === "ok" ? "bg-ok" : tone === "nok" ? "bg-nok" : tone === "warn" ? "bg-warn" : "bg-mut"}`} />{STATUS_FA[status]}</Badge>;
}

/* ── Form controls ── */
export function Field({ label, req, children, hint }: { label: string; req?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="lbl">{label}{req && <span className="text-nok"> *</span>}</label>
      {children}
      {hint && <p className="text-[11px] text-mut mt-1">{hint}</p>}
    </div>
  );
}

export function Select({ value, onChange, options, placeholder, className = "" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className={`relative ${className}`}>
      <select className="inp appearance-none pl-8 cursor-pointer" value={value} onChange={e => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Icon name="chevd" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mut pointer-events-none" />
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span className={`w-10 h-[22px] rounded-full p-[3px] transition-colors ${checked ? "bg-acc" : "bg-line2"}`}>
        <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "-translate-x-4" : ""}`} />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </button>
  );
}

export function Seg({ options, value, onChange }: { options: { id: string; label: ReactNode }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex bg-panel2 border border-line rounded-lg p-1 gap-1">
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`px-3.5 py-1.5 rounded-md text-sm font-semibold transition-all ${value === o.id ? "bg-acc text-accink shadow" : "text-mut hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Icon name="search" size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-mut" />
      <input className="inp pr-9" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {value && (
        <button onClick={() => onChange("")} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mut hover:text-ink">
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
}

/* ── Modal / Confirm ── */
export function Modal({ open, onClose, title, children, wide, footer }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] a-fadein" onClick={onClose} />
      <div className={`relative card a-pop w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[88vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <h3 className="font-disp text-lg">{title}</h3>
          <button onClick={onClose} className="text-mut hover:text-ink pressable"><Icon name="x" /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-line flex justify-start gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ open, onClose, onYes, title, text, danger, yesLabel = "بله، ادامه بده" }: {
  open: boolean; onClose: () => void; onYes: () => void; title: string; text: ReactNode; danger?: boolean; yesLabel?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={
      <>
        <Btn kind={danger ? "danger" : "primary"} onClick={() => { onYes(); onClose(); }}>{yesLabel}</Btn>
        <Btn kind="ghost" onClick={onClose}>انصراف</Btn>
      </>
    }>
      <div className="flex gap-3 items-start">
        <span className={`p-2.5 rounded-lg ${danger ? "bg-nok/15 text-nok" : "bg-warn/15 text-warn"}`}><Icon name="alert" size={22} /></span>
        <div className="text-sm leading-7 text-mut">{text}</div>
      </div>
    </Modal>
  );
}

/* ── Tabs & Empty ── */
export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; icon?: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors ${value === t.id ? "text-acc" : "text-mut hover:text-ink"}`}>
          {t.icon && <Icon name={t.icon} size={16} />}
          {t.label}
          {value === t.id && <span className="absolute bottom-0 right-0 left-0 h-[2.5px] bg-acc rounded-t" />}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon = "box", title, sub }: { icon?: string; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center a-fadein">
      <div className="w-16 h-16 rounded-2xl bg-panel2 border border-line flex items-center justify-center text-mut mb-4">
        <Icon name={icon} size={30} />
      </div>
      <p className="font-disp text-lg">{title}</p>
      {sub && <p className="text-sm text-mut mt-1 max-w-sm leading-6">{sub}</p>}
    </div>
  );
}

/* ── CountUp & Reveal ── */
export function CountUp({ value, dur = 750, className }: { value: number; dur?: number; className?: string }) {
  const [v, setV] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current, to = value, t0 = performance.now();
    let raf: number;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setV(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step); else prev.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);
  const display = Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);
  return <span className={`tabnums ${className || ""}`}>{display}</span>;
}

export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return <div className={`a-fadeup ${className}`} style={{ animationDelay: `${delay}ms` }}>{children}</div>;
}

/* ── Jalali Date Picker (بند ۳ سند) ── */
const YEARS = Array.from({ length: 21 }, (_, i) => 1395 + i);

function CalPanel({ view, setView, selected, inRange, onPick }: {
  view: { jy: number; jm: number }; setView: (v: { jy: number; jm: number }) => void;
  selected: (k: string) => boolean; inRange?: (k: string) => boolean; onPick: (k: string) => void;
}) {
  const len = monthLen(view.jy, view.jm);
  const first = jKey(view.jy, view.jm, 1);
  const blanks = weekIndex(first);
  const nav = (d: number) => {
    let { jy, jm } = view; jm += d;
    if (jm < 1) { jm = 12; jy--; } if (jm > 12) { jm = 1; jy++; }
    setView({ jy, jm });
  };
  return (
    <div className="w-[290px] select-none">
      <div className="flex items-center gap-1.5 mb-3">
        <button className="p-1.5 rounded-md hover:bg-panel2 text-mut hover:text-ink" onClick={() => nav(1)}><Icon name="back" size={16} style={{ transform: "scaleX(-1)" }} /></button>
        <select className="inp !py-1.5 !px-2 text-sm flex-1 cursor-pointer" value={view.jm} onChange={e => setView({ ...view, jm: +e.target.value })}>
          {J_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select className="inp !py-1.5 !px-2 text-sm w-[86px] cursor-pointer tabnums" value={view.jy} onChange={e => setView({ ...view, jy: +e.target.value })}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="p-1.5 rounded-md hover:bg-panel2 text-mut hover:text-ink" onClick={() => nav(-1)}><Icon name="back" size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {J_WEEK_SHORT.map(w => <div key={w} className="text-[11px] font-bold text-mut py-1">{w}</div>)}
        {Array.from({ length: blanks }).map((_, i) => <div key={"b" + i} />)}
        {Array.from({ length: len }).map((_, i) => {
          const k = jKey(view.jy, view.jm, i + 1);
          const sel = selected(k), inR = inRange?.(k);
          return (
            <button key={k} onClick={() => onPick(k)}
              className={`h-9 rounded-lg text-sm tabnums transition-all pressable ${sel ? "bg-acc text-accink font-bold shadow" : inR ? "bg-acc/20 text-acc" : "hover:bg-panel2 text-ink"}`}>
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function JDatePicker({ value, onChange, clearable, placeholder = "انتخاب تاریخ", small }: {
  value: string; onChange: (v: string) => void; clearable?: boolean; placeholder?: string; small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [staged, setStaged] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  const v = value || todayKey();
  const pv = parseKey(v);
  const [view, setView] = useState({ jy: pv.jy, jm: pv.jm });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => { if (open) { setStaged(value); const p = parseKey(value || todayKey()); setView({ jy: p.jy, jm: p.jm }); } }, [open]); // eslint-disable-line
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className={`inp text-right flex items-center justify-between gap-2 cursor-pointer ${small ? "!py-2 text-sm" : ""}`}>
        <span className={value ? "tabnums" : "text-mut"}>{value ? fa(value) : placeholder}</span>
        <Icon name="calendar" size={16} className="text-mut shrink-0" />
      </button>
      {open && (
        <div className="absolute z-[70] mt-2 right-0 card p-4 a-pop w-[322px]">
          <CalPanel view={view} setView={setView} selected={k => k === staged} onPick={setStaged} />
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
            <Btn size="sm" kind="outline" onClick={() => { setStaged(todayKey()); }}>امروز</Btn>
            {clearable && <Btn size="sm" kind="ghost" onClick={() => { onChange(""); setOpen(false); }}>پاک‌کردن</Btn>}
            <span className="flex-1" />
            <Btn size="sm" kind="primary" onClick={() => { onChange(staged); setOpen(false); }}>تایید</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

export function JRangePicker({ from, to, onChange }: { from: string; to: string; onChange: (f: string, t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [staged, setStaged] = useState({ from, to });
  const ref = useRef<HTMLDivElement>(null);
  const pv = parseKey(from || todayKey());
  const [view, setView] = useState({ jy: pv.jy, jm: pv.jm });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => { if (open) { setStaged({ from, to }); const p = parseKey(from || todayKey()); setView({ jy: p.jy, jm: p.jm }); } }, [open]); // eslint-disable-line
  const pick = (k: string) => {
    if (!staged.from || (staged.from && staged.to)) setStaged({ from: k, to: "" });
    else if (k < staged.from) setStaged({ from: k, to: staged.from });
    else setStaged({ from: staged.from, to: k });
  };
  const inRange = (k: string) => staged.from && staged.to ? k > staged.from && k < staged.to : false;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="inp text-right flex items-center justify-between gap-2 cursor-pointer !py-2 text-sm">
        <span className="tabnums truncate">{from && to ? `${fa(from)} ← ${fa(to)}` : "بازه زمانی"}</span>
        <Icon name="calendar" size={15} className="text-mut shrink-0" />
      </button>
      {open && (
        <div className="absolute z-[70] mt-2 right-0 card p-4 a-pop w-[322px]">
          <CalPanel view={view} setView={setView} selected={k => k === staged.from || k === staged.to} inRange={inRange} onPick={pick} />
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line text-sm">
            <span className="text-mut tabnums text-xs">{staged.from ? fa(staged.from) : "…"}</span>
            <span className="text-mut">←</span>
            <span className="text-mut tabnums text-xs">{staged.to ? fa(staged.to) : "…"}</span>
            <span className="flex-1" />
            <Btn size="sm" kind="ghost" onClick={() => { const t = todayKey(); setStaged({ from: t, to: t }); }}>امروز</Btn>
            <Btn size="sm" kind="primary" disabled={!staged.from || !staged.to} onClick={() => { onChange(staged.from, staged.to); setOpen(false); }}>تایید</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── SVG Charts (داده واقعی از Store) ── */
export function BarChart({ data, aLabel, bLabel, onBar }: {
  data: { label: string; a: number; b: number }[]; aLabel: string; bLabel: string;
  onBar?: (label: string) => void;
}) {
  const W = 460, H = 210, P = 30;
  const max = Math.max(1, ...data.map(d => Math.max(d.a, d.b)));
  const yMax = Math.ceil(max / 4) * 4 || 4;
  const bw = (W - P * 2) / Math.max(1, data.length);
  return (
    <div>
      {styleTag}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 1, 2, 3, 4].map(i => {
          const y = H - 30 - (i / 4) * (H - 55);
          return <g key={i}>
            <line x1={P} x2={W - 6} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" strokeDasharray={i === 0 ? "" : "3 4"} />
            <text x={P - 6} y={y + 4} fontSize="9" fill="var(--mut)" textAnchor="end" className="tabnums">{Math.round((yMax * i) / 4)}</text>
          </g>;
        })}
        {data.map((d, i) => {
          const x = P + i * bw;
          const ha = (d.a / yMax) * (H - 55), hb = (d.b / yMax) * (H - 55);
          return (
            <g key={d.label} className="cursor-pointer" onClick={() => onBar?.(d.label)}>
              <rect x={x + 2} y={18} width={bw - 4} height={H - 48} fill="transparent" />
              <rect className="grow-y" x={x + bw * 0.18} y={H - 30 - ha} width={bw * 0.26} height={Math.max(2, ha)} rx="3" fill="var(--ok)"><title>{d.label} — {aLabel}: {d.a}</title></rect>
              <rect className="grow-y" x={x + bw * 0.52} y={H - 30 - hb} width={bw * 0.26} height={Math.max(2, hb)} rx="3" fill="var(--nok)"><title>{d.label} — {bLabel}: {d.b}</title></rect>
              <text x={x + bw / 2} y={H - 12} fontSize="10" fill="var(--mut)" textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 justify-center mt-1 text-xs text-mut">
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-ok inline-block" />{aLabel}</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-nok inline-block" />{bLabel}</span>
      </div>
    </div>
  );
}

export function LineChart({ labels, series, height = 200 }: {
  labels: string[]; series: { name: string; color: string; points: (number | null)[] }[]; height?: number;
}) {
  const W = 460, H = height, P = 32;
  const max = Math.max(1, ...series.flatMap(s => s.points.filter((v): v is number => v !== null)));
  const yMax = Math.ceil(max / 4) * 4 || 4;
  const step = (W - P - 10) / Math.max(1, labels.length - 1);
  const yOf = (v: number) => H - 28 - (v / yMax) * (H - 52);
  return (
    <div>
      {styleTag}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 1, 2, 3, 4].map(i => {
          const y = H - 28 - (i / 4) * (H - 52);
          return <g key={i}>
            <line x1={P} x2={W - 6} y1={y} y2={y} stroke="var(--line)" strokeDasharray={i === 0 ? "" : "3 4"} />
            <text x={P - 6} y={y + 4} fontSize="9" fill="var(--mut)" textAnchor="end" className="tabnums">{Math.round((yMax * i) / 4)}</text>
          </g>;
        })}
        {series.map((s, si) => {
          const segments: string[][] = [];
          let current: string[] = [];
          s.points.forEach((v, i) => {
            if (v === null) { if (current.length) segments.push(current); current = []; }
            else current.push(`${P + i * step},${yOf(v)}`);
          });
          if (current.length) segments.push(current);
          const full = s.points.every(v => v !== null);
          return (
            <g key={s.name}>
              {si === 0 && full && segments.length === 1 && <polygon points={`${P},${H - 28} ${segments[0].join(" ")} ${P + (s.points.length - 1) * step},${H - 28}`} fill={s.color} opacity="0.08" />}
              {segments.map((pts, index) => <polyline key={index} className="draw-l" points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />)}
              {s.points.map((v, i) => v === null ? null : (
                <circle key={i} cx={P + i * step} cy={yOf(v)} r="3.4" fill="var(--panel)" stroke={s.color} strokeWidth="2">
                  <title>{labels[i]} — {s.name}: {v}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {labels.map((l, i) => (labels.length <= 10 || i % Math.ceil(labels.length / 10) === 0 || i === labels.length - 1) ? (
          <text key={i} x={P + i * step} y={H - 10} fontSize="9" fill="var(--mut)" textAnchor="middle" className="tabnums">{l}</text>
        ) : null)}
      </svg>
      <div className="flex items-center gap-4 justify-center mt-1 text-xs text-mut flex-wrap">
        {series.map(s => <span key={s.name} className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: s.color }} />{s.name}</span>)}
      </div>
    </div>
  );
}

export function Donut({ slices, centerLabel, onSlice }: {
  slices: { label: string; value: number; color: string }[]; centerLabel?: string; onSlice?: (label: string) => void;
}) {
  const total = Math.max(1, slices.reduce((a, s) => a + s.value, 0));
  const [act, setAct] = useState(-1);
  const R = 56, C = 2 * Math.PI * R;
  let acc = 0;
  const shown = slices.filter(s => s.value > 0);
  return (
    <div className="flex items-center gap-5 flex-wrap justify-center">
      <div className="relative shrink-0">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--panel2)" strokeWidth="20" />
          {shown.map((s, i) => {
            const frac = s.value / total;
            const off = acc; acc += frac;
            return (
              <circle key={s.label} cx="80" cy="80" r={R} fill="none"
                stroke={s.color} strokeWidth={act === i ? 25 : 20}
                strokeDasharray={`${Math.max(0.5, frac * C - 1.5)} ${C}`}
                strokeDashoffset={-off * C}
                transform="rotate(-90 80 80)" strokeLinecap="butt"
                className="transition-all cursor-pointer" style={{ transitionDuration: ".2s" }}
                onMouseEnter={() => setAct(i)} onMouseLeave={() => setAct(-1)}
                onClick={() => onSlice?.(s.label)}>
                <title>{s.label}: {s.value}</title>
              </circle>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-disp text-2xl tabnums">{act >= 0 ? shown[act].value : total}</span>
          <span className="text-[10px] text-mut">{act >= 0 ? shown[act].label : (centerLabel || "مجموع")}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 min-w-[150px]">
        {shown.slice(0, 7).map((s, i) => (
          <button key={s.label} onMouseEnter={() => setAct(i)} onMouseLeave={() => setAct(-1)} onClick={() => onSlice?.(s.label)}
            className={`flex items-center gap-2 text-xs rounded-md px-2 py-1 text-right transition-colors ${act === i ? "bg-panel2" : ""}`}>
            <i className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-mut flex-1 truncate">{s.label}</span>
            <b className="tabnums">{s.value}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── QR Pattern (برچسب اموال) ── */
// QR data is encoded as UTF-8; the four-module quiet zone is required for scanners.
qrcode.stringToBytes = text => Array.from(new TextEncoder().encode(text));
export function QRPattern({ seed, size = 92 }: { seed: string; size?: number }) {
  const qr = useMemo(() => {
    try { const result = qrcode(0, "M"); result.addData(seed, "Byte"); result.make(); return result; }
    catch { return null; }
  }, [seed]);
  if (!qr) return <div role="img" aria-label="کد برای تولید QR نامعتبر یا طولانی است" className="text-xs text-nok">کد QR قابل تولید نیست</div>;
  const n = qr.getModuleCount(), margin = 4, dimension = n + margin * 2;
  const cells: ReactNode[] = [];
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    if (qr.isDark(row, col)) cells.push(<rect key={`${row}-${col}`} x={col + margin} y={row + margin} width="1" height="1" fill="#111" />);
  }
  return <svg role="img" aria-label={`کد QR تجهیز ${seed}`} width={size} height={size} viewBox={`0 0 ${dimension} ${dimension}`} shapeRendering="crispEdges" className="bg-white rounded-md p-0">
    <rect width={dimension} height={dimension} fill="#fff" />{cells}
  </svg>;
}

export function KV({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-line last:border-0">
      <span className="text-xs text-mut shrink-0">{k}</span>
      <span className={`text-sm font-semibold text-left ${mono ? "tabnums" : ""}`}>{v}</span>
    </div>
  );
}

export function SectionTitle({ children, icon, end }: { children: ReactNode; icon?: string; end?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-disp text-xl flex items-center gap-2.5">
        {icon && <span className="w-8 h-8 rounded-lg bg-acc/12 text-acc border border-acc/25 flex items-center justify-center"><Icon name={icon} size={17} /></span>}
        {children}
      </h2>
      {end}
    </div>
  );
}

/* helper: days keys of a jalali month for charts */
export function monthDaysKeys(fromKey: string, toKey: string, cap = 31): string[] {
  const out: string[] = [];
  let k = fromKey;
  let guard = 0;
  while (k <= toKey && guard < cap) { out.push(k); k = addDays(k, 1); guard++; }
  return out;
}
export { fa };
