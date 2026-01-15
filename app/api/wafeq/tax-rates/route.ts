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

// GET /api/wafeq/tax-rates - List tax rates
export async function GET(request: NextRequest) {
  try {
    const response = await wafeqRequest('/tax-rates/', 'GET');
    const taxRates = response.results || response || [];
    return NextResponse.json({ success: true, taxRates });
  } catch (error: any) {
    console.error('Error fetching Wafeq tax rates:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch tax rates from Wafeq' },
      { status: 500 }
    );
  }
}
