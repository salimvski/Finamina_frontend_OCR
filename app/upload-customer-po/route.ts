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
    // Check both NEXT_PUBLIC_N8N_URL and process.env directly (for server-side)
    const n8nUrlEnv = process.env.NEXT_PUBLIC_N8N_URL || N8N_URL || '';
    if (!n8nUrlEnv || !n8nUrlEnv.trim()) {
      console.error('Upload Customer PO: NEXT_PUBLIC_N8N_URL not configured');
      console.error('Upload Customer PO: Environment variable check:', {
        N8N_URL: N8N_URL ? 'set' : 'not set',
        processEnv: process.env.NEXT_PUBLIC_N8N_URL ? 'set' : 'not set'
      });
      return NextResponse.json(
        { 
          success: false, 
          error: 'N8N server URL is not configured. Please set NEXT_PUBLIC_N8N_URL environment variable in Vercel project settings.' 
        },
        { status: 500 }
      );
    }

    // Force HTTP for server-side calls (server can call HTTP even if env var is HTTPS)
    let baseUrl = n8nUrlEnv.trim();
    if (baseUrl.startsWith('https://')) {
      baseUrl = baseUrl.replace('https://', 'http://');
    } else if (!baseUrl.startsWith('http://')) {
      // If it doesn't start with http:// or https://, add http://
      baseUrl = `http://${baseUrl}`;
    }
    // Remove trailing slash if present
    baseUrl = baseUrl.replace(/\/$/, '');
    
    // Call n8n webhook - ensure /webhook/ is in the path
    const n8nUrl = `${baseUrl}/webhook/upload-customer-po`;
    console.log('Upload Customer PO: Calling n8n webhook:', n8nUrl);
    console.log('Upload Customer PO: Base URL from env:', n8nUrlEnv);

    // Prepare form data for n8n
    const n8nFormData = new FormData();
    n8nFormData.append('data', file);
    n8nFormData.append('company_id', companyId);
    
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
