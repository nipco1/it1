/* ── NIPCO Centralized Jalali (Shamsi) Calendar Engine ─────────────
   تمام تبدیل‌های تاریخ سیستم به‌صورت متمرکز در این ماژول انجام می‌شود.
   فرمت استاندارد کلید تاریخ: YYYY/MM/DD (قابل مرتب‌سازی واژه‌نامه‌ای) */

export const J_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
export const J_WEEK_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
export const J_WEEK_FULL = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;

function jalCal(jy: number) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;
  let i: number;
  for (i = 1; i < bl; i += 1) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  const n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  let k = n;
  if (jump - n < 6) k = k - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(k + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}
function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}
function d2j(jdn: number) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export interface JDate { jy: number; jm: number; jd: number }

export const toJalaali = (gy: number, gm: number, gd: number): JDate => d2j(g2d(gy, gm, gd));
export const toGregorian = (jy: number, jm: number, jd: number) => d2g(j2d(jy, jm, jd));

export const isLeapJalaali = (jy: number) => jalCal(jy).leap === 0;
export const monthLen = (jy: number, jm: number) =>
  jm <= 6 ? 31 : jm <= 11 ? 30 : isLeapJalaali(jy) ? 30 : 29;

const p2 = (n: number) => String(n).padStart(2, "0");
export const jKey = (jy: number, jm: number, jd: number) => `${jy}/${p2(jm)}/${p2(jd)}`;
export const parseKey = (k: string): JDate => {
  const [jy, jm, jd] = k.split("/").map(Number);
  return { jy, jm, jd };
};

export const todayJ = (): JDate => {
  const n = new Date();
  return toJalaali(n.getFullYear(), n.getMonth() + 1, n.getDate());
};
export const todayKey = () => { const t = todayJ(); return jKey(t.jy, t.jm, t.jd); };

export const keyToDate = (k: string): Date => {
  const { jy, jm, jd } = parseKey(k);
  const g = toGregorian(jy, jm, jd);
  return new Date(g.gy, g.gm - 1, g.gd);
};

/** شماره روز هفته با شروع از شنبه (0..6) */
export const weekIndex = (k: string): number => {
  const g = keyToDate(k).getDay(); // Sun=0..Sat=6
  return (g + 1) % 7; // Sat=0
};
export const weekdayFull = (k: string) => J_WEEK_FULL[weekIndex(k)];
export const dateTitle = (k: string) => {
  const { jy, jm, jd } = parseKey(k);
  return `${weekdayFull(k)}، ${jd} ${J_MONTHS[jm - 1]} ${jy}`;
};

export const addDays = (k: string, n: number): string => {
  const { jy, jm, jd } = parseKey(k);
  return (() => { const r = d2j(j2d(jy, jm, jd) + n); return jKey(r.jy, r.jm, r.jd); })();
};

export const nowHM = () => {
  const n = new Date();
  return `${p2(n.getHours())}:${p2(n.getMinutes())}`;
};
export const nowHMS = () => {
  const n = new Date();
  return `${p2(n.getHours())}:${p2(n.getMinutes())}:${p2(n.getSeconds())}`;
};

/** شیفت فعال بر اساس ساعت و لیست شیفت‌های سامانه (با پشتیبانی از شیفت شب عبورکننده از نیمه‌شب) */
export const shiftOfTime = (hm: string, shifts?: { id: string; from: string; to: string }[]): string => {
  const h = Number(hm.split(":")[0]);
  if (shifts && shifts.length) {
    for (const s of shifts) {
      const from = Number((s.from || "").split(":")[0]);
      const to = Number((s.to || "").split(":")[0]);
      if (!Number.isNaN(from) && !Number.isNaN(to)) {
        if (from < to ? (h >= from && h < to) : (h >= from || h < to)) return s.id;
      }
    }
    return shifts[0].id;
  }
  if (h >= 6 && h < 14) return "shift-1";
  if (h >= 14 && h < 22) return "shift-2";
  return "shift-3";
};

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export const fa = (v: number | string): string =>
  String(v).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);

export const fmtNum = (n: number, maxFrac = 1): string => {
  if (!isFinite(n)) return "—";
  return Number(n.toFixed(maxFrac)).toLocaleString("en-US", { maximumFractionDigits: maxFrac });
};
