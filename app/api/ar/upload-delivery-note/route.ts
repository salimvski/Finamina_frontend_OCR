import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateFile } from '@/lib/validation';
import { getErrorMessage, fetchWithTimeout } from '@/lib/error-handling';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('data') as File | null;
    const company_id = formData.get('company_id') as string;
    const context = formData.get('context') as string || 'ar'; // Default to A/R

    // Validate required fields
    if (!company_id) {
      return NextResponse.json(
        { success: false, error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Validate file
    const fileValidation = validateFile(file);
    if (!fileValidation.isValid) {
      return NextResponse.json(
        { success: false, error: fileValidation.error },
        { status: 400 }
      );
    }
    if (!file) {
      return NextResponse.json({ success: false, error: 'File is required' }, { status: 400 });
    }

    // Step 1: Call n8n webhook to process the DN
    const n8nFormData = new FormData();
    n8nFormData.append('data', file);
    n8nFormData.append('company_id', company_id);
    n8nFormData.append('context', context);

    const n8nUrl = `${process.env.NEXT_PUBLIC_N8N_URL}/webhook/upload-delivery-note`;
    
    if (!n8nUrl || !process.env.NEXT_PUBLIC_N8N_URL) {
      return NextResponse.json(
        { success: false, error: 'N8N server URL is not configured' },
        { status: 500 }
      );
    }

    console.log('Calling n8n webhook:', n8nUrl);

    // Call n8n with timeout
    let n8nResponse: Response;
    try {
      n8nResponse = await fetchWithTimeout(n8nUrl, {
        method: 'POST',
        body: n8nFormData
      }, 60000); // 60 second timeout for file processing
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      console.error('N8N webhook error:', errorMessage);
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 500 }
      );
    }

    if (!n8nResponse.ok) {
      let errorMessage = 'Failed to process delivery note';
      try {
        const errorText = await n8nResponse.text();
        console.error('N8N webhook error response:', errorText);
        // Try to parse as JSON
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
      } catch {
        errorMessage = `Server returned error ${n8nResponse.status}`;
      }
      
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: n8nResponse.status }
      );
    }

    // Step 2: Wait a bit for n8n to process and save to database
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 3: Find the newly created DN (most recent one for this company)
    // We'll look for DNs created in the last 30 seconds
    const { data: recentDNs, error: dnError } = await supabase
      .from('delivery_notes')
      .select('*')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (dnError) {
      console.error('Error fetching recent DNs:', dnError);
      // Still return success since n8n processed it, we just can't update it
      return NextResponse.json({ success: true, message: 'Delivery note processed, but could not verify update' });
    }

    // Step 4: Find the DN that was just created (check by created_at timestamp)
    // If context is 'ar', we need to ensure it has customer_id and context='ar'
    if (context === 'ar' && recentDNs && recentDNs.length > 0) {
      // Get the most recent DN (likely the one just created)
      const newDN = recentDNs[0];
      
      // Check if it needs updating (missing customer_id or context)
      const needsUpdate = !newDN.customer_id || newDN.context !== 'ar';

      if (needsUpdate) {
        console.log('Updating DN with A/R context:', newDN.id);
        
        // Try to find customer_id from the PO if po_id exists
        let customer_id = newDN.customer_id;
        if (!customer_id && newDN.po_id) {
          const { data: po } = await supabase
            .from('purchase_orders')
            .select('customer_id')
            .eq('id', newDN.po_id)
            .single();
          
          if (po?.customer_id) {
            customer_id = po.customer_id;
          }
        }

        // Update the DN with correct A/R fields
        const updateData: any = {
          context: 'ar'
        };

        if (customer_id) {
          updateData.customer_id = customer_id;
        }

        // Clear supplier_id if it was set (A/R DNs shouldn't have supplier_id)
        if (newDN.supplier_id) {
          updateData.supplier_id = null;
        }

        const { error: updateError } = await supabase
          .from('delivery_notes')
          .update(updateData)
          .eq('id', newDN.id);

        if (updateError) {
          console.error('Error updating DN:', updateError);
          // Still return success, the DN was created
        } else {
          console.log('Successfully updated DN with A/R context');
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Delivery note uploaded and processed successfully' 
    });
  } catch (error: any) {
    console.error('Error in upload-delivery-note API:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
