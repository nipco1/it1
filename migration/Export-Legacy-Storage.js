/*
 * NIPCO one-time legacy browser export.
 * Run this complete snippet in DevTools Console on the OLD NIPCO app page,
 * where localStorage key "nipco-daily-control-db" exists.
 * No passwords, sessions or queued sync jobs are included in the export.
 */
(() => {
  const KEY = "nipco-daily-control-db";
  const raw = localStorage.getItem(KEY);
  if (!raw) throw new Error(`کلید ${KEY} در این مبدأ مرورگر پیدا نشد.`);
  let database;
  try { database = JSON.parse(raw); } catch { throw new Error("اطلاعات ذخیره‌شده JSON معتبر نیست؛ فایل صادر نشد."); }
  if (!database || typeof database !== "object" || !Array.isArray(database.equipments) || !Array.isArray(database.controls)) {
    throw new Error("ساختار داده با نسخه قدیمی NIPCO مطابقت ندارد؛ فایل صادر نشد.");
  }
  const output = structuredClone(database);
  for (const account of output.users || []) {
    if (account && typeof account === "object") {
      delete account.pass;
      delete account.password;
      delete account.passwordHash;
    }
  }
  output.sync = [];
  delete output.plc;
  for (const row of output.opHours || []) if (row?.source === "AUTO") row.source = "LEGACY_AUTO_REMOVED";
  output.opHours = (output.opHours || []).filter(row => row?.source !== "LEGACY_AUTO_REMOVED");
  for (const control of output.controls || []) {
    if (control?.opSource === "AUTO") { delete control.opSource; delete control.opHours; }
  }
  for (const filter of output.savedFilters || []) if (filter?.filters?.source === "AUTO") filter.filters.source = "";

  const counts = {
    groups: (output.groups || []).length,
    equipments: (output.equipments || []).length,
    checklists: (output.checklists || []).length,
    controls: (output.controls || []).length,
    operatingHours: (output.opHours || []).length,
    drafts: (output.drafts || []).length,
    users: (output.users || []).length,
  };
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `NIPCO-Legacy-Export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  console.table(counts);
  console.info("خروجی ایجاد شد. فایل را فقط به مدیر مجاز منتقل کنید؛ در آن گذرواژه و نشست کاربری وجود ندارد.");
  return counts;
})();
