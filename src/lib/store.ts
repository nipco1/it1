/* ── NIPCO Persistence & Domain Services ───────────────────────────
   نگهداری مرکزی روی SQL Server از طریق API امن؛ بدون LocalStorage و صف آفلاین. */
import { useSyncExternalStore } from "react";
import type { DB, User, ID, DailyControl, Draft, ActivityLog, ReportFilters, Equipment, Checklist, ChecklistSection, ChecklistItem, OpHoursRecord } from "./types";
import { seedDB } from "./seed";
import { todayKey, nowHM, todayJ } from "./jalali";

type StartupStorageIssue = { message: string; recovery: string | null };
let startupIssue: StartupStorageIssue | null = null;
export const getStartupStorageIssue = (): StartupStorageIssue | null => startupIssue;

function createEmptyDatabase(): DB {
  const initial = seedDB();
  // The packaged production instance must never present fabricated sample assets,
  // technicians, check records or work-hour records as real company data.
  initial.groups = [];
  initial.equipments = [];
  initial.checklists = [];
  initial.sections = [];
  initial.items = [];
  initial.controls = [];
  initial.drafts = [];
  initial.opHours = [];
  initial.users = [];
  initial.logs = [];
  initial.sync = [];
  initial.layouts = {};
  initial.savedFilters = [];
  initial.archivedYears = [];
  initial.yearAccess = {};
  return initial;
}

let db: DB = createEmptyDatabase();
let stateRevision = 0;
let sessionUser: User | null = null;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }

