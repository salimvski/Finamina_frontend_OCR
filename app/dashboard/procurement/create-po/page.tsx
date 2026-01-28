'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/lib/toast';
import { ArrowLeft, Building2, Calendar, DollarSign, Hash, Loader2, Plus, Trash2 } from 'lucide-react';

interface SupplierOption {
  id: string;
  name: string;
  vat_number: string | null;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export default function CreatePurchaseOrderPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  const [supplierId, setSupplierId] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [poDate, setPoDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [currency, setCurrency] = useState('SAR');
  const [totalAmount, setTotalAmount] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
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

    if (!userData) {
      showToast('Could not load company. Please re-login.', 'error');
      router.push('/login');
      return;
    }

    const company_id = userData.company_id;
    setCompanyId(company_id);

    // Load contacts from `customers` (Wafeq contacts mirror)
    const { data: supplierRows, error } = await supabase
      .from('customers')
      .select('id, company_name, name, vat_number, tax_registration_number, relationship')
      .eq('company_id', company_id)
      .order('company_name', { ascending: true });

    if (error) {
      showToast('Failed to load suppliers from contacts', 'error');
    } else {
      const mapped: SupplierOption[] = (supplierRows || [])
        // Only keep contacts that are marked as supplier/both
        .filter((row: any) => {
          const rel = (row.relationship || '').toLowerCase();
          return rel === 'supplier' || rel === 'both';
        })
        .map((row: any) => ({
          id: row.id,
          name: row.company_name || row.name || 'Unnamed supplier',
          vat_number: row.vat_number || row.tax_registration_number || null,
        }));
      setSuppliers(mapped);
    }

    // Auto-generate next PO number for this company
    try {
      const { data: existingPOs } = await supabase
        .from('purchase_orders')
        .select('po_number')
        .eq('company_id', company_id)
        .order('created_at', { ascending: false })
        .limit(100);

      let maxNumber = 0;
      const currentYear = new Date().getFullYear();
      const pattern = new RegExp(`PO-${currentYear}-(\\d+)`, 'i');

      (existingPOs || []).forEach((po: any) => {
        if (po.po_number) {
          const match = po.po_number.match(pattern);
          if (match) {
            const numValue = parseInt(match[1], 10);
            if (numValue > maxNumber) {
              maxNumber = numValue;
            }
          }
        }
      });

      const nextNumber = maxNumber + 1;
      const generatedNumber = `PO-${currentYear}-${String(nextNumber).padStart(3, '0')}`;
      setPoNumber(generatedNumber);
    } catch (err) {
      // Fallback: leave field empty if generation fails
      console.error('Error generating PO number', err);
    }

    setLoading(false);
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { description: '', quantity: 1, unitPrice: 0 },
    ]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    setLineItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      showToast('Missing company. Please refresh.', 'error');
      return;
    }

    if (!supplierId) {
      showToast('Please select a supplier', 'error');
      return;
    }

    if (!poNumber.trim()) {
      showToast('Please enter a PO number', 'error');
      return;
    }

    let amountToUse = totalAmount;
    if (!amountToUse && lineItems.length > 0) {
      const computed = lineItems.reduce(
        (sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0),
        0
      );
      amountToUse = computed.toFixed(2);
      setTotalAmount(amountToUse);
    }

    if (!amountToUse || isNaN(parseFloat(amountToUse))) {
      showToast('Please enter a valid total amount or add valid line items', 'error');
      return;
    }

    setSaving(true);

    try {
      // 1) Ensure we have a suppliers row that matches the selected contact
      const { data: contact, error: contactError } = await supabase
        .from('customers')
        .select(
          'id, company_name, name, email, phone, vat_number, tax_registration_number, city'
        )
        .eq('company_id', companyId)
        .eq('id', supplierId)
        .single();

      if (contactError || !contact) {
        console.error('Failed to load supplier contact:', contactError);
        showToast('Failed to load supplier contact', 'error');
        setSaving(false);
        return;
      }

      const supplierName = contact.company_name || contact.name || 'Unnamed supplier';
      const supplierVat =
        contact.vat_number || contact.tax_registration_number || null;

      // Try to find an existing supplier row by company + VAT (preferred) or name
      let supplierRowId: string | null = null;

      if (supplierVat) {
        const { data: existingByVat } = await supabase
          .from('suppliers')
          .select('id')
          .eq('company_id', companyId)
          .eq('vat_number', supplierVat)
          .maybeSingle();

        if (existingByVat) {
          supplierRowId = existingByVat.id;
        }
      }

      if (!supplierRowId) {
        const { data: existingByName } = await supabase
          .from('suppliers')
          .select('id')
          .eq('company_id', companyId)
          .eq('name', supplierName)
          .maybeSingle();

        if (existingByName) {
          supplierRowId = existingByName.id;
        }
      }

      // If no supplier row exists yet, create one now
      if (!supplierRowId) {
        const { data: newSupplier, error: supplierInsertError } = await supabase
          .from('suppliers')
          .insert({
            company_id: companyId,
            name: supplierName,
            email: contact.email || null,
            phone: contact.phone || null,
            vat_number: supplierVat,
            address: contact.city || null,
          })
          .select('id')
          .single();

        if (supplierInsertError || !newSupplier) {
          console.error('Failed to create supplier row:', supplierInsertError);
          showToast('Failed to create supplier for this PO', 'error');
          setSaving(false);
          return;
        }

        supplierRowId = newSupplier.id;
      }

      // 2) Insert PO in our own database
      const { data: inserted, error: insertError } = await supabase
        .from('purchase_orders')
        .insert({
          company_id: companyId,
          supplier_id: supplierRowId,
          po_number: poNumber.trim(),
          po_date: poDate,
          currency,
          // DB schema uses `amount` (not `total_amount`)
          amount: parseFloat(amountToUse),
          status: 'pending',
          context: 'ap',
        })
        .select('id')
        .single();

      if (insertError || !inserted) {
        console.error(
          'Failed to save purchase order:',
          insertError?.message || insertError
        );
        showToast('Failed to save purchase order', 'error');
        setSaving(false);
        return;
      }

      // 3) Optionally store simple line items for local 3-way matching details
      if (lineItems.length > 0) {
        try {
          const itemsToInsert = lineItems
            .filter((item) => item.description && item.quantity && item.unitPrice)
            .map((item) => ({
              po_id: inserted.id,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unitPrice,
              total_amount: (item.quantity || 0) * (item.unitPrice || 0),
            }));

          if (itemsToInsert.length > 0) {
            const { error: liError } = await supabase
              .from('po_line_items')
              .insert(itemsToInsert);

            if (liError) {
              console.error('Failed to save PO line items', liError);
              // Non-blocking; PO itself is still created
            }
          }
        } catch (err) {
          console.error('Failed to save PO line items', err);
          // Non-blocking; PO itself is still created
        }
      }

      showToast('Purchase order created', 'success');
      router.push('/dashboard/procurement');
    } catch (err: any) {
      console.error('Error creating PO:', err?.message || err);
      showToast('Unexpected error creating purchase order', 'error');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            href="/dashboard/procurement"
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create Purchase Order</h1>
            <p className="text-sm text-gray-600">
              Record a new PO to a supplier for A/P 3-way matching.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6"
        >
          {/* Supplier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                required
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.vat_number ? ` (${s.vat_number})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* PO Number & Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PO Number
              </label>
              <div className="relative">
                <Hash className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="PO-2026-001"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PO Date
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={poDate}
                  onChange={(e) => setPoDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>
          </div>

          {/* Amount & Currency */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Amount (incl. VAT)
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder={lineItems.length > 0 ? 'Auto-calculated from items' : '21677.50'}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Optional: if left blank, we&apos;ll sum the line items.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="SAR">SAR - Saudi Riyal</option>
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
              </select>
            </div>
          </div>

          {/* Line items (optional, but recommended) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Line Items (optional, used to match products)
              </label>
              <button
                type="button"
                onClick={addLineItem}
                className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-3 h-3" />
                Add Item
              </button>
            </div>
            {lineItems.length === 0 && (
              <p className="text-xs text-gray-500">
                You can keep it simple with just total amount, or add items for more realistic 3‑way matching.
              </p>
            )}
            <div className="mt-3 space-y-3">
              {lineItems.map((item, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-3 grid grid-cols-12 gap-3"
                >
                  <div className="col-span-12 md:col-span-6">
                    <label className="block text-xs text-gray-600 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        updateLineItem(index, 'description', e.target.value)
                      }
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      placeholder="e.g. Dell XPS 15 Laptop"
                    />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className="block text-xs text-gray-600 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) =>
                        updateLineItem(
                          index,
                          'quantity',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className="block text-xs text-gray-600 mb-1">
                      Unit Price
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) =>
                        updateLineItem(
                          index,
                          'unitPrice',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div className="col-span-12 md:col-span-12 flex justify-between items-center text-xs text-gray-500">
                    <span>
                      Line total:{' '}
                      {(item.quantity || 0 * item.unitPrice || 0).toFixed
                        ? (item.quantity * item.unitPrice).toFixed(2)
                        : '0.00'}{' '}
                      {currency}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      className="text-red-600 hover:bg-red-50 rounded p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push('/dashboard/procurement')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-semibold flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{saving ? 'Creating...' : 'Create PO'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

