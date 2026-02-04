import { NextRequest, NextResponse } from 'next/server';

// Wafeq API base URL
const WAFEQ_API_BASE = 'https://api.wafeq.com/v1';

// Get Wafeq API key from environment variables
// Store this in your .env.local file: WAFEQ_API_KEY=your_api_key_here
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

/** Saudi VAT: 15 digits, must start and end with 3. Returns null if empty; throws if invalid. */
function normalizeTaxRegistrationNumber(value: string | undefined): string | null {
  if (!value || !value.trim()) return null;
  const digits = value.trim().replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length !== 15 || digits[0] !== '3' || digits[14] !== '3') {
    throw new Error(
      'Tax registration number must be exactly 15 digits, starting and ending with 3 (e.g. 310123456700003). Leave empty if not applicable.'
    );
  }
  return digits;
}

// POST /api/wafeq/contacts - Create a new contact
export async function POST(request: NextRequest) {
  try {
    const contactData = await request.json();

    // Map our form data to Wafeq's expected format
    // Wafeq requires 'name' field (not company_name)
    const wafeqPayload: any = {
      name: contactData.company_name, // Wafeq expects 'name', not 'company_name'
    };

    // Country - Only include if provided
    if (contactData.country && contactData.country.trim()) {
      // Try to map common country names to codes
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

    // Tax registration number - Validate Saudi format (15 digits, start/end with 3) or omit
    try {
      const trn = normalizeTaxRegistrationNumber(contactData.tax_registration_number);
      if (trn) wafeqPayload.tax_registration_number = trn;
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: e.message || 'Invalid tax registration number' },
        { status: 400 }
      );
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

    // Create contact in Wafeq
    const result = await wafeqRequest('/contacts/', 'POST', wafeqPayload);

    return NextResponse.json({
      success: true,
      wafeq_id: result.id || result.wafeq_id,
      contact: result,
    });
  } catch (error: any) {
    console.error('Error creating Wafeq contact:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create contact in Wafeq' },
      { status: 500 }
    );
  }
}

// GET /api/wafeq/contacts - List contacts (optional, for syncing)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const wafeqId = searchParams.get('wafeq_id');

    if (wafeqId) {
      // Fetch specific contact
      const contact = await wafeqRequest(`/contacts/${wafeqId}/`, 'GET');
      return NextResponse.json({ success: true, contact });
    } else {
      // List all contacts
      // Wafeq API might return paginated results, handle both formats
      const response = await wafeqRequest('/contacts/', 'GET');
      
      // Wafeq might return { results: [...] } or direct array
      const contacts = response.results || response || [];
      
      return NextResponse.json({ success: true, contacts });
    }
  } catch (error: any) {
    console.error('Error fetching Wafeq contacts:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch contacts from Wafeq' },
      { status: 500 }
    );
  }
}
