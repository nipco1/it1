// Validate a submitted daily-inspection document against a server-owned effective checklist.
import { isValidJalaliDate } from './jalali-date.js';

export function validateControl(body, checklist, allowedShiftIds = ['s1', 's2', 's3']) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { equipmentId, dateKey, shiftId, items, opHours, startedAt } = body;
  if (typeof equipmentId !== 'string' || equipmentId.length < 1 || equipmentId.length > 100) return null;
  if (!isValidJalaliDate(dateKey)) return null;
  if (typeof shiftId !== 'string' || !allowedShiftIds.includes(shiftId)) return null;
  if (typeof startedAt !== 'string' || startedAt.length < 1 || startedAt.length > 60) return null;
  if (opHours !== undefined && opHours !== null && (typeof opHours !== 'number' || !Number.isFinite(opHours) || opHours < 0)) return null;
  if (!items || typeof items !== 'object' || Array.isArray(items) || !Array.isArray(checklist) || checklist.length === 0 || checklist.length > 1000) return null;
  if (Object.keys(items).length !== checklist.length) return null;

  let hasNok = false;
  const cleanItems = Object.create(null);
  for (const item of checklist) {
    if (!item || typeof item.id !== 'string' || !Object.hasOwn(items, item.id)) return null;
    const input = items[item.id];
    if (!input || typeof input !== 'object' || Array.isArray(input) || input.itemId !== item.id) return null;
    let result;
    const output = { itemId: item.id };
    if (item.kind === 'oknok') {
      if (input.result !== 'ok' && input.result !== 'nok') return null;
      result = input.result;
    } else if (item.kind === 'numeric') {
      if (typeof input.value !== 'number' || !Number.isFinite(input.value)) return null;
      const precision = Number.isInteger(item.precision) && item.precision >= 0 && item.precision <= 6 ? item.precision : 6;
      const scale = 10 ** precision;
      if (Math.abs(input.value * scale - Math.round(input.value * scale)) > 1e-7) return null;
      result = (item.min != null && input.value < item.min) || (item.max != null && input.value > item.max) ? 'nok' : 'ok';
      output.value = input.value;
      if (input.result !== result) return null;
    } else return null;
    output.result = result;
    if (input.failLocId != null && (typeof input.failLocId !== 'string' || input.failLocId.length > 100)) return null;
    if (input.desc != null && (typeof input.desc !== 'string' || input.desc.length > 4000)) return null;
    if (result === 'nok') {
      if (typeof input.failLocId !== 'string' || !input.failLocId.trim() || typeof input.desc !== 'string' || !input.desc.trim()) return null;
      hasNok = true;
    }
    if (input.failLocId != null) output.failLocId = input.failLocId;
    if (input.desc != null) output.desc = input.desc;
    cleanItems[item.id] = output;
  }
  return { equipmentId, dateKey, shiftId, startedAt, opHours: opHours ?? null, items: cleanItems, status: hasNok ? 'nok' : 'completed' };
}
