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

// GET /api/wafeq/contacts/[wafeqId] - Get a specific contact
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wafeqId: string }> }
) {
  try {
    const { wafeqId } = await params;
    const contact = await wafeqRequest(`/contacts/${wafeqId}/`, 'GET');
    return NextResponse.json({ success: true, contact });
  } catch (error: any) {
    console.error('Error fetching Wafeq contact:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch contact from Wafeq' },
      { status: 500 }
    );
  }
}

// PUT /api/wafeq/contacts/[wafeqId] - Update a contact
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ wafeqId: string }> }
) {
  try {
    const { wafeqId } = await params;
    const contactData = await request.json();

    // Map our form data to Wafeq's expected format
    // Wafeq requires 'name' field (not company_name)
    const wafeqPayload: any = {
      name: contactData.company_name, // Wafeq expects 'name', not 'company_name'
    };

    // Country - Only include if provided
    if (contactData.country && contactData.country.trim()) {
      const countryMap: { [key: string]: string } = {
        'Saudi Arabia': 'SA',
        'United States': 'US',
        'United Arab Emirates': 'AE',
        'Kuwait': 'KW',
        'Qatar': 'QA',
        'Bahrain': 'BH',
        'Oman': 'OM',
        'Jordan': 'JO',
        'Egypt': 'EG',
        'Lebanon': 'LB'
      };
      
      const countryValue = countryMap[contactData.country] || contactData.country;
      wafeqPayload.country = countryValue;
    }

    // Tax registration number - Only include if provided
    if (contactData.tax_registration_number && contactData.tax_registration_number.trim()) {
      wafeqPayload.tax_registration_number = contactData.tax_registration_number.trim();
    }

    // Address fields - Build address object only if at least one field has a value
    const addressFields: any = {};
    if (contactData.city && contactData.city.trim()) addressFields.city = contactData.city.trim();
    if (contactData.street_address && contactData.street_address.trim()) addressFields.street_address = contactData.street_address.trim();
    if (contactData.building_number && contactData.building_number.trim()) addressFields.building_number = contactData.building_number.trim();
    if (contactData.district && contactData.district.trim()) addressFields.district = contactData.district.trim();
    if (contactData.address_additional_number && contactData.address_additional_number.trim()) {
      addressFields.address_additional_number = contactData.address_additional_number.trim();
    }
    if (contactData.postal_code && contactData.postal_code.trim()) addressFields.postal_code = contactData.postal_code.trim();

    // Only include address if it has at least one field
    if (Object.keys(addressFields).length > 0) {
      wafeqPayload.address = addressFields;
    }

    // Invoicing information
    if (contactData.contact_code && contactData.contact_code.trim()) {
      wafeqPayload.code = contactData.contact_code.trim();
    }
    
    // Email and Phone are required for reminders
    if (contactData.email && contactData.email.trim()) {
      wafeqPayload.email = contactData.email.trim();
    } else {
      throw new Error('Email is required for sending reminders');
    }
    
    if (contactData.phone && contactData.phone.trim()) {
      wafeqPayload.phone = contactData.phone.trim();
    } else {
      throw new Error('Phone is required for sending reminders');
    }
    
    // Relationship - Wafeq expects a list/array, not a string
    // Only include if provided
    if (contactData.relationship) {
      if (contactData.relationship === 'both') {
        wafeqPayload.relationship = ['customer', 'supplier'];
      } else {
        wafeqPayload.relationship = [contactData.relationship];
      }
    }
    
    if (contactData.payment_terms && contactData.payment_terms.trim()) {
      wafeqPayload.payment_terms = contactData.payment_terms.trim();
    }
    if (contactData.contact_id_type && contactData.contact_id_type.trim()) {
      wafeqPayload.contact_id_type = contactData.contact_id_type.trim();
    }
    if (contactData.id_number && contactData.id_number.trim()) {
      wafeqPayload.id_number = contactData.id_number.trim();
    }

    // Contact defaults - Selling
    if (contactData.default_revenue_account || 
        contactData.default_revenue_cost_center || 
        contactData.default_revenue_tax_rate) {
      wafeqPayload.selling_defaults = {};
      if (contactData.default_revenue_account) {
        wafeqPayload.selling_defaults.default_revenue_account = contactData.default_revenue_account;
      }
      if (contactData.default_revenue_cost_center) {
        wafeqPayload.selling_defaults.default_revenue_cost_center = contactData.default_revenue_cost_center;
      }
      if (contactData.default_revenue_tax_rate) {
        wafeqPayload.selling_defaults.default_revenue_tax_rate = contactData.default_revenue_tax_rate;
      }
    }

    // Contact defaults - Purchasing
    if (contactData.default_expense_account || 
        contactData.default_expense_cost_center || 
        contactData.default_expense_tax_rate) {
      wafeqPayload.purchasing_defaults = {};
      if (contactData.default_expense_account) {
        wafeqPayload.purchasing_defaults.default_expense_account = contactData.default_expense_account;
      }
      if (contactData.default_expense_cost_center) {
        wafeqPayload.purchasing_defaults.default_expense_cost_center = contactData.default_expense_cost_center;
      }
      if (contactData.default_expense_tax_rate) {
        wafeqPayload.purchasing_defaults.default_expense_tax_rate = contactData.default_expense_tax_rate;
      }
    }

    // Update contact in Wafeq
    const result = await wafeqRequest(`/contacts/${wafeqId}/`, 'PUT', wafeqPayload);

    return NextResponse.json({
      success: true,
      wafeq_id: result.id || wafeqId,
      contact: result,
    });
  } catch (error: any) {
    console.error('Error updating Wafeq contact:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update contact in Wafeq' },
      { status: 500 }
    );
  }
}

// DELETE /api/wafeq/contacts/[wafeqId] - Delete a contact
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wafeqId: string }> }
) {
  try {
    const { wafeqId } = await params;
    await wafeqRequest(`/contacts/${wafeqId}/`, 'DELETE');
    return NextResponse.json({ success: true, message: 'Contact deleted from Wafeq' });
  } catch (error: any) {
    console.error('Error deleting Wafeq contact:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete contact from Wafeq' },
      { status: 500 }
    );
  }
}
