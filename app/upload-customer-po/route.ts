import { NextRequest, NextResponse } from 'next/server';
import { validateFile } from '@/lib/validation';

const N8N_URL = process.env.NEXT_PUBLIC_N8N_URL || '';

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

    // Validate and normalize n8n URL
    if (!N8N_URL || !N8N_URL.trim()) {
      console.error('Upload Customer PO: NEXT_PUBLIC_N8N_URL not configured');
      return NextResponse.json(
        { success: false, error: 'N8N server URL is not configured' },
        { status: 500 }
      );
    }

    let baseUrl = N8N_URL.trim();
    // Remove trailing slash if present
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    // Convert https:// to http:// for server-side calls
    if (baseUrl.startsWith('https://')) {
      baseUrl = baseUrl.replace('https://', 'http://');
    }

    // Prepare form data for n8n
    const n8nFormData = new FormData();
    n8nFormData.append('data', file);
    n8nFormData.append('company_id', companyId);

    // Call n8n webhook - ensure /webhook/ is in the path
    const n8nUrl = `${baseUrl}/webhook/upload-customer-po`;
    console.log('Upload Customer PO: Calling n8n webhook:', n8nUrl);
    
    const n8nResponse = await fetch(n8nUrl, {
      method: 'POST',
      body: n8nFormData,
    });

    const responseText = await n8nResponse.text();
    console.log('Upload Customer PO: n8n response status:', n8nResponse.status);
    console.log('Upload Customer PO: n8n response body:', responseText.substring(0, 500));

    if (!n8nResponse.ok) {
      let errorMessage = `Upload failed with status ${n8nResponse.status}`;
      try {
        const errorJson = JSON.parse(responseText);
        errorMessage = errorJson.error || errorJson.message || responseText || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: n8nResponse.status }
      );
    }

    // Parse response
    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      // If not JSON, check for error keywords
      if (responseText.toLowerCase().includes('error') || 
          responseText.toLowerCase().includes('failed') ||
          responseText.toLowerCase().includes('duplicate')) {
        return NextResponse.json(
          { success: false, error: responseText || 'Upload failed - n8n returned an error' },
          { status: 500 }
        );
      }
      // Assume success if status is OK
      responseData = { success: true };
    }

    // Check for errors, but "Workflow was started" is actually a success message
    if (responseData.error) {
      const errorMsg = String(responseData.error).toLowerCase();
      // "Workflow was started" means n8n accepted the request and is processing
      if (errorMsg.includes('workflow was started') || errorMsg.includes('workflow started')) {
        // Treat as success - workflow is processing asynchronously
        return NextResponse.json({
          success: true,
          data: responseData.data || responseData,
          message: 'Workflow started successfully'
        });
      }
      // Other errors are real errors
      return NextResponse.json(
        { success: false, error: responseData.error || responseData.message || 'Upload failed' },
        { status: 500 }
      );
    }
    
    if (!responseData.success && !Array.isArray(responseData) && !responseData.data) {
      return NextResponse.json(
        { success: false, error: responseData.message || 'Upload failed' },
        { status: 500 }
      );
    }

    // Return the PO data (should be an array with PO object)
    return NextResponse.json({
      success: true,
      data: Array.isArray(responseData) ? responseData[0] : responseData
    });
  } catch (error: any) {
    console.error('Error uploading customer PO:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to upload customer PO' },
      { status: 500 }
    );
  }
}
