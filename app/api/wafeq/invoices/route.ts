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

// POST /api/wafeq/invoices - Create a new invoice
export async function POST(request: NextRequest) {
  try {
    const invoiceData = await request.json();

    // Map our form data to Wafeq's expected format
    const wafeqPayload: any = {
      contact: invoiceData.customer_id, // Wafeq expects contact ID (customer)
      invoice_number: invoiceData.invoice_number,
      invoice_date: invoiceData.invoice_date,
      invoice_due_date: invoiceData.due_date, // Wafeq uses invoice_due_date, not due_date
      currency: invoiceData.currency,
    };

    // Add optional fields only if they have values
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

        // Account is required - Wafeq accepts string IDs like "acc_KEi3RuQTxLXvaCostgNDnq"
        if (item.account) {
          lineItem.account = item.account; // Use as string ID
        } else {
          throw new Error('Account is required for line items.');
        }

        // Tax rate - Wafeq accepts string IDs like "tax_VhZKtotYoETzeWP6puoJ7g"
        if (item.tax_rate) {
          lineItem.tax_rate = item.tax_rate; // Use as string ID
        }

        if (item.discount && item.discount > 0) {
          lineItem.discount = item.discount;
        }

        return lineItem;
      });
    }

    // Create invoice in Wafeq
    const result = await wafeqRequest('/invoices/', 'POST', wafeqPayload);

    return NextResponse.json({
      success: true,
      wafeq_id: result.id || result.invoice_id,
      invoice: result,
    });
  } catch (error: any) {
    console.error('Error creating Wafeq invoice:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create invoice in Wafeq' },
      { status: 500 }
    );
  }
}

// GET /api/wafeq/invoices - List invoices (optional, for syncing)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const wafeqId = searchParams.get('wafeq_id');

    if (wafeqId) {
      // Fetch specific invoice
      const invoice = await wafeqRequest(`/invoices/${wafeqId}/`, 'GET');
      return NextResponse.json({ success: true, invoice });
    } else {
      // List all invoices
      const response = await wafeqRequest('/invoices/', 'GET');
      const invoices = response.results || response || [];
      return NextResponse.json({ success: true, invoices });
    }
  } catch (error: any) {
    console.error('Error fetching Wafeq invoices:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch invoices from Wafeq' },
      { status: 500 }
    );
  }
}
