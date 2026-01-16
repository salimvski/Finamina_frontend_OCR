import { NextRequest, NextResponse } from 'next/server';

// Wafeq API base URL
const WAFEQ_API_BASE = 'https://api.wafeq.com/v1';

// Get Wafeq API key from environment variables
const getWafeqApiKey = () => {
  const apiKey = process.env.WAFEQ_API_KEY;
  if (!apiKey) {
    throw new Error('WAFEQ_API_KEY environment variable is not set');
  }
  return apiKey;
};

// Helper function to make Wafeq API requests
async function wafeqRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  body?: any
) {
  const apiKey = getWafeqApiKey();
  
  const response = await fetch(`${WAFEQ_API_BASE}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wafeq API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// PATCH /api/wafeq/invoices/[wafeqId] - Update an existing invoice
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wafeqId: string }> }
) {
  try {
    const { wafeqId } = await params;

    if (!wafeqId) {
      return NextResponse.json(
        { success: false, error: 'Wafeq invoice ID is required' },
        { status: 400 }
      );
    }

    const invoiceData = await request.json();

    // Map our form data to Wafeq's expected format
    const wafeqPayload: any = {};

    // Add optional fields only if they have values
    if (invoiceData.invoice_due_date) {
      wafeqPayload.invoice_due_date = invoiceData.invoice_due_date;
    }
    if (invoiceData.purchase_order && invoiceData.purchase_order.trim()) {
      wafeqPayload.purchase_order = invoiceData.purchase_order.trim();
    }
    if (invoiceData.reference && invoiceData.reference.trim()) {
      wafeqPayload.reference = invoiceData.reference.trim();
    }
    if (invoiceData.notes && invoiceData.notes.trim()) {
      wafeqPayload.notes = invoiceData.notes.trim();
    }

    // Line items - Wafeq expects array of line items
    if (invoiceData.line_items && Array.isArray(invoiceData.line_items)) {
      wafeqPayload.line_items = invoiceData.line_items.map((item: any) => {
        const lineItem: any = {
          description: item.description,
          quantity: item.quantity,
          unit_amount: item.unit_price, // Wafeq uses unit_amount, not unit_price
        };

        // Account is required
        if (item.account) {
          lineItem.account = item.account;
        }

        // Tax rate
        if (item.tax_rate) {
          lineItem.tax_rate = item.tax_rate;
        }

        if (item.discount && item.discount > 0) {
          lineItem.discount = item.discount;
        }

        return lineItem;
      });
    }

    // Update invoice in Wafeq
    const result = await wafeqRequest(`/invoices/${wafeqId}/`, 'PATCH', wafeqPayload);

    return NextResponse.json({
      success: true,
      invoice: result,
    });
  } catch (error: any) {
    console.error('Error updating Wafeq invoice:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update invoice in Wafeq' },
      { status: 500 }
    );
  }
}