async function apiJSON<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error: any = new Error(body?.error || `خطای ارتباط با سرور (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body as T;
}

function publishRemoteData(payload: any) {
  stateRevision = Number(payload.revision || 0);
  db = payload.state ? { ...payload.state, users: payload.users || [] } : { ...createEmptyDatabase(), users: payload.users || [] };
  serverStampedLogs.clear();
  for (const entry of db.logs || []) {
    if (entry?.id) serverStampedLogs.set(entry.id, entry);
  }
  sessionUser = (payload.users || []).find((u: User) => u.id === sessionUser?.id && u.active) || null;
  writesBlocked = false;
  emit();
}

async function loadRemoteState(initializeIfEmpty: boolean) {
  const payload = await apiJSON<{ revision: number; state: Omit<DB, "users"> | null; users: User[] }>("/api/state");
  if (payload.state) {
    publishRemoteData(payload);
    return;
  }
  if (!initializeIfEmpty || sessionUser?.role !== "admin") {
    publishRemoteData(payload);
    return;
  }
  const initial = createEmptyDatabase();
  initial.users = payload.users;
  const saved = await apiJSON<{ revision: number; users: User[] }>("/api/state", {
    method: "PUT", body: JSON.stringify({ revision: 0, state: initial }),
  });
  publishRemoteData({ state: Object.fromEntries(Object.entries(initial).filter(([k]) => k !== "users")), revision: saved.revision, users: saved.users });
}

export async function restoreSession(): Promise<User | null> {
  try {
    const result = await apiJSON<{ user: User }>("/api/auth/me");
    sessionUser = result.user;
    await loadRemoteState(sessionUser.role === "admin");
    return sessionUser;
  } catch (error: any) {
    sessionUser = null;
    if (error?.status !== 401) toast(error?.message || "ارتباط با سرور برقرار نشد", "err");
    emit();
    return null;
  }
}

let saveChain: Promise<void> = Promise.resolve();
let pendingWrites = 0;
let writeGeneration = 0;
let refreshingRemote = false;
let writesBlocked = false;
const serverStampedLogs = new Map<string, ActivityLog>();

function applyStampedLogs(logs: ActivityLog[] | undefined) {
  if (!Array.isArray(logs) || !logs.length) return;
  for (const entry of logs) {
    if (entry?.id) serverStampedLogs.set(entry.id, entry);
  }
  if (db.logs?.length) {
    db = {
      ...db,
      logs: db.logs.map(entry => serverStampedLogs.get(entry.id) || entry),
    };
  }
}

function persistRemote(next: DB): Promise<boolean> {
  const snapshot = JSON.parse(JSON.stringify(next)) as DB;
  pendingWrites++;
  const generation = writeGeneration;
  let succeeded = false;
  const current = saveChain.then(async () => {
    // Drop queued snapshots created before a conflict/network failure. They may
    // otherwise overwrite a newer state after the catch handler reloads SQL.
    if (writesBlocked || generation !== writeGeneration) return;
    if (Array.isArray(snapshot.logs) && serverStampedLogs.size > 0) {
      snapshot.logs = snapshot.logs.map(entry => serverStampedLogs.get(entry.id) || entry);
    }
    const result = await apiJSON<{ revision: number; users: User[]; stampedLogs?: ActivityLog[] }>("/api/state", {
      method: "PUT", body: JSON.stringify({ revision: stateRevision, state: snapshot }),
    });
    stateRevision = result.revision;
    db = {
      ...db,
      users: (result.users || db.users).map(u => ({ ...u, pass: undefined })),
    };
    applyStampedLogs(result.stampedLogs);
    sessionUser = db.users.find(u => u.id === sessionUser?.id && u.active) || sessionUser;
    succeeded = true;
    emit();
  }).catch(async (error: any) => {
    if (generation !== writeGeneration) return;
    writesBlocked = true;
    writeGeneration++; // invalidate all older queued snapshots before reloading SQL
    toast(error?.message || "ذخیره انجام نشد؛ تغییرات صف‌شده متوقف و اطلاعات مرکزی دوباره دریافت می‌شود", "err");
    try {
      const latest = await apiJSON<any>("/api/state");
      publishRemoteData(latest);
      toast("اطلاعات مرکزی بارگیری شد؛ تغییر ثبت‌نشده را پس از بررسی دوباره وارد کنید", "err");
    } catch {
      // Keep writes blocked until refreshRemoteState succeeds once connectivity returns.
    }
  }).finally(() => { pendingWrites = Math.max(0, pendingWrites - 1); });
  saveChain = current;
  return current.then(() => succeeded);
}

// Lightweight revision polling keeps already-open clients current without downloading
// the full application document every interval. A pending local write always wins.
export async function refreshRemoteState(): Promise<void> {
  const observedUserId = sessionUser?.id;
  const observedRevision = stateRevision;
  if (!observedUserId || refreshingRemote || pendingWrites > 0) return;
  refreshingRemote = true;
  try {
    if (writesBlocked) {
      const latest = await apiJSON<any>("/api/state");
      if (sessionUser?.id === observedUserId && pendingWrites === 0) {
        publishRemoteData(latest);
        toast("اتصال به سرور برقرار و اطلاعات مرکزی بازیابی شد", "ok");
      }
      return;
    }
    const meta = await apiJSON<{ revision: number }>("/api/state/revision");
    if (sessionUser?.id !== observedUserId || writesBlocked || pendingWrites > 0 || stateRevision !== observedRevision) return;
    if (meta.revision === observedRevision) return;
    const latest = await apiJSON<any>("/api/state");
    if (sessionUser?.id === observedUserId && !writesBlocked && pendingWrites === 0 && stateRevision === observedRevision && latest.revision >= observedRevision) {
      publishRemoteData(latest);
    }
  } catch (error: any) {
    if (error?.status === 401 && sessionUser?.id === observedUserId) {
      sessionUser = null;
      writesBlocked = false;
      serverStampedLogs.clear();
      db = createEmptyDatabase();
      stateRevision = 0;
      toast("نشست شما منقضی شده است؛ دوباره وارد سامانه شوید", "err");
      emit();
    }
  } finally {
    refreshingRemote = false;
  }
}

export function mutate(fn: (d: DB) => void, log?: { action: ActivityLog["action"]; entity: string; detail: string }): Promise<boolean> {
  if (startupIssue) throw new Error("ذخیره‌سازی تا رفع خطای داده غیرفعال است");
  if (!sessionUser) throw new Error("برای ثبت تغییرات ابتدا وارد سامانه شوید");
  if (writesBlocked) throw new Error("به دلیل تعارض یا قطع ارتباط، ثبت تغییرات موقتاً متوقف شده است؛ صفحه را تازه‌سازی کنید");
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("برای ذخیره اطلاعات، اتصال شبکه به سرور لازم است");
  const next = JSON.parse(JSON.stringify(db)) as DB;
  fn(next);
  if (log) {
    const u = getSessionUser();
    next.logs.push({
      id: "log-" + uid(), userId: u?.id || "system", userName: u?.name || "سیستم",
      action: log.action, entity: log.entity, detail: log.detail,
      dateKey: todayKey(), time: nowHM(), ip: "ثبت‌شده در سرور",
    });
  }
  db = next;
  emit();
  return persistRemote(next);
}

export const getDB = () => db;
export const subDB = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useDB = () => useSyncExternalStore(subDB, getDB);

export const uuid = (): string => {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  // RFC 4122 v4 fallback for browsers without randomUUID (secure-context deployments).
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const uid = () => "id-" + uuid();

/* ── Server-backed session: HttpOnly + Secure cookie, no browser password/session storage ── */
export function getSessionUser(): User | null { return sessionUser; }
export async function login(username: string, pass: string): Promise<User> {
  const result = await apiJSON<{ user: User }>("/api/auth/login", {
    method: "POST", body: JSON.stringify({ username: username.trim(), password: pass }),
  });
  sessionUser = result.user;
  await loadRemoteState(sessionUser.role === "admin");
  return sessionUser || result.user;
}
export function logout() {
  void apiJSON("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  sessionUser = null;
  writesBlocked = false;
  serverStampedLogs.clear();
  db = createEmptyDatabase();
  stateRevision = 0;
  emit();
}

export async function createServerBackup(): Promise<{ fileName: string; size: number; createdAt: string; verified: boolean }> {
  const result = await apiJSON<{ backup: { fileName: string; size: number; createdAt: string; verified: boolean } }>("/api/backups", { method: "POST", body: JSON.stringify({}) });
  return result.backup;
}
export async function listServerBackups(): Promise<any[]> {
  const result = await apiJSON<{ backups: any[] }>("/api/backups");
  return result.backups;
}
export async function importLegacyDatabase(legacy: unknown): Promise<{ groups: number; equipments: number; controls: number; opHours: number; importedLegacyAccountsDisabled: number }> {
  const result = await apiJSON<{ imported: { groups: number; equipments: number; controls: number; opHours: number; importedLegacyAccountsDisabled: number } }>("/api/admin/import-legacy", {
    method: "POST", body: JSON.stringify({ legacy }),
  });
  await loadRemoteState(false);
  return result.imported;
}

/* ── Permissions (بند ۱۹) ── */
export const can = (key: string): boolean => {
  const u = getSessionUser();
  if (!u) return false;
  return db.perms[u.role]?.[key] ?? false;
};
export const userGroupVisible = (u: User, groupId: ID): boolean =>
  u.groupIds === "all" || (u.groupIds as string[]).includes(groupId);

/* ── Lookups ── */
export const groupById = (d: DB, id: ID) => d.groups.find(g => g.id === id);
export const eqById = (d: DB, id: ID) => d.equipments.find(e => e.id === id);
export const userById = (d: DB, id: ID) => d.users.find(u => u.id === id);
export const shiftById = (d: DB, id: ID) => d.shifts.find(s => s.id === id);

/** چک‌لیست مؤثر تجهیز: اختصاصی تجهیز > چک‌لیست گروه (ارث‌بری) */
export function checklistFor(d: DB, eq: Equipment): { checklist: Checklist; sections: ChecklistSection[]; items: ChecklistItem[] } {
  const checklist =
    d.checklists.find(c => c.equipmentId === eq.id) ||
    d.checklists.find(c => c.groupId === eq.groupId) ||
    d.checklists[0];
  const sections = d.sections.filter(s => s.checklistId === checklist?.id).sort((a, b) => a.order - b.order);
  const secIds = new Set(sections.map(s => s.id));
  const items = d.items.filter(i => secIds.has(i.sectionId));
  return { checklist, sections, items };
}

export function lastOpHours(d: DB, eqId: ID): OpHoursRecord | null {
  const recs = d.opHours.filter(o => o.equipmentId === eqId)
    .sort((a, b) => (b.dateKey + b.time).localeCompare(a.dateKey + a.time));
  return recs[0] || null;
}

/* ── Controls & Drafts ── */
export function saveDraft(draft: Draft): boolean {
  try {
    mutate(d => {
      const i = d.drafts.findIndex(x => x.id === draft.id);
      if (i >= 0) d.drafts[i] = draft; else d.drafts.unshift(draft);
    });
    return true;
  } catch { return false; }
}
export function deleteDraft(id: ID) {
  mutate(d => { d.drafts = d.drafts.filter(x => x.id !== id); },
    { action: "DELETE", entity: "Drafts", detail: "حذف پیش‌نویس توسط کاربر" });
}

export async function submitControl(control: DailyControl, opRec?: Omit<OpHoursRecord, "id">): Promise<"ok" | "duplicate" | "storage-error"> {
  // بررسی تکرار در سرور نیز با revision قفل‌شده در SQL انجام می‌شود؛ این بررسی صرفاً برای بازخورد سریع رابط است.
  if (db.controls.some(c => c.equipmentId === control.equipmentId && c.dateKey === control.dateKey && c.status !== "cancelled" && c.id !== control.id)) return "duplicate";
  try {
    const saved = await mutate(d => {
      const i = d.controls.findIndex(c => c.id === control.id);
      if (i >= 0) d.controls[i] = control; else d.controls.unshift(control);
      d.drafts = d.drafts.filter(x => !(x.equipmentId === control.equipmentId && x.dateKey === control.dateKey && x.techId === control.techId));
      if (opRec) d.opHours.unshift({ ...opRec, id: uid() });
    }, { action: "INSERT", entity: "DailyControls", detail: `ثبت نهایی فرم ${control.status === "nok" ? "با انحراف (NOK)" : "سالم"}` });
    return saved ? "ok" : "storage-error";
  } catch { return "storage-error"; }
}

export function cancelControl(id: ID, reason: string) {
  mutate(d => {
    const c = d.controls.find(x => x.id === id);
    if (c) { c.status = "cancelled"; c.cancelReason = reason; }
  }, { action: "CANCEL", entity: "DailyControls", detail: `ابطال فرم با دلیل: ${reason}` });
}

/* ── Backup / Restore (بند ۲۲) ── */
// Unsafe browser backup/restore is disabled until secure server backup exists.
export function resetAll() {
  throw new Error("بازنشانی پایگاه داده فقط از طریق فرایند بازیابی سرور و با تأیید مدیر مجاز است");
}

/* ── Saved Filters (بند ۱۵) ── */
export function saveFilter(userId: ID, tab: string, name: string, filters: ReportFilters) {
  mutate(d => { d.savedFilters.unshift({ id: uid(), userId, tab, name, filters }); });
}
export function deleteFilter(id: ID) {
  mutate(d => { d.savedFilters = d.savedFilters.filter(f => f.id !== id); });
}

/* ── Toast & Print buses ── */
type ToastMsg = { id: string; text: string; kind: "ok" | "err" | "info" };
export const toastBus = {
  handlers: new Set<(t: ToastMsg) => void>(),
  on(fn: (t: ToastMsg) => void) { this.handlers.add(fn); return () => { this.handlers.delete(fn); }; },
  send(text: string, kind: ToastMsg["kind"] = "ok") {
    const t = { id: uid(), text, kind };
    this.handlers.forEach(h => h(t));
  },
};
export const toast = toastBus.send.bind(toastBus);

export interface PrintPayload {
  kind: "control" | "table";
  controlId?: ID;
  title?: string;
  headers?: string[];
  rows?: string[][];
}
export const printBus = {
  handlers: new Set<(p: PrintPayload) => void>(),
  on(fn: (p: PrintPayload) => void) { this.handlers.add(fn); return () => { this.handlers.delete(fn); }; },
  send(p: PrintPayload) { this.handlers.forEach(h => h(p)); },
};

/* ── Reports shared filter helper ── */
export const defaultFilters = (): ReportFilters => {
  const t = todayJ();
  const from = `${t.jy}/${String(t.jm).padStart(2, "0")}/01`;
  return { from, to: todayKey(), shift: "", tech: "", group: "", equipment: "", status: "", source: "" };
};

export const STATUS_TONE: Record<string, "ok" | "nok" | "warn" | "mut" | "info"> = {
  completed: "ok", nok: "nok", inprogress: "warn", cancelled: "mut", draft: "info",
};
