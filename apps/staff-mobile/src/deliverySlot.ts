// Keep in step with auroraSlotStart_ in the Apps Script checkout validator.
export function deliveryToday(now = new Date()): string {
  return new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function deliverySlotOpen(label: string, date: string, now = new Date()): boolean {
  const dhaka = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const today = dhaka.toISOString().slice(0, 10);
  if (!date || date < today) return false;
  if (date > today) return true;
  const time = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:[-–—]|to\b)/i.exec(label);
  if (!time) return false;
  let hour = Number(time[1]);
  const minute = Number(time[2] || 0);
  if (minute > 59 || (time[3] ? hour < 1 || hour > 12 : hour > 23)) return false;
  if (time[3]) hour = hour % 12 + (time[3].toLowerCase() === 'pm' ? 12 : 0);
  return hour * 60 + minute > dhaka.getUTCHours() * 60 + dhaka.getUTCMinutes();
}
