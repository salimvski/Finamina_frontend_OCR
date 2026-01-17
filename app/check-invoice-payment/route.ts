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

    const tolerance = 0.02;
    const isCredit = (v: string) => /^credit$/i.test(String(v || '').trim());
    let best: { id: string; amount: string; transaction_date: string; [k: string]: unknown } | null = null;
    let bestDiff = Infinity;

    for (const tx of txs || []) {
      const txAmount = parseFloat(String(tx.amount || 0));
      if (Math.abs(txAmount - invAmount) > tolerance) continue;
      if (!isCredit(tx.credit_debit_indicator)) continue;

      const d = new Date(tx.transaction_date);
      const diff = Math.abs(d.getTime() - invDate.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        best = tx;
      }
    }

    if (!best) {
      return NextResponse.json({
        success: true,
        matched: false,
        message: 'No matching credit transaction found for this invoice amount and date range.'
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
      message: 'Invoice marked as paid and payment linked to the matching transaction.'
    });
  } catch (e: any) {
    console.error('check-invoice-payment:', e);
    return NextResponse.json({ success: false, error: getErrorMessage(e) }, { status: 500 });
  }
}
