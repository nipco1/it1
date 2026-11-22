/* ── NIPCO Production Defaults ─────────────────────────────────────
   هیچ تجهیز، کاربر، چک‌لیست یا سابقه ساختگی در نصب تولیدی ایجاد نمی‌شود.
   داده‌های واقعی باید توسط مدیر مجاز در سامانه ثبت یا از فایل معتبر وارد شوند. */
import type { DB, RoleId } from "./types";
import { todayJ, jKey } from "./jalali";

export const SEED_V = 8;

function defaultPerms(): DB["perms"] {
  const actions = ["view", "create", "edit", "delete", "submit", "export", "print", "approve"];
  const modules = ["dashboard", "control", "reports", "equipment", "settings"];
  const make = (enabled: string[]) => Object.fromEntries(
    modules.flatMap(module => actions.map(action => {
      const key = `${module}:${action}`;
      return [key, enabled.includes("*") || enabled.includes(key)];
    }))
  );
  const all = make(["*"]);
  return {
    admin: all,
    supervisor: make(["dashboard:view", "control:view", "control:create", "control:edit", "control:submit", "control:approve", "control:print", "reports:view", "reports:export", "reports:print", "equipment:view", "equipment:edit", "settings:view"]),
    engineer: make(["dashboard:view", "control:view", "control:create", "control:submit", "control:print", "reports:view", "reports:export", "reports:print", "equipment:view", "equipment:edit", "settings:view"]),
    technician: make(["dashboard:view", "control:view", "control:create", "control:submit", "control:print", "reports:view", "equipment:view"]),
    viewer: make(["dashboard:view", "control:view", "reports:view", "reports:print", "equipment:view"]),
  } as DB["perms"];
}

export function seedDB(): DB {
  const year = String(todayJ().jy);
  return {
    v: SEED_V,
    groups: [],
    equipments: [],
    checklists: [],
    sections: [],
    items: [],
    controls: [],
    drafts: [],
    opHours: [],
    // موارد پایه قابل ویرایش؛ این‌ها داده عملیاتی یا سابقه ساختگی نیستند.
    failLocs: [
      { id: "fl-mechanical", name: "مکانیکی" },
      { id: "fl-electrical", name: "برقی" },
      { id: "fl-hydraulic", name: "هیدرولیک" },
      { id: "fl-pneumatic", name: "پنوماتیک" },
      { id: "fl-safety", name: "ایمنی" },
      { id: "fl-other", name: "سایر" },
    ],
    shifts: [
      { id: "shift-1", name: "شیفت ۱", from: "06:00", to: "14:00" },
      { id: "shift-2", name: "شیفت ۲", from: "14:00", to: "22:00" },
      { id: "shift-3", name: "شیفت ۳", from: "22:00", to: "06:00" },
    ],
    users: [],
    logs: [],
    sync: [],
    branding: {
      logoText: "NIPCO",
      title: "سامانه کنترل روزانه تجهیزات",
      subtitle: "NIPCO Daily Equipment Control System",
      welcome: "برای ورود، نام کاربری و رمز عبور سازمانی خود را وارد کنید",
      footer: "سامانه کنترل روزانه تجهیزات NIPCO",
      version: "2.4.1",
      primary: "#f5a623",
      radius: 10,
    },
    layouts: {},
    savedFilters: [],
    perms: defaultPerms(),
    yearAccess: { [year]: "full" },
    archivedYears: [],
    theme: "industrial",
  };
}

export { jKey as _jKey };
export type InitialRole = RoleId;
