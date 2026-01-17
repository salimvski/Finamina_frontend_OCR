import { NextRequest, NextResponse } from 'next/server';
import { validateFile } from '@/lib/validation';
import { getErrorMessage, fetchWithTimeout } from '@/lib/error-handling';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('data') as File | null;
    const company_id = formData.get('company_id') as string;

    if (!company_id) {
      return NextResponse.json({ success: false, error: 'Company ID is required' }, { status: 400 });
    }

    const fileValidation = validateFile(file);
    if (!fileValidation.isValid) {
      return NextResponse.json({ success: false, error: fileValidation.error }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ success: false, error: 'File is required' }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_N8N_URL) {
      return NextResponse.json({ success: false, error: 'N8N server URL is not configured' }, { status: 500 });
    }
    // Force HTTP for server-side calls (server can call HTTP even if env var is HTTPS)
    const baseUrl = process.env.NEXT_PUBLIC_N8N_URL.replace(/^https:\/\//, 'http://');
    const n8nUrl = `${baseUrl}/webhook/upload-invoice`;

    const n8nFormData = new FormData();
    n8nFormData.append('data', file);
    n8nFormData.append('company_id', company_id);

    let n8nResponse: Response;
    try {
      n8nResponse = await fetchWithTimeout(n8nUrl, { method: 'POST', body: n8nFormData }, 120000);
    } catch (error: any) {
      return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }

    if (!n8nResponse.ok) {
      let errorMessage = `Upload failed with status ${n8nResponse.status}`;
      try {
        const errorText = await n8nResponse.text();
        errorMessage = errorText || errorMessage;
      } catch {
        // Use default
      }
      return NextResponse.json({ success: false, error: errorMessage }, { status: n8nResponse.status });
    }

    return NextResponse.json({ success: true, message: 'Invoice uploaded successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
