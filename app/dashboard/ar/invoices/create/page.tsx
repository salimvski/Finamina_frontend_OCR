'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { ArrowLeft, Lock, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface LineItem {
  item_name: string;
  description: string;
  quantity: number;
  price: number;
  line_amount: number;
}

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function ARCreateInvoiceFromPOPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const poId = searchParams.get('po_id') || searchParams.get('customer_po_id');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [poNumber, setPoNumber] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [total, setTotal] = useState(0); // subtotal (sum of line amounts)
  const VAT_RATE = 0.15; // 15%
  const [error, setError] = useState('');

  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');

  const [customerId, setCustomerId] = useState('');
  const [poReference, setPoReference] = useState('');

  useEffect(() => {
    if (!poId) {
      showToast('No PO selected. Please choose a PO from Pending POs.', 'error');
      router.replace('/dashboard/invoices?tab=pending-pos');
      return;
    }
    loadPOAndCustomer();
  }, [poId]);

  const loadPOAndCustomer = async () => {
    if (!poId) return;
    setLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      const { data: userData } = await supabase
        .from('users')
        .select('company_id')
        .eq('auth_user_id', user.id)
        .single();
      if (!userData?.company_id) {
        setError('Company not found');
        setLoading(false);
        return;
      }
      setCompanyId(userData.company_id);

      const { data: po, error: poError } = await supabase
        .from('customer_purchase_orders')
        .select('*')
        .eq('id', poId)
        .eq('company_id', userData.company_id)
        .single();

      if (poError || !po) {
        setError('PO not found');
        showToast('Purchase order not found', 'error');
        setLoading(false);
        return;
      }

      if (po.status === 'invoiced') {
        showToast('This PO has already been invoiced', 'error');
        router.replace('/dashboard/invoices?tab=pending-pos');
        return;
      }

      const { data: existingInv } = await supabase
        .from('invoices')
        .select('id')
        .eq('company_id', userData.company_id)
        .eq('customer_po_id', poId)
        .maybeSingle();

      if (existingInv) {
        showToast('This PO has already been invoiced', 'error');
        router.replace('/dashboard/invoices?tab=pending-pos');
        return;
      }

      // Resolve customer: by po.customer_id first, then by name from extraction_data if needed
      let customer: { id: string; name?: string; company_name?: string; payment_terms_days?: number; payment_terms?: unknown } | null = null;
      const extractionName = (po.extraction_data?.customer_name || po.extraction_data?.buyer_name || po.extraction_data?.company_name || '').trim();

      if (po.customer_id) {
        const res = await supabase
          .from('customers')
          .select('id, name, company_name, payment_terms_days, payment_terms')
          .eq('id', po.customer_id)
          .maybeSingle();
        customer = res.data;
      }

      // If no customer by id, try to find by name from extraction_data (OCR)
      if (!customer?.id && extractionName) {
        const { data: customersByName } = await supabase
          .from('customers')
          .select('id, name, company_name, payment_terms_days, payment_terms')
          .eq('company_id', userData.company_id)
          .is('deleted_at', null);
        const match = (customersByName || []).find(
          (c: any) =>
            (c.company_name || '').trim().toLowerCase() === extractionName.toLowerCase() ||
            (c.name || '').trim().toLowerCase() === extractionName.toLowerCase()
        );
        if (match) customer = match;
      }

      const days = customer?.payment_terms_days ?? (typeof customer?.payment_terms === 'number' ? customer.payment_terms : 30);
      const today = new Date();
      const defaultDue = addDays(today, typeof days === 'number' ? days : 30);

      const resolvedCustomerId = customer?.id || po.customer_id;
      const displayName = customer?.company_name || customer?.name || extractionName || 'Unknown';

      setCustomerId(resolvedCustomerId || '');
      setCustomerName(displayName);
      setCurrency(po.currency || 'SAR');
      setPoNumber(po.po_number || '');
      setPoReference(po.po_number || po.reference || `CPO-${new Date().getFullYear()}-${po.po_number || po.id?.slice(0, 8)}`);
      setInvoiceDate(today.toISOString().split('T')[0]);
      setDueDate(defaultDue);

      const items: LineItem[] = [];
      const rawItems = po.extraction_data?.lineItems || po.extraction_data?.line_items;
      if (Array.isArray(rawItems) && rawItems.length > 0) {
        rawItems.forEach((item: any) => {
          const qty = Number(item.quantity ?? 1);
          const price = Number(item.unit_price ?? item.price ?? item.amount ?? 0);
          items.push({
            item_name: item.item_name || item.description || 'Item',
            description: item.description || item.item_name || '',
            quantity: qty,
            price,
            line_amount: qty * price,
          });
        });
      } else {
        const amt = parseFloat(po.amount || '0');
        items.push({
          item_name: `Products from ${po.po_number || 'PO'}`,
          description: `Invoice for Customer PO ${po.po_number || ''}`,
          quantity: 1,
          price: amt,
          line_amount: amt,
        });
      }
      setLineItems(items);
      setTotal(items.reduce((sum, i) => sum + i.line_amount, 0));

      const invNum = await generateInvoiceNumber(userData.company_id);
      setInvoiceNumber(invNum);
    } catch (e: any) {
      setError(e?.message || 'Failed to load PO');
      showToast('Failed to load purchase order', 'error');
    } finally {
      setLoading(false);
    }
  };

  const generateInvoiceNumber = async (companyId: string): Promise<string> => {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const { data } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('company_id', companyId)
      .like('invoice_number', `${prefix}%`)
      .order('invoice_number', { ascending: false })
      .limit(100);

    let maxSeq = 0;
    (data || []).forEach((inv: any) => {
      const m = (inv.invoice_number || '').match(new RegExp(`^INV-${year}-(\\d+)$`, 'i'));
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    });
    return `${prefix}${(maxSeq + 1).toString().padStart(4, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poId || !companyId || !customerId) return;
    const invDate = invoiceDate;
    const due = dueDate;
    if (!invDate || !due) {
      showToast('Invoice date and due date are required', 'error');
      return;
    }
    if (new Date(due) < new Date(invDate)) {
      showToast('Due date must be on or after invoice date', 'error');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { data: existingInv } = await supabase
        .from('invoices')
        .select('id')
        .eq('company_id', companyId)
        .eq('customer_po_id', poId)
        .maybeSingle();

      if (existingInv) {
        showToast('This PO has already been invoiced', 'error');
        setSubmitting(false);
        return;
      }

      const subtotal = total;
      const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
      const totalWithVat = subtotal + vatAmount;

      const { data: saved, error: insertErr } = await supabase
        .from('invoices')
        .insert({
          company_id: companyId,
          customer_id: customerId,
          customer_po_id: poId,
          invoice_number: invoiceNumber,
          invoice_date: invDate,
          due_date: due,
          currency,
          amount: totalWithVat,
          tax_amount: vatAmount,
          status: 'pending',
          extraction_data: {
            lineItems: lineItems.map((li) => ({
              item_name: li.item_name,
              description: li.description,
              quantity: li.quantity,
              unit_price: li.price,
              amount: li.line_amount,
            })),
            customer_po_reference: poNumber,
            reference: poReference,
          },
        })
        .select()
        .single();

      if (insertErr) {
        throw insertErr;
      }

      await supabase
        .from('customer_purchase_orders')
        .update({ status: 'invoiced' })
        .eq('id', poId);

      showToast('Invoice created successfully', 'success');
      router.push(`/dashboard/invoices?id=${saved.id}`);
    } catch (e: any) {
      setError(e?.message || 'Failed to create invoice');
      showToast('Failed to create invoice. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!poId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Redirecting...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading PO and customer...</p>
        </div>
      </div>
    );
  }

  if (error && !invoiceNumber) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-lg mx-auto bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-red-600 mb-4">{error}</p>
          <Link
            href="/dashboard/invoices?tab=pending-pos"
            className="inline-flex items-center gap-2 text-blue-600 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Pending POs
          </Link>
        </div>
      </div>
    );
  }

  const lockedClass = 'bg-slate-100 text-slate-500 cursor-not-allowed pointer-events-none';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/dashboard/invoices?tab=pending-pos"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" /> Cancel
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">Tax Invoice</h1>
            <p className="text-sm text-gray-500 mt-1">Create invoice from PO — most fields are locked</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer <Lock className="inline w-3.5 h-3.5 text-slate-400 ml-1" />
                </label>
                <div className={`px-3 py-2 border border-gray-200 rounded-lg ${lockedClass}`}>
                  {customerName}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Number <Lock className="inline w-3.5 h-3.5 text-slate-400 ml-1" />
                </label>
                <div className={`px-3 py-2 border border-gray-200 rounded-lg ${lockedClass}`}>
                  {invoiceNumber}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Currency <Lock className="inline w-3.5 h-3.5 text-slate-400 ml-1" />
                </label>
                <div className={`px-3 py-2 border border-gray-200 rounded-lg ${lockedClass}`}>
                  {currency}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">From contact payment terms, or 30 days by default.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer PO Reference <Lock className="inline w-3.5 h-3.5 text-slate-400 ml-1" />
                </label>
                <div className={`px-3 py-2 border border-gray-200 rounded-lg ${lockedClass}`}>
                  {poNumber || poReference}
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Line Items <Lock className="inline w-4 h-4 text-slate-400 ml-1" />
              </h2>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Item Name</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Description</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-700">Qty</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-700">Price</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-700">Line Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lineItems.map((item, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-gray-900">{item.item_name}</td>
                        <td className="px-3 py-2 text-gray-600">{item.description}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">{item.price.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-medium">{item.line_amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-56 text-right space-y-1">
                {(() => {
                  const subtotal = total;
                  const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
                  const totalWithVat = subtotal + vatAmount;
                  return (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Subtotal</span>
                        <span className="font-medium text-gray-900">{currency} {subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">VAT (15%)</span>
                        <span className="font-medium text-gray-900">{currency} {vatAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2 mt-1">
                        <span>Total</span>
                        <span>{currency} {totalWithVat.toFixed(2)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Invoice'
                )}
              </button>
              <Link
                href="/dashboard/invoices?tab=pending-pos"
                className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ARCreateInvoiceFromPOPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <ARCreateInvoiceFromPOPageContent />
    </Suspense>
  );
}
