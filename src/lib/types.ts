/* ── NIPCO Data Model (معماری پایگاه‌داده — بند ۲۴ سند) ─────────── */

export type ID = string;
export type RoleId = "admin" | "supervisor" | "engineer" | "technician" | "viewer";

export interface EquipmentGroup {
  id: ID; code: string; name: string; icon: string;
  description: string; displayOrder: number; isActive: boolean;
  /** کلید زیرساختی ساعت کارکرد — در این نسخه فقط لیفتراک و کمپرسور */
  trackHours: boolean;
}

export interface Equipment {
  id: ID; code: string; name: string; groupId: ID;
  brand: string; model: string; serial: string; capacity: string;
  hall: string; line: string; area: string;
  status: "active" | "repair" | "retired";
  commissionDate: string; // کلید شمسی
}

export interface Checklist { id: ID; name: string; groupId?: ID; equipmentId?: ID; }
export interface ChecklistSection { id: ID; checklistId: ID; title: string; order: number; }
export interface ChecklistItem {
  id: ID; sectionId: ID; title: string;
  type: "oknok" | "numeric";
  unit?: string; min?: number; max?: number; precision?: number;
}

export interface FailureLocation { id: ID; name: string; }
export interface Shift { id: ID; name: string; from: string; to: string; }

export interface ControlItemValue {
  itemId: ID;
  result: "ok" | "nok" | null;
  value?: number | null;
  failLocId?: ID | null;
  desc?: string;
}

export type ControlStatus = "inprogress" | "completed" | "nok" | "cancelled";

export interface DailyControl {
  id: ID; equipmentId: ID; dateKey: string; shiftId: ID; techId: ID;
  status: ControlStatus;
  items: Record<ID, ControlItemValue>;
  opHours?: number | null; opSource?: "MANUAL" | "ADJUSTED";
  createdAt: string; submittedAt?: string; startedAt: string;
  cancelReason?: string;
}

export interface Draft {
  id: ID; equipmentId: ID; dateKey: string; shiftId: ID; techId: ID;
  items: Record<ID, ControlItemValue>;
  opHours?: number | null;
  updatedAt: string; startedAt: string;
}

export interface OpHoursRecord {
  id: ID; equipmentId: ID; hours: number; diff: number | null;
  source: "MANUAL" | "ADJUSTED";
  techId: ID; dateKey: string; time: string; note?: string;
}

export interface User {
  id: ID; username: string; pass?: string; name: string; role: RoleId;
  groupIds: ID[] | "all";
  active: boolean;
}

export interface ActivityLog {
  id: ID; userId: ID; userName: string;
  action: "INSERT" | "UPDATE" | "DELETE" | "LOGIN" | "EXPORT" | "SYNC" | "CANCEL" | "BACKUP";
  entity: string; detail: string;
  dateKey: string; time: string; ip: string;
}

export interface SyncItem {
  id: ID; label: string; status: "pending" | "syncing" | "synced" | "failed";
  createdAt: string; retry: number; lastError?: string;
}

export interface Branding {
  logoText: string; title: string; subtitle: string; welcome: string;
  footer: string; version: string; primary: string; radius: number;
}

export interface WidgetDef { key: string; span: number; }
export type DashLayout = WidgetDef[];

export interface ReportFilters {
  from: string; to: string;
  shift: ID | ""; tech: ID | ""; group: ID | ""; equipment: ID | "";
  status: string | ""; source: string | "";
}

export interface SavedFilter { id: ID; userId: ID; tab: string; name: string; filters: ReportFilters; }

export interface DB {
  v: number;
  groups: EquipmentGroup[];
  equipments: Equipment[];
  checklists: Checklist[];
  sections: ChecklistSection[];
  items: ChecklistItem[];
  controls: DailyControl[];
  drafts: Draft[];
  opHours: OpHoursRecord[];
  failLocs: FailureLocation[];
  shifts: Shift[];
  users: User[];
  logs: ActivityLog[];
  sync: SyncItem[];
  branding: Branding;
  layouts: Record<ID, DashLayout>;
  savedFilters: SavedFilter[];
  perms: Record<RoleId, Record<string, boolean>>;
  yearAccess: Record<string, "full" | "readonly" | "none">;
  archivedYears: string[];
  theme: string;
}

export const ROLE_NAMES: Record<RoleId, string> = {
  admin: "مدیر ارشد سیستم",
  supervisor: "سرپرست نگهداری و تعمیرات",
  engineer: "کارشناس / مهندس نت",
  technician: "تکنسین بازرسی و کنترل",
  viewer: "مشاهده‌کننده / ممیز",
};

export const STATUS_FA: Record<ControlStatus | "draft", string> = {
  draft: "پیش‌نویس",
  inprogress: "در حال تکمیل",
  completed: "تکمیل‌شده (سالم)",
  nok: "دارای انحراف (NOK)",
  cancelled: "ابطال‌شده",
};
