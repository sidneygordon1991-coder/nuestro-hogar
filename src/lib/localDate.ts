/** Local calendar date as 'YYYY-MM-DD' (never UTC: after 18:00 in Guatemala toISOString() already says tomorrow). */
export function localISODate(d: Date = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
/** Local date n days from d (calendar days, not 24 h steps). */
export function localISODateIn(days: number, d: Date = new Date()) {
  return localISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 12));
}
