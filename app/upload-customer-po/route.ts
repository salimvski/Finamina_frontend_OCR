import { NextRequest, NextResponse } from 'next/server';
import { validateFile } from '@/lib/validation';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_N8N_URL || '';

export async function POST(request: NextRequest) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (parseError: any) {
      console.error('Upload Customer PO: Failed to parse FormData', parseError);
      return NextResponse.json(
        { success: false, error: `Failed to parse request: ${parseError.message || 'Invalid form data'}` },
        { status: 400 }
      );
    }
    
    const file = formData.get('data') as File | null;
    const companyId = formData.get('company_id') as string | null;

    // Validate file
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    const fileValidation = validateFile(file);
    if (!fileValidation.isValid) {
      return NextResponse.json(
        { success: false, error: fileValidation.error },
        { status: 400 }
      );
    }

    // Validate company_id
    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'Company ID is required' },
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
    const backendUrl = `${baseUrl}/webhook/upload-customer-po`;

    const body = new FormData();
    body.append('data', file);
    body.append('company_id', companyId);

    const backendResponse = await fetch(backendUrl, { method: 'POST', body });
    const responseText = await backendResponse.text();

    if (!backendResponse.ok) {
      let errorMessage = `Upload failed with status ${backendResponse.status}`;
      try {
        const err = JSON.parse(responseText);
        errorMessage = err.error || err.detail || err.message || errorMessage;
      } catch {
        if (responseText.trim()) errorMessage = responseText.trim();
      }
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: backendResponse.status }
      );
    }

    let data: any;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON response from backend' },
        { status: 502 }
      );
    }

    // Pass through REST response: { success, data } or { success, data: { id, po_number, ... } }
    const payload = data.data !== undefined ? data : { success: true, data };
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('Error uploading customer PO:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to upload customer PO' },
      { status: 500 }
    );
  }
}
