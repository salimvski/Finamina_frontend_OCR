import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// A/R 3-Way Matching API Route
// This implements matching logic without needing n8n
// Compares: Customer PO + Delivery Note + Invoice

export async function POST(request: NextRequest) {
  try {
    const { company_id } = await request.json();

    if (!company_id) {
      return NextResponse.json(
        { success: false, error: 'company_id is required' },
        { status: 400 }
      );
    }

    // Step 1: Load all invoices with PO and DN links
    const { data: invoices, error: invoicesError } = await supabaseAdmin
      .from('invoices')
      .select(`
        id,
        invoice_number,
        amount,
        tax_amount,
        po_id,
        dn_id,
        customer_id,
        extraction_data
      `)
      .eq('company_id', company_id)
      .not('po_id', 'is', null);

    if (invoicesError) {
      throw new Error(`Failed to load invoices: ${invoicesError.message}`);
    }

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No invoices with PO links found',
        matches_created: 0,
        anomalies_created: 0
      });
    }

    let matchesCreated = 0;
    let anomaliesCreated = 0;

    // Step 2: For each invoice, try to match with PO and DN
    for (const invoice of invoices) {
      if (!invoice.po_id) continue;

      // Load PO
      const { data: po, error: poError } = await supabaseAdmin
        .from('purchase_orders')
        .select('id, po_number, amount, tax_amount, customer_id, supplier_id, extraction_data')
        .eq('id', invoice.po_id)
        .single();

      if (poError || !po) continue;

      // Determine customer_id
      const customerId = invoice.customer_id || po.customer_id || (po.supplier_id && po.supplier_id);
      if (!customerId) continue;

      // Load DN if linked
      let dn = null;
      if (invoice.dn_id) {
        const { data: dnData, error: dnError } = await supabaseAdmin
          .from('delivery_notes')
          .select('id, dn_number, amount, tax_amount, customer_id, po_id, extraction_data')
          .eq('id', invoice.dn_id)
          .maybeSingle();

        if (!dnError && dnData) {
          dn = dnData;
        }
      }

      // Calculate amounts (DN amount can be in amount or extraction_data.amount)
      const poAmount = parseFloat(po.amount || '0');
      const invoiceAmount = parseFloat(invoice.amount?.toString() || '0');
      const dnAmount = dn ? parseFloat(String(dn.amount ?? dn.extraction_data?.amount ?? '0')) : null;

      // Determine match type
      const matchType = dn ? '3-way' : '2-way';

      // Calculate discrepancies
      const amountDiscrepancy = invoiceAmount - poAmount;
      let isPerfectMatch = Math.abs(amountDiscrepancy) < 0.01; // Allow small rounding differences

      // If DN exists, check DN vs PO and Invoice
      let dnDiscrepancy = 0;
      if (dn) {
        dnDiscrepancy = dnAmount! - poAmount;
        if (Math.abs(dnDiscrepancy) > 0.01 || Math.abs(amountDiscrepancy) > 0.01) {
          isPerfectMatch = false;
        }
      }

      // Determine match status
      let matchStatus: 'perfect' | 'partial' | 'mismatch' = 'partial';
      if (isPerfectMatch) {
        matchStatus = 'perfect';
      } else if (Math.abs(amountDiscrepancy) > poAmount * 0.1) {
        // More than 10% difference
        matchStatus = 'mismatch';
      }

      // Check if match already exists
      const { data: existingMatch } = await supabaseAdmin
        .from('ar_three_way_matches')
        .select('id')
        .eq('invoice_id', invoice.id)
        .single();

      const matchData: any = {
        company_id,
        po_id: invoice.po_id,
        invoice_id: invoice.id,
        customer_id: customerId,
        match_type: matchType,
        match_status: matchStatus,
        amount_discrepancy: amountDiscrepancy,
        discrepancy_notes: isPerfectMatch 
          ? null 
          : `PO: ${poAmount.toFixed(2)}, Invoice: ${invoiceAmount.toFixed(2)}${dn ? `, DN: ${dnAmount!.toFixed(2)}` : ''}`
      };

      if (dn) {
        matchData.dn_id = dn.id;
      }

      if (existingMatch) {
        // Update existing match
        const { error: updateError } = await supabaseAdmin
          .from('ar_three_way_matches')
          .update(matchData)
          .eq('id', existingMatch.id);

        if (updateError) {
          console.error('Error updating match:', updateError);
        } else {
          matchesCreated++;
        }
      } else {
        // Create new match
        const { error: insertError } = await supabaseAdmin
          .from('ar_three_way_matches')
          .insert(matchData);

        if (insertError) {
          console.error('Error creating match:', insertError);
        } else {
          matchesCreated++;
        }
      }

      // Create anomalies if there are discrepancies
      if (!isPerfectMatch) {
        // Check if anomaly already exists
        const { data: existingAnomaly } = await supabaseAdmin
          .from('ar_anomalies')
          .select('id')
          .eq('invoice_id', invoice.id)
          .eq('status', 'open')
          .single();

        const severity = Math.abs(amountDiscrepancy) > poAmount * 0.1 ? 'high' : 'medium';
        const anomalyType = dn && Math.abs(dnDiscrepancy) > 0.01 
          ? 'amount_mismatch' 
          : 'amount_mismatch';

        const anomalyData: any = {
          company_id,
          customer_id: customerId,
          po_id: invoice.po_id,
          invoice_id: invoice.id,
          anomaly_type: anomalyType,
          severity,
          status: 'open',
          description: `Amount discrepancy: PO (${poAmount.toFixed(2)}) vs Invoice (${invoiceAmount.toFixed(2)})${dn ? ` vs DN (${dnAmount!.toFixed(2)})` : ''}`,
          discrepancy_amount: amountDiscrepancy
        };

        if (dn) {
          anomalyData.dn_id = dn.id;
        }

        if (existingAnomaly) {
          // Update existing anomaly
          await supabaseAdmin
            .from('ar_anomalies')
            .update(anomalyData)
            .eq('id', existingAnomaly.id);
        } else {
          // Create new anomaly
          const { error: anomalyError } = await supabaseAdmin
            .from('ar_anomalies')
            .insert(anomalyData);

          if (!anomalyError) {
            anomaliesCreated++;
          }
        }
      }

      // Update invoice match_status
      let invoiceMatchStatus = 'unmatched';
      if (invoice.po_id && invoice.dn_id) {
        invoiceMatchStatus = 'full_matched';
      } else if (invoice.po_id) {
        invoiceMatchStatus = 'po_matched';
      } else if (invoice.dn_id) {
        invoiceMatchStatus = 'dn_matched';
      }

      await supabaseAdmin
        .from('invoices')
        .update({ match_status: invoiceMatchStatus })
        .eq('id', invoice.id);
    }

    return NextResponse.json({
      success: true,
      message: `Matching completed: ${matchesCreated} matches created/updated, ${anomaliesCreated} anomalies created`,
      matches_created: matchesCreated,
      anomalies_created: anomaliesCreated
    });

  } catch (error: any) {
    console.error('Error in A/R 3-way matching:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to run 3-way matching' },
      { status: 500 }
    );
  }
}
