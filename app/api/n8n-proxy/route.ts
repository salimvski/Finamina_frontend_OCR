import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Uses N8N_URL from environment (server-side only)
    const n8nUrl = process.env.N8N_URL || 'http://localhost:5678';
    
    console.log('Calling n8n at:', n8nUrl);
    
    const response = await fetch(`${n8nUrl}/webhook/lean-reconciliation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`n8n returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to connect to n8n', details: errorMessage }, 
      { status: 500 }
    );
  }
}