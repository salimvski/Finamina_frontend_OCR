/**
 * Match an extracted company name (from OCR) to existing customers by company_name.
 * Finds a row in customers that has the same company name (exact, then partial, then fuzzy).
 */

export type MatchConfidence = 'exact' | 'partial' | 'fuzzy' | 'none';

export interface CustomerMatchResult<T = { id: string; name?: string; company_name?: string }> {
  match: T | null;
  confidence: MatchConfidence;
}

export function matchCustomer<T extends { id: string; name?: string; company_name?: string }>(
  extractedCompanyName: string,
  customers: T[]
): CustomerMatchResult<T> {
  const normalized = (extractedCompanyName || '').trim().toLowerCase();
  if (!normalized) {
    return { match: null, confidence: 'none' };
  }

  // Match only by company_name: find a row that has the same company name
  const withCompanyName = customers.filter((c) => (c.company_name || '').trim().length > 0);

  // Exact: same company name (case-insensitive)
  const exactMatch = withCompanyName.find(
    (c) => (c.company_name || '').trim().toLowerCase() === normalized
  );
  if (exactMatch) return { match: exactMatch, confidence: 'exact' };

  // Partial: one contains the other (company_name only)
  const containsMatch = withCompanyName.find((c) => {
    const cn = (c.company_name || '').trim().toLowerCase();
    return cn.includes(normalized) || normalized.includes(cn);
  });
  if (containsMatch) return { match: containsMatch, confidence: 'partial' };

  // Fuzzy: any word (3+ chars) from extracted name appears in company_name
  const words = normalized.split(/\s+/).filter((w) => w.length >= 3);
  const fuzzyMatch = withCompanyName.find((c) => {
    const cn = (c.company_name || '').trim().toLowerCase();
    if (!cn) return false;
    const companyWords = cn.split(/\s+/);
    return words.some((w) => companyWords.some((cw) => cw.includes(w) || w.includes(cw)));
  });
  if (fuzzyMatch) return { match: fuzzyMatch, confidence: 'fuzzy' };

  return { match: null, confidence: 'none' };
}
