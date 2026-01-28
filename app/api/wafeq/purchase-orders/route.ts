import { NextRequest, NextResponse } from 'next/server';

// Reuse same Wafeq helpers pattern as other routes
const WAFEQ_API_BASE = 'https://api.wafeq.com/v1';

const getWafeqApiKey = () => {
  const apiKey = process.env.WAFEQ_API_KEY;
  if (!apiKey) {
    throw new Error('WAFEQ_API_KEY environment variable is not set');
  }
  return apiKey;
};

async function wafeqRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  body?: any
) {
  const apiKey = getWafeqApiKey();

  const response = await fetch(`${WAFEQ_API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Api-Key ${apiKey}`,
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

// POST /api/wafeq/purchase-orders - Create a new purchase order in Wafeq
export async function POST(request: NextRequest) {
  try {
    const poData = await request.json();

    // Expected input from client:
    // {
    //   supplier_id: string (Wafeq contact ID for supplier),
    //   po_number: string,
    //   po_date: string (YYYY-MM-DD),
    //   currency: string,
    //   line_items?: Array<{ description: string; quantity: number; unit_price: number }>,
    //   notes?: string
    // }

    if (!poData.supplier_id) {
      return NextResponse.json(
        { success: false, error: 'Missing supplier_id for Wafeq purchase order' },
        { status: 400 }
      );
    }

    if (!poData.po_number) {
      return NextResponse.json(
        { success: false, error: 'Missing po_number for Wafeq purchase order' },
        { status: 400 }
      );
    }

    const wafeqPayload: any = {
      // Field names chosen to mirror typical Wafeq patterns; adjust if needed
      contact: poData.supplier_id,
      purchase_order_number: poData.po_number,
      purchase_order_date: poData.po_date,
      currency: poData.currency || 'SAR',
    };

    if (poData.notes && typeof poData.notes === 'string' && poData.notes.trim()) {
      wafeqPayload.notes = poData.notes.trim();
    }

    if (poData.line_items && Array.isArray(poData.line_items) && poData.line_items.length > 0) {
      wafeqPayload.line_items = poData.line_items.map((item: any) => ({
        description: item.description,
        quantity: item.quantity,
        unit_amount: item.unit_price,
      }));
    }

    const result = await wafeqRequest('/purchase-orders/', 'POST', wafeqPayload);

    return NextResponse.json({
      success: true,
      wafeq_id: result.id || result.purchase_order_id,
      purchase_order: result,
    });
  } catch (error: any) {
    console.error('Error creating Wafeq purchase order:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to create purchase order in Wafeq',
      },
      { status: 500 }
    );
  }
}

