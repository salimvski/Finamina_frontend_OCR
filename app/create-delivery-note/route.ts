import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getErrorMessage } from '@/lib/error-handling';

// Auto-generate DN number
async function generateDNNumber(company_id: string): Promise<string> {
  try {
    // Get the latest DN number from Supabase
    const { data: existingDNs, error } = await supabaseAdmin
      .from('delivery_notes')
      .select('dn_number')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching existing DNs:', error);
    }

    // Find the highest DN number
    let maxNumber = 0;
    const currentYear = new Date().getFullYear();
    const pattern = new RegExp(`DN-${currentYear}-(\\d+)`, 'i');

    if (existingDNs) {
      existingDNs.forEach((dn: any) => {
        if (dn.dn_number) {
          const match = dn.dn_number.match(pattern);
          if (match) {
            const numValue = parseInt(match[1], 10);
            if (numValue > maxNumber) {
              maxNumber = numValue;
            }
          }
        }
      });
    }

    // Generate next number
    const nextNumber = maxNumber + 1;
    return `DN-${currentYear}-${String(nextNumber).padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating DN number:', error);
    // Fallback to timestamp-based number
    const currentYear = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    return `DN-${currentYear}-${timestamp}`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const {
      company_id,
      customer_id,
      po_id,
      invoice_id,
      dn_number,
      delivery_date,
      received_by,
      context = 'ar',
      line_items = []
    } = data;

    // Validate required fields
    if (!company_id) {
      return NextResponse.json(
        { success: false, error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // If invoice_id is provided, fetch invoice data to prefill
    let invoiceData: any = null;
    if (invoice_id && typeof invoice_id === 'string' && invoice_id.trim() !== '') {
      const { data: invoice, error: invoiceError } = await supabaseAdmin
        .from('invoices')
        .select('id, customer_id, po_id, invoice_date, extraction_data')
        .eq('id', invoice_id.trim())
        .eq('company_id', company_id)
        .maybeSingle();

      if (invoiceError) {
        console.error('Create DN: invoice fetch error', { invoice_id, company_id, invoiceError });
        return NextResponse.json(
          { success: false, error: 'Invoice not found' },
          { status: 404 }
        );
      }

      if (!invoice) {
        return NextResponse.json(
          { success: false, error: 'Invoice not found' },
          { status: 404 }
        );
      }

      invoiceData = invoice;
    }

    // Use invoice data to prefill if available
    const finalCustomerId = customer_id || invoiceData?.customer_id;
    const finalPoId = po_id || invoiceData?.po_id || null;
    const finalDeliveryDate = delivery_date || invoiceData?.invoice_date || new Date().toISOString().split('T')[0];

    if (!finalCustomerId) {
      return NextResponse.json(
        { success: false, error: 'Customer ID is required (provide directly or via invoice)' },
        { status: 400 }
      );
    }

    // Auto-generate DN number if not provided
    let finalDNNumber = dn_number;
    if (!finalDNNumber || finalDNNumber.trim() === '') {
      finalDNNumber = await generateDNNumber(company_id);
    }

    if (!finalDeliveryDate) {
      return NextResponse.json(
        { success: false, error: 'Delivery date is required' },
        { status: 400 }
      );
    }

    // Prefill line items from invoice if available and not provided
    let finalLineItems = line_items;
    if (finalLineItems.length === 0 && invoiceData) {
      const fromTable = invoiceData.invoice_items && invoiceData.invoice_items.length > 0
        ? invoiceData.invoice_items
        : invoiceData.extraction_data?.lineItems || [];
      if (fromTable.length > 0) {
        finalLineItems = fromTable.map((item: any) => ({
          description: item.description || item.item_name || '',
          quantity: typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity) || 0,
          unit_price: typeof item.unit_price === 'number' ? item.unit_price : parseFloat(item.unit_price) || 0,
          item_number: item.item_number || item.item_name || 'N/A',
          unit_of_measure: item.unit_of_measure || 'pcs'
        }));
      }
    }

    const totalAmount = finalLineItems.reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0);

    // supplier_id is NOT NULL on delivery_notes; A/R has no real supplier. Use env or first company supplier.
    let supplierIdForAr = process.env.PLACEHOLDER_SUPPLIER_ID_FOR_AR;
    if (!supplierIdForAr) {
      const { data: sup } = await supabaseAdmin.from('suppliers').select('id').eq('company_id', company_id).limit(1).maybeSingle();
      supplierIdForAr = sup?.id ?? null;
    }
    if (!supplierIdForAr) {
      return NextResponse.json(
        { success: false, error: 'delivery_notes.supplier_id is required. Add a supplier for this company, or run: ALTER TABLE delivery_notes ALTER COLUMN supplier_id DROP NOT NULL;' },
        { status: 400 }
      );
    }

    const dnInsert: Record<string, unknown> = {
      company_id,
      customer_id: finalCustomerId,
      po_id: finalPoId,
      supplier_id: supplierIdForAr,
      dn_number: finalDNNumber,
      delivery_date: finalDeliveryDate,
      received_by: received_by || null,
      context: context || 'ar',
      status: 'pending',
      extraction_data: { ...(invoice_id ? { invoice_id } : {}), amount: totalAmount }
    };

    const { data: deliveryNote, error: dnError } = await supabaseAdmin
      .from('delivery_notes')
      .insert(dnInsert)
      .select()
      .single();

    if (dnError) {
      console.error('Error creating delivery note:', dnError);
      return NextResponse.json(
        { success: false, error: getErrorMessage(dnError) },
        { status: 500 }
      );
    }

    // Create line items if provided
    if (finalLineItems && finalLineItems.length > 0 && deliveryNote) {
      const dnLineItems = finalLineItems.map((item: any) => ({
        dn_id: deliveryNote.id,
        item_number: item.item_number || 'N/A',
        description: item.description || '',
        quantity: item.quantity || 0,
        unit_price: item.unit_price || 0,
        total_amount: (item.quantity || 0) * (item.unit_price || 0),
        unit_of_measure: item.unit_of_measure || 'pcs'
      }));

      const { error: lineItemsError } = await supabaseAdmin
        .from('dn_line_items')
        .insert(dnLineItems);

      if (lineItemsError) {
        console.error('Error creating DN line items:', lineItemsError);
        // Don't fail the whole operation, just log the error
      }
    }

    // Update invoice to link this DN if invoice_id was provided (required for 3-way match)
    let linkWarning: string | undefined;
    if (invoice_id && deliveryNote) {
      const { error: linkErr } = await supabaseAdmin
        .from('invoices')
        .update({ dn_id: deliveryNote.id })
        .eq('id', invoice_id);
      if (linkErr) {
        console.error('Create DN: failed to link invoice to DN', { invoice_id, dn_id: deliveryNote.id, error: linkErr });
        linkWarning = 'DN created but could not link to invoice. Ensure invoices.dn_id column exists. 3-way match will not include this DN until linked.';
      }
    }

    return NextResponse.json({
      success: true,
      data: deliveryNote,
      message: 'Delivery note created successfully',
      ...(linkWarning && { warning: linkWarning })
    });
  } catch (error: any) {
    console.error('Error in create-delivery-note API:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
