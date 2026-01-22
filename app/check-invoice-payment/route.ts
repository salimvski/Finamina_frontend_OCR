import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getErrorMessage } from '@/lib/error-handling';

/**
 * Check if a customer invoice has a matching payment in bank_transactions (Lean),
 * and when found: mark invoice as paid, link the transaction, and set is_reconciled.
 */
export async function POST(request: NextRequest) {
  try {
    const { invoice_id } = await request.json();

    if (!invoice_id) {
      return NextResponse.json({ success: false, error: 'invoice_id is required' }, { status: 400 });
    }

    const { data: invoice, error: invErr } = await supabaseAdmin
      .from('invoices')
      .select('id, company_id, amount, invoice_date, status, paid_at')
      .eq('id', invoice_id)
      .maybeSingle();

    if (invErr || !invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.status === 'paid' && invoice.paid_at) {
      return NextResponse.json({
        success: true,
        matched: true,
        alreadyPaid: true,
        message: 'Invoice is already marked as paid.'
      });
    }

    const invAmount = parseFloat(String(invoice.amount || 0));
    const invDate = invoice.invoice_date ? new Date(invoice.invoice_date) : null;
    if (!invDate || isNaN(invDate.getTime())) {
      return NextResponse.json({ success: false, error: 'Invoice has no valid date' }, { status: 400 });
    }

    const { data: accounts } = await supabaseAdmin
      .from('bank_accounts')
      .select('id')
      .eq('company_id', invoice.company_id);

    const accountIds = (accounts || []).map((a: { id: string }) => a.id);
    if (accountIds.length === 0) {
      return NextResponse.json({
        success: true,
        matched: false,
        message: 'No bank accounts linked to this company.'
      });
    }

    const windowStart = new Date(invDate);
    windowStart.setDate(windowStart.getDate() - 60);
    const windowEnd = new Date();
    if (invDate > windowEnd) windowEnd.setTime(invDate.getTime() + 90 * 24 * 60 * 60 * 1000);

    const { data: txs, error: txErr } = await supabaseAdmin
      .from('bank_transactions')
      .select('id, amount, transaction_date, credit_debit_indicator, description, lean_transaction_id')
      .in('bank_account_id', accountIds)
      .is('matched_invoice_id', null)
      .gte('transaction_date', windowStart.toISOString().split('T')[0])
      .lte('transaction_date', windowEnd.toISOString().split('T')[0])
      .order('transaction_date', { ascending: false });

    if (txErr) {
      return NextResponse.json({ success: false, error: getErrorMessage(txErr) }, { status: 500 });
    }

    // Tolerance: 1% of invoice amount or minimum 1.00 (whichever is larger)
    // This handles rounding differences and small fees
    const tolerance = Math.max(invAmount * 0.01, 1.00);
    const isCredit = (v: string) => /^credit$/i.test(String(v || '').trim());
    
    // Track potential matches for debugging
    const potentialMatches: Array<{
      id: string;
      amount: number;
      amountDiff: number;
      date: string;
      daysDiff: number;
      description: string;
    }> = [];
    
    let best: { id: string; amount: string; transaction_date: string; description?: string; [k: string]: unknown } | null = null;
    let bestScore = Infinity; // Lower is better (combination of amount and date difference)

    for (const tx of txs || []) {
      const txAmount = parseFloat(String(tx.amount || 0));
      const amountDiff = Math.abs(txAmount - invAmount);
      
      // Skip if amount difference is too large
      if (amountDiff > tolerance) {
        potentialMatches.push({
          id: tx.id,
          amount: txAmount,
          amountDiff,
          date: tx.transaction_date,
          daysDiff: Math.abs(new Date(tx.transaction_date).getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24),
          description: tx.description || ''
        });
        continue;
      }
      
      // Only match credit transactions (money coming in)
      if (!isCredit(tx.credit_debit_indicator)) continue;

      const txDate = new Date(tx.transaction_date);
      const daysDiff = Math.abs(txDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Score: combination of amount difference (weighted) and days difference
      // Amount difference is normalized to percentage, days difference is in days
      const amountScore = (amountDiff / invAmount) * 100; // Percentage difference
      const dateScore = daysDiff; // Days difference
      const totalScore = amountScore * 0.3 + dateScore * 0.7; // Prefer closer dates
      
      if (totalScore < bestScore) {
        bestScore = totalScore;
        best = { ...tx, description: tx.description || '' };
      }
    }

    if (!best) {
      // Provide helpful feedback about why no match was found
      const creditTxs = (txs || []).filter(tx => isCredit(tx.credit_debit_indicator));
      const amountMatches = creditTxs.filter(tx => {
        const txAmount = parseFloat(String(tx.amount || 0));
        return Math.abs(txAmount - invAmount) <= tolerance;
      });
      
      let message = 'No matching credit transaction found.';
      if (creditTxs.length === 0) {
        message += ' No credit transactions found in the date range.';
      } else if (amountMatches.length === 0) {
        message += ` Found ${creditTxs.length} credit transaction(s), but none match the invoice amount (${invAmount.toFixed(2)} ± ${tolerance.toFixed(2)}).`;
      } else {
        message += ` Found ${amountMatches.length} transaction(s) with matching amount, but date matching failed.`;
      }
      
      return NextResponse.json({
        success: true,
        matched: false,
        message,
        debug: {
          invoiceAmount: invAmount,
          tolerance,
          dateRange: {
            start: windowStart.toISOString().split('T')[0],
            end: windowEnd.toISOString().split('T')[0]
          },
          totalTransactions: txs?.length || 0,
          creditTransactions: creditTxs.length,
          amountMatches: amountMatches.length,
          potentialMatches: potentialMatches.slice(0, 5) // Top 5 closest matches for debugging
        }
      });
    }

    const paidAt = best.transaction_date ? new Date(best.transaction_date).toISOString() : new Date().toISOString();

    const [invUp, txUp] = await Promise.all([
      supabaseAdmin.from('invoices').update({ status: 'paid', paid_at: paidAt }).eq('id', invoice_id),
      supabaseAdmin.from('bank_transactions').update({ matched_invoice_id: invoice_id, is_reconciled: true }).eq('id', best.id)
    ]);

    if (invUp.error) {
      return NextResponse.json({ success: false, error: getErrorMessage(invUp.error) }, { status: 500 });
    }
    if (txUp.error) {
      return NextResponse.json({ success: false, error: getErrorMessage(txUp.error) }, { status: 500 });
    }

    const amountDiff = Math.abs(parseFloat(String(best.amount || 0)) - invAmount);
    const daysDiff = Math.abs(new Date(best.transaction_date).getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24);
    
    return NextResponse.json({
      success: true,
      matched: true,
      updated: true,
      transaction: {
        id: best.id,
        amount: best.amount,
        transaction_date: best.transaction_date,
        description: best.description,
        lean_transaction_id: best.lean_transaction_id
      },
      paid_at: paidAt,
      matchDetails: {
        amountDifference: amountDiff.toFixed(2),
        daysDifference: Math.round(daysDiff),
        matchScore: bestScore.toFixed(2)
      },
      message: `Invoice marked as paid. Matched with transaction on ${new Date(best.transaction_date).toLocaleDateString()} (${Math.round(daysDiff)} days ${daysDiff > 0 ? 'after' : 'before'} invoice date).`
    });
  } catch (e: any) {
    console.error('check-invoice-payment:', e);
    return NextResponse.json({ success: false, error: getErrorMessage(e) }, { status: 500 });
  }
}
