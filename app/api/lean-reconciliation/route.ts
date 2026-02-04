import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_N8N_URL || '';

/**
 * Proxy to backend lean-reconciliation. Called from the browser so we avoid
 * mixed-content blocking (browser → our API over HTTPS, then server → backend over HTTP).
 */
export async function POST(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id');
    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'company_id is required' },
        { status: 400 }
      );
    }

    if (!BACKEND_URL?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Backend URL is not configured. Set NEXT_PUBLIC_BACKEND_URL.' },
        { status: 500 }
      );
    }

    let baseUrl = BACKEND_URL.trim().replace(/\/$/, '');
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `http://${baseUrl}`;
    }
    const backendUrl = `${baseUrl}/webhook/lean-reconciliation?company_id=${encodeURIComponent(companyId)}`;

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data.error || data.detail || `Backend returned ${response.status}` },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Lean reconciliation proxy error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to run lean reconciliation' },
      { status: 500 }
    );
  }
}
