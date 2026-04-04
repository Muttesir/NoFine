export function isCCZChargeActive(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0=Sunday, 6=Saturday
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 60 + minute;
  const start7am = 7 * 60;
  const end6pm = 18 * 60;
  const start12pm = 12 * 60;

  if (day === 0) return false; // Sunday — free (check latest TfL rules)
  if (day === 6) return time >= start12pm && time < end6pm; // Saturday 12-18
  return time >= start7am && time < end6pm; // Mon-Fri 07-18
}

export function isULEZChargeActive(): boolean {
  return true; // 24/7
}

export function shouldCharge(zoneId: string): boolean {
  if (zoneId === 'ccz') return isCCZChargeActive();
  return true; // Tüm diğer zone'lar 24/7
}
