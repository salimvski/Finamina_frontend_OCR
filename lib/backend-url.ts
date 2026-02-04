/**
 * Backend base URL for client-side fetch calls.
 * Uses HTTPS when the app is served over HTTPS to avoid mixed-content blocking (e.g. on Vercel).
 */
export function getBackendBaseUrl(): string {
  const raw =
    (process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_N8N_URL || '').trim().replace(/\/$/, '');
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const protocol =
    typeof window !== 'undefined' && window.location?.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${raw}`;
}
