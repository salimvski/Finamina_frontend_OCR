'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Save, Loader2, Plus, Trash2, X, Package } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/lib/toast';
import { safeApiCall } from '@/lib/error-handling';

interface LineItem {
  item_name: string;
  description: string;
  quantity_ordered: number;
  quantity_delivered: number;
  unit_price: number;
  unit_of_measure?: string;
}

function CreateDeliveryNotePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string>('');

  const [purchaseOrders, setPurchaseOrders] = useState<Array<{ id: string; po_number: string; customer_id: string }>>([]);
  const [invoices, setInvoices] = useState<Array<{ id: string; invoice_number: string; customer_id: string; po_id: string | null }>>([]);
  const [selectedPO, setSelectedPO] = useState<string>('');
  const [selectedInvoice, setSelectedInvoice] = useState<string>('');

  const [formData, setFormData] = useState({
    dn_number: '',
    delivery_date: new Date().toISOString().split('T')[0],
    received_by: '',
    notes: ''
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [poLineItems, setPoLineItems] = useState<Array<{ description: string; quantity: string; unit_price: string }>>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Auto-select PO and Invoice from URL parameters
    const poIdFromUrl = searchParams.get('po_id');
    const invoiceIdFromUrl = searchParams.get('invoice_id');
    
    if (poIdFromUrl && purchaseOrders.length > 0) {
      setSelectedPO(poIdFromUrl);
      handlePOSelection(poIdFromUrl).then(() => {
        // After PO is loaded, select invoice if provided
        if (invoiceIdFromUrl) {
          setSelectedInvoice(invoiceIdFromUrl);
        }
      });
    }
  }, [searchParams, purchaseOrders]);

  const loadData = async () => {
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

    if (userData) {
      setCompanyId(userData.company_id);
      await Promise.all([
        loadPurchaseOrders(userData.company_id),
        generateDNNumber(userData.company_id)
      ]);
    }

    setLoading(false);
  };

  const generateDNNumber = async (company_id: string) => {
    try {
      const { data: existingDNs } = await supabase
        .from('delivery_notes')
        .select('dn_number')
        .eq('company_id', company_id)
        .order('created_at', { ascending: false })
        .limit(100);

      let maxNumber = 0;
      const currentYear = new Date().getFullYear();
      const pattern = new RegExp(`DN-${currentYear}-(\\d+)`, 'i');

      if (existingDNs) {
        existingDNs.forEach((dn: any) => {
          if (dn.dn_number) {
            const match = dn.dn_number.match(pattern);
            if (match) {
              const numValue = parseInt(match[1], 10);
              if (numValue > maxNumber) {
                maxNumber = numValue;
              }
            }
          }
        });
      }

      const nextNumber = maxNumber + 1;
      const generatedNumber = `DN-${currentYear}-${String(nextNumber).padStart(3, '0')}`;
      setFormData(prev => ({ ...prev, dn_number: generatedNumber }));
    } catch (error) {
      console.error('Error generating DN number:', error);
    }
  };

  const loadPurchaseOrders = async (company_id: string) => {
    try {
      // Load A/R POs: those with customer_id set (context='ar' may not be set on all)
      const { data: poData, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, customer_id')
        .eq('company_id', company_id)
        .not('customer_id', 'is', null)
        .order('po_date', { ascending: false });

      if (error) throw error;
      setPurchaseOrders(poData || []);
    } catch (error) {
      console.error('Error loading purchase orders:', error);
      showToast('Failed to load purchase orders', 'error');
    }
  };

  const handlePOSelection = async (poId: string) => {
    if (!poId) {
      setSelectedPO('');
      setPoLineItems([]);
      setLineItems([]);
      setInvoices([]);
      setSelectedInvoice('');
      return;
    }

    setSelectedPO(poId);
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po) return;

    try {
      // Load PO line items
      const { data: items, error } = await supabase
        .from('po_line_items')
        .select('description, quantity, unit_price')
        .eq('po_id', poId);

      if (error) throw error;

      setPoLineItems(items || []);

      // Prefill line items with PO data
      const prefilledItems: LineItem[] = (items || []).map((item, index) => ({
        item_name: `Item ${index + 1}`,
        description: item.description || '',
        quantity_ordered: parseFloat(item.quantity || '0'),
        quantity_delivered: parseFloat(item.quantity || '0'), // Default to full delivery
        unit_price: parseFloat(item.unit_price || '0'),
        unit_of_measure: 'pcs'
      }));

      setLineItems(prefilledItems);

      // Load invoices linked to this PO
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('id, invoice_number, customer_id, po_id')
        .eq('company_id', companyId)
        .eq('po_id', poId)
        .order('invoice_date', { ascending: false });

      if (!invoiceError && invoiceData) {
        setInvoices(invoiceData);
        const invoiceIdFromUrl = searchParams.get('invoice_id');
        if (invoiceIdFromUrl && invoiceData.find((inv: any) => inv.id === invoiceIdFromUrl)) {
          setSelectedInvoice(invoiceIdFromUrl);
        } else if (invoiceData.length === 1) {
          setSelectedInvoice(invoiceData[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading PO details:', error);
      showToast('Failed to load PO details', 'error');
    }
  };

  const handleInvoiceSelection = (invoiceId: string) => {
    setSelectedInvoice(invoiceId);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, {
      item_name: '',
      description: '',
      quantity_ordered: 0,
      quantity_delivered: 0,
      unit_price: 0,
      unit_of_measure: 'pcs'
    }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-detect partial delivery
    if (field === 'quantity_delivered') {
      const ordered = updated[index].quantity_ordered;
      const delivered = parseFloat(value) || 0;
      if (delivered < ordered) {
        showToast(`Partial delivery detected: ${delivered} of ${ordered}`, 'info', 3000);
      }
    }
    
    setLineItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      showToast('Company ID is missing', 'error');
      return;
    }

    if (!selectedPO) {
      showToast('Please select a Purchase Order', 'error');
      return;
    }

    if (!formData.dn_number) {
      showToast('Please enter a Delivery Note number', 'error');
      return;
    }

    if (!formData.delivery_date) {
      showToast('Please select a delivery date', 'error');
      return;
    }

    setSaving(true);

    const result = await safeApiCall(
      async () => {
        const po = purchaseOrders.find(p => p.id === selectedPO);
        if (!po) throw new Error('Purchase order not found');

        const response = await fetch('/create-delivery-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: companyId,
            customer_id: po.customer_id,
            po_id: selectedPO,
            invoice_id: selectedInvoice || null,
            dn_number: formData.dn_number.trim(),
            delivery_date: formData.delivery_date,
            received_by: formData.received_by || null,
            context: 'ar',
            line_items: lineItems.map(item => ({
              description: item.description,
              quantity: item.quantity_delivered,
              unit_price: item.unit_price,
              item_number: item.item_name,
              unit_of_measure: item.unit_of_measure || 'pcs'
            }))
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: `Server error ${response.status}` }));
          throw new Error(errorData.error || `Failed with status ${response.status}`);
        }

        return await response.json();
      },
      { onError: (error) => showToast(error, 'error') }
    );

    if (result.success) {
      showToast('Delivery Note created successfully!', 'success');
      router.push('/dashboard/invoices');
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/invoices" className="p-2 hover:bg-gray-100 rounded-lg transition">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Create Delivery Note</h1>
                <p className="text-sm text-gray-600 mt-1">Link to PO and Invoice for 3-way matching</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="space-y-6">
            {/* PO Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Purchase Order <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedPO}
                onChange={(e) => handlePOSelection(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select a Purchase Order</option>
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.po_number}
                  </option>
                ))}
              </select>
            </div>

            {/* Invoice Selection */}
            {selectedPO && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Linked Invoice (Optional)
                </label>
                <select
                  value={selectedInvoice}
                  onChange={(e) => handleInvoiceSelection(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">No invoice (standalone DN)</option>
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select the invoice linked to this PO for 3-way matching
                </p>
              </div>
            )}

            {/* DN Number - auto-generated, read-only in A/R */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Delivery Note Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.dn_number}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 cursor-not-allowed"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Auto-generated (read-only)</p>
            </div>

            {/* Delivery Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Delivery Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.delivery_date}
                onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            {/* Received By */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Received By (Optional)
              </label>
              <input
                type="text"
                value={formData.received_by}
                onChange={(e) => setFormData({ ...formData, received_by: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Name of person who received"
              />
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Line Items <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>

              {lineItems.length === 0 && (
                <p className="text-sm text-gray-500 mb-4">
                  Select a Purchase Order to auto-load line items, or add items manually
                </p>
              )}

              <div className="space-y-4">
                {lineItems.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-12 md:col-span-5">
                        <label className="block text-xs text-gray-600 mb-1">Description</label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                          placeholder="Item description"
                          required
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <label className="block text-xs text-gray-600 mb-1">Qty Ordered</label>
                        <input
                          type="number"
                          value={item.quantity_ordered}
                          onChange={(e) => updateLineItem(index, 'quantity_ordered', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                          min="0"
                          step="0.01"
                          required
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <label className="block text-xs text-gray-600 mb-1">Qty Delivered</label>
                        <input
                          type="number"
                          value={item.quantity_delivered}
                          onChange={(e) => updateLineItem(index, 'quantity_delivered', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                          min="0"
                          step="0.01"
                          required
                        />
                      </div>
                      <div className="col-span-8 md:col-span-2">
                        <label className="block text-xs text-gray-600 mb-1">Unit Price</label>
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                          min="0"
                          step="0.01"
                          required
                        />
                      </div>
                      <div className="col-span-4 md:col-span-1">
                        <label className="block text-xs text-gray-600 mb-1">Action</label>
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="w-full p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4 mx-auto" />
                        </button>
                      </div>
                    </div>
                    {item.quantity_delivered < item.quantity_ordered && (
                      <div className="mt-2 text-xs text-orange-600 flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        Partial delivery: {item.quantity_delivered} of {item.quantity_ordered}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4 pt-4 border-t border-gray-200">
              <Link
                href="/dashboard/invoices"
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving || !selectedPO || lineItems.length === 0}
                className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Package className="w-5 h-5" />
                    Create Delivery Note
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CreateDeliveryNotePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <CreateDeliveryNotePageContent />
    </Suspense>
  );
}
