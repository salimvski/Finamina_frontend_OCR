import { NextRequest, NextResponse } from 'next/server';
import { validateFile } from '@/lib/validation';
import { getErrorMessage, fetchWithTimeout } from '@/lib/error-handling';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('data') as File | null;
    const company_id = formData.get('company_id') as string;

    console.log('Upload PO: Received request', {
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      companyId: company_id,
      formDataKeys: Array.from(formData.keys())
    });

    if (!company_id) {
      console.error('Upload PO: Missing company_id');
      return NextResponse.json({ success: false, error: 'Company ID is required' }, { status: 400 });
    }

    if (!file) {
      console.error('Upload PO: File is null');
      return NextResponse.json({ success: false, error: 'File is required' }, { status: 400 });
    }

    const fileValidation = validateFile(file);
    if (!fileValidation.isValid) {
      console.error('Upload PO: File validation failed:', fileValidation.error, {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });
      return NextResponse.json({ success: false, error: fileValidation.error }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_N8N_URL) {
      console.error('Upload PO: NEXT_PUBLIC_N8N_URL not configured');
      return NextResponse.json({ success: false, error: 'N8N server URL is not configured' }, { status: 500 });
    }
    
    // Force HTTP for server-side calls (server can call HTTP even if env var is HTTPS)
    let baseUrl = process.env.NEXT_PUBLIC_N8N_URL.trim();
    if (baseUrl.startsWith('https://')) {
      baseUrl = baseUrl.replace('https://', 'http://');
    } else if (!baseUrl.startsWith('http://')) {
      // If it doesn't start with http:// or https://, add http://
      baseUrl = `http://${baseUrl}`;
    }
    // Remove trailing slash if present
    baseUrl = baseUrl.replace(/\/$/, '');
    // Note: n8n webhook path is /webhook/upload-purchase-order (no /ar/ prefix)
    const n8nUrl = `${baseUrl}/webhook/upload-purchase-order`;
    
    console.log('Upload PO: Calling n8n webhook:', n8nUrl);
    console.log('Upload PO: Base URL from env:', process.env.NEXT_PUBLIC_N8N_URL);

    const n8nFormData = new FormData();
    n8nFormData.append('data', file);
    n8nFormData.append('company_id', company_id);

    let n8nResponse: Response;
    try {
      n8nResponse = await fetchWithTimeout(n8nUrl, { method: 'POST', body: n8nFormData }, 120000);
    } catch (error: any) {
      const errorMsg = getErrorMessage(error);
      console.error('Upload PO: N8N fetch error:', errorMsg);
      return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
    }

    const responseText = await n8nResponse.text();
    console.log('Upload PO: N8N response status:', n8nResponse.status);
    console.log('Upload PO: N8N response body:', responseText.substring(0, 500)); // Log first 500 chars
    
    if (!n8nResponse.ok) {
      let errorMessage = `Upload failed with status ${n8nResponse.status}`;
      try {
        const errorJson = JSON.parse(responseText);
        errorMessage = errorJson.error || errorJson.message || responseText || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }
      console.error('Upload PO: N8N returned error:', errorMessage);
      return NextResponse.json({ success: false, error: errorMessage }, { status: n8nResponse.status });
    }

    let responseData: any = { success: true };
    try {
      responseData = JSON.parse(responseText);
    } catch {
      if (responseText.toLowerCase().includes('error') || responseText.toLowerCase().includes('duplicate')) {
        console.error('Upload PO: Response contains error keywords:', responseText);
        return NextResponse.json({ success: false, error: responseText }, { status: 400 });
      }
    }

    if (responseData.error || !responseData.success) {
      console.error('Upload PO: Response indicates failure:', responseData);
      return NextResponse.json({ success: false, error: responseData.error || 'Upload failed' }, { status: 400 });
    }

    console.log('Upload PO: Success');
    return NextResponse.json({ success: true, message: 'Purchase order uploaded successfully' });
  } catch (error: any) {
    const errorMsg = getErrorMessage(error);
    console.error('Upload PO: Unexpected error:', errorMsg, error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
