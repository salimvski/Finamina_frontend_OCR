'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { getErrorMessage } from '@/lib/error-handling';
import {
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  Hash,
  Loader2,
  Trash2,
  Save,
  AlertTriangle,
  Plus,
} from 'lucide-react';

interface SupplierOption {
  id: string;
  name: string;
}

interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
}

interface PageParams {
  id: string;
}

export default function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  const [supplierId, setSupplierId] = useState<string>('');
  const [poNumber, setPoNumber] = useState<string>('');
  const [poDate, setPoDate] = useState<string>('');
  const [currency, setCurrency] = useState<string>('SAR');
  const [amount, setAmount] = useState<string>('');
  const [status, setStatus] = useState<string>('pending');

  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadInitial = async () => {
    setLoading(true);
    try {
      const { data: userResult } = await supabase.auth.getUser();
      const user = userResult.user;
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('company_id')
        .eq('auth_user_id', user.id)
        .single();

      if (userError || !userData) {
        showToast('Unable to load company', 'error');
        router.push('/dashboard');
        return;
      }

      const company_id = userData.company_id as string;
      setCompanyId(company_id);

      // Load suppliers list
      const { data: supplierRows, error: supplierError } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('company_id', company_id)
        .order('name', { ascending: true });

      if (supplierError) {
        console.error('Error loading suppliers for PO detail:', supplierError);
      } else {
        setSuppliers(
          (supplierRows || []).map((s: any) => ({
            id: s.id,
            name: s.name || 'Unnamed supplier',
          })),
        );
      }

      // Load PO
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', id)
        .eq('company_id', company_id)
        .single();

      if (poError || !po) {
        showToast('Purchase order not found', 'error');
        router.push('/dashboard/procurement');
        return;
      }

      setSupplierId(po.supplier_id || '');
      setPoNumber(po.po_number || '');
      setPoDate(po.po_date || new Date().toISOString().split('T')[0]);
      setCurrency(po.currency || 'SAR');
      const numericAmount =
        typeof po.amount === 'number'
          ? po.amount
          : parseFloat(po.amount || '0') || 0;
      setAmount(numericAmount.toString());
      setStatus(po.status || 'pending');

      // Load PO line items
      const { data: items, error: itemsError } = await supabase
        .from('po_line_items')
        .select('id, description, quantity, unit_price')
        .eq('po_id', id)
        .order('created_at', { ascending: true });

      if (itemsError) {
        console.error('Error loading PO line items:', itemsError);
        setLineItems([]);
      } else {
        setLineItems(
          (items || []).map((it: any) => ({
            id: it.id,
            description: it.description || '',
            quantity: Number(it.quantity) || 0,
            unit_price: Number(it.unit_price) || 0,
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      { description: '', quantity: 1, unit_price: 0 },
    ]);
  };

  const updateLineItem = (
    index: number,
    field: keyof LineItem,
    value: any,
  ) => {
    setLineItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      showToast('Missing company', 'error');
      return;
    }
    if (!poNumber.trim()) {
      showToast('PO number is required', 'error');
      return;
    }
    if (!supplierId) {
      showToast('Supplier is required', 'error');
      return;
    }
    const numericAmount = parseFloat(amount || '0');
    if (isNaN(numericAmount) || numericAmount < 0) {
      showToast('Amount must be a valid number', 'error');
      return;
    }

    setSaving(true);
    try {
      // Update PO
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({
          supplier_id: supplierId,
          po_number: poNumber.trim(),
          po_date: poDate,
          currency,
          amount: numericAmount,
          status,
        })
        .eq('id', id)
        .eq('company_id', companyId);

      if (updateError) {
        console.error('Error updating PO:', updateError);
        showToast('Failed to update purchase order', 'error');
        setSaving(false);
        return;
      }

      // Replace line items
      await supabase.from('po_line_items').delete().eq('po_id', id);

      const itemsToInsert = lineItems
        .filter(li => li.description && li.quantity && li.unit_price)
        .map(li => ({
          po_id: id,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          total_amount: (li.quantity || 0) * (li.unit_price || 0),
        }));

      if (itemsToInsert.length > 0) {
        const { error: liError } = await supabase
          .from('po_line_items')
          .insert(itemsToInsert);
        if (liError) {
          console.error(
            'Error saving PO line items:',
            liError,
            getErrorMessage(liError),
          );
          showToast(
            `PO updated, but some line items could not be saved: ${getErrorMessage(
              liError,
            )}`,
            'error',
          );
        }
      }

      showToast('Purchase order updated', 'success');
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!companyId) return;
    const confirmed = window.confirm(
      'Delete this purchase order? This cannot be undone.',
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await supabase.from('po_line_items').delete().eq('po_id', id);
      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId);

      if (error) {
        console.error('Error deleting PO:', error);
        showToast(
          'Failed to delete PO (it may be linked to DNs or matches)',
          'error',
        );
        setDeleting(false);
        return;
      }

      showToast('Purchase order deleted', 'success');
      router.push('/dashboard/procurement?tab=pos');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading purchase order…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/procurement?tab=pos"
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Purchase Order {poNumber || ''}
              </h1>
              <p className="text-sm text-gray-600">
                View and edit supplier purchase order details.
              </p>
            </div>
          </div>
          {status !== 'pending' && (
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                status === 'delivered'
                  ? 'bg-green-100 text-green-800'
                  : status === 'partial_delivered'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              {status.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <form
          onSubmit={handleSave}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6"
        >
          {/* Supplier & Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supplier
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  required
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="pending">Pending</option>
                <option value="delivered">Delivered</option>
                <option value="partial_delivered">Partial delivered</option>
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
                  onChange={e => setPoNumber(e.target.value)}
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
                  onChange={e => setPoDate(e.target.value)}
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
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Currency
              </label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="SAR">SAR - Saudi Riyal</option>
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
              </select>
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Line Items
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
                Optional, but recommended for more detailed matching.
              </p>
            )}
            <div className="mt-3 space-y-3">
              {lineItems.map((item, index) => (
                <div
                  key={item.id || index}
                  className="border border-gray-200 rounded-lg p-3 grid grid-cols-12 gap-3"
                >
                  <div className="col-span-12 md:col-span-6">
                    <label className="block text-xs text-gray-600 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={e =>
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
                      onChange={e =>
                        updateLineItem(
                          index,
                          'quantity',
                          parseFloat(e.target.value) || 0,
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
                      value={item.unit_price}
                      onChange={e =>
                        updateLineItem(
                          index,
                          'unit_price',
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div className="col-span-12 flex justify-between items-center text-xs text-gray-500">
                    <span>
                      Line total:{' '}
                      {(
                        (item.quantity || 0) * (item.unit_price || 0)
                      ).toFixed(2)}{' '}
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

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-60"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete PO
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

