/**
 * MENA (Middle East and North Africa) countries for Wafeq API contacts.
 * Wafeq expects country as a valid choice (ISO code). Supported regions include
 * Saudi Arabia, UAE, Egypt, and broader MENA; exact list is not fully documented.
 * Country is sent only when provided (optional in our API).
 */

/** MENA countries for dropdown: display name and value we send to API (name maps to code). */
export const MENA_COUNTRIES = [
  { name: 'Saudi Arabia', value: 'Saudi Arabia' },
  { name: 'United Arab Emirates', value: 'United Arab Emirates' },
  { name: 'Qatar', value: 'Qatar' },
  { name: 'Kuwait', value: 'Kuwait' },
  { name: 'Bahrain', value: 'Bahrain' },
  { name: 'Oman', value: 'Oman' },
  { name: 'Jordan', value: 'Jordan' },
  { name: 'Lebanon', value: 'Lebanon' },
  { name: 'Egypt', value: 'Egypt' },
  { name: 'Morocco', value: 'Morocco' },
  { name: 'Algeria', value: 'Algeria' },
  { name: 'Tunisia', value: 'Tunisia' },
  { name: 'Libya', value: 'Libya' },
  { name: 'Iraq', value: 'Iraq' },
  { name: 'Iran', value: 'Iran' },
  { name: 'Yemen', value: 'Yemen' },
  { name: 'Syria', value: 'Syria' },
  { name: 'Palestine', value: 'Palestine' },
  { name: 'Israel', value: 'Israel' },
  { name: 'Sudan', value: 'Sudan' },
  { name: 'Turkey', value: 'Turkey' },
] as const;

/** Map country names (and variants) to ISO 3166-1 alpha-2 for Wafeq. */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'Saudi Arabia': 'SA',
  'Saudi': 'SA',
  'United Arab Emirates': 'AE',
  'UAE': 'AE',
  'Emirates': 'AE',
  'Qatar': 'QA',
  'Kuwait': 'KW',
  'Bahrain': 'BH',
  'Oman': 'OM',
  'Jordan': 'JO',
  'Lebanon': 'LB',
  'Liban': 'LB',
  'Egypt': 'EG',
  'Morocco': 'MA',
  'Maroc': 'MA',
  'Algeria': 'DZ',
  'Algérie': 'DZ',
  'Tunisia': 'TN',
  'Tunisie': 'TN',
  'Libya': 'LY',
  'Iraq': 'IQ',
  'Iran': 'IR',
  'Yemen': 'YE',
  'Syria': 'SY',
  'Palestine': 'PS',
  'Israel': 'IL',
  'Sudan': 'SD',
  'Turkey': 'TR',
  'Türkiye': 'TR',
};

/**
 * Returns ISO 2-letter country code for Wafeq, or null if not provided.
 * Accepts country name (e.g. "Maroc", "Morocco") or already a code ("MA").
 */
export function getWafeqCountryCode(value: string | undefined | null): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  const key = Object.keys(COUNTRY_NAME_TO_CODE).find(
    (k) => k.toLowerCase() === trimmed.toLowerCase()
  );
  return key ? COUNTRY_NAME_TO_CODE[key]! : null;
}

/** Get display value for dropdown from stored value (code or name). */
export function countryDropdownValue(
  stored: string | undefined,
  options: readonly { name: string; value: string }[] = MENA_COUNTRIES
): string {
  if (!stored || !stored.trim()) return '';
  const u = stored.trim();
  const byCode = options.find((o) => getWafeqCountryCode(o.value) === u.toUpperCase());
  if (byCode) return byCode.value;
  const byName = options.find((o) => o.value.toLowerCase() === u.toLowerCase());
  if (byName) return byName.value;
  return u;
}
