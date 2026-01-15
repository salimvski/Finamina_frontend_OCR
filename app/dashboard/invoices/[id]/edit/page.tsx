'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Save, Loader2, Plus, Trash2, X } from 'lucide-react';

interface LineItem {
  item_name?: string;
  description: string;
  account: string;
  quantity: number;
  unit_price: number;
  tax_rate: string;
  discount: number;
  amount: number;
}

interface WafeqAccount {
  id: string;
  name: string;
  code?: string;
  type?: string;
  account_type?: string;
}

interface WafeqTaxRate {
  id: string;
  name: string;
  rate?: number;
}

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    due_date: '',
    reference: '',
    notes: '',
    status: 'pending'
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [accounts, setAccounts] = useState<WafeqAccount[]>([]);
  const [taxRates, setTaxRates] = useState<WafeqTaxRate[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  
  // Default account and tax rate (fallback)
  const DEFAULT_ACCOUNT = 'acc_KEi3RuQTxLXvaCostgNDnq';
  const DEFAULT_TAX_RATE = 'tax_VhZKtotYoETzeWP6puoJ7g';

  useEffect(() => {
    loadInvoice();
    loadWafeqOptions();
  }, [invoiceId]);

  const loadWafeqOptions = async () => {
    setLoadingOptions(true);
    try {
      const [accountsResponse, taxRatesResponse] = await Promise.all([
        fetch('/api/wafeq/accounts'),
        fetch('/api/wafeq/tax-rates')
      ]);

      if (accountsResponse.ok) {
        const accountsData = await accountsResponse.json();
        setAccounts(accountsData.accounts || []);
      }

      if (taxRatesResponse.ok) {
        const taxRatesData = await taxRatesResponse.json();
        // API returns taxRates (capital R) not tax_rates
        setTaxRates(taxRatesData.taxRates || taxRatesData.tax_rates || []);
      }
    } catch (error) {
      console.error('Error loading Wafeq options:', error);
    } finally {
      setLoadingOptions(false);
    }
  };

  const loadInvoice = async () => {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        customers (
          id,
          name,
          company_name,
          email,
          phone
        )
      `)
      .eq('id', invoiceId)
      .single();

    if (data) {
      setInvoice(data);
      setCustomer(data.customers);
      
      // Load line items from extraction_data
      const lineItemsData = data.extraction_data?.lineItems || [];
      if (lineItemsData.length > 0) {
        setLineItems(lineItemsData);
      } else {
        // If no line items, create one empty item
        const defaultAccount = accounts.find(acc => acc.id === DEFAULT_ACCOUNT)?.id || accounts[0]?.id || '';
        const defaultTaxRate = taxRates.find(tr => tr.id === DEFAULT_TAX_RATE)?.id || taxRates[0]?.id || '';
        setLineItems([{
          item_name: '',
          description: '',
          account: defaultAccount,
          quantity: 1,
          unit_price: 0,
          tax_rate: defaultTaxRate,
          discount: 0,
          amount: 0
        }]);
      }

      setFormData({
        due_date: data.due_date || '',
        reference: data.extraction_data?.reference || '',
        notes: data.extraction_data?.notes || '',
        status: data.status || 'pending'
      });
    }
    setLoading(false);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-calculate line amount
    const quantity = updated[index].quantity || 0;
    const unitPrice = updated[index].unit_price || 0;
    const discount = updated[index].discount || 0;
    
    // Get tax rate percentage
    let taxRatePercent = 0;
    if (updated[index].tax_rate) {
      const taxRateObj = taxRates.find(tr => tr.id === updated[index].tax_rate);
      if (taxRateObj && taxRateObj.rate !== undefined) {
        taxRatePercent = taxRateObj.rate / 100;
      }
    }
    
    // Calculate: (quantity * unit_price - discount) * (1 + tax_rate)
    const subtotal = (quantity * unitPrice) - discount;
    const lineTotal = subtotal * (1 + taxRatePercent);
    
    updated[index].amount = lineTotal;
    setLineItems(updated);
  };

  const addLineItem = () => {
    const defaultAccount = accounts.find(acc => acc.id === DEFAULT_ACCOUNT)?.id || accounts[0]?.id || '';
    const defaultTaxRate = taxRates.find(tr => tr.id === DEFAULT_TAX_RATE)?.id || taxRates[0]?.id || '';
    
    setLineItems([...lineItems, { 
      item_name: '',
      description: '', 
      account: defaultAccount, 
      quantity: 1, 
      unit_price: 0, 
      tax_rate: defaultTaxRate, 
      discount: 0, 
      amount: 0 
    }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => {
      const quantity = item.quantity || 0;
      const unitPrice = item.unit_price || 0;
      const discount = item.discount || 0;
      return sum + ((quantity * unitPrice) - discount);
    }, 0);

    const tax = lineItems.reduce((sum, item) => {
      const quantity = item.quantity || 0;
      const unitPrice = item.unit_price || 0;
      const discount = item.discount || 0;
      const subtotal = (quantity * unitPrice) - discount;
      
      let taxRatePercent = 0;
      if (item.tax_rate) {
        const taxRateObj = taxRates.find(tr => tr.id === item.tax_rate);
        if (taxRateObj && taxRateObj.rate !== undefined) {
          taxRatePercent = taxRateObj.rate / 100;
        }
      }
      
      return sum + (subtotal * taxRatePercent);
    }, 0);

    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { subtotal, tax, total } = calculateTotals();

      // Update extraction_data with new line items and optional fields
      const extractionData: any = {
        ...(invoice.extraction_data || {}),
        lineItems: lineItems.map(item => ({
          item_name: item.item_name,
          description: item.description,
          account: item.account,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          discount: item.discount,
          amount: item.amount
        })),
        subtotal: subtotal,
        total_amount: total
      };

      if (formData.reference && formData.reference.trim()) {
        extractionData.reference = formData.reference.trim();
      }
      if (formData.notes && formData.notes.trim()) {
        extractionData.notes = formData.notes.trim();
      }

      // Update invoice in Supabase
      const { error } = await supabase
        .from('invoices')
        .update({
          due_date: formData.due_date || null,
          amount: total,
          tax_amount: tax,
          status: formData.status,
          extraction_data: extractionData
        })
        .eq('id', invoiceId);

      if (error) {
        throw error;
      }

      // Update in Wafeq if wafeq_invoice_id exists
      if (invoice.wafeq_invoice_id) {
        try {
          const wafeqPayload: any = {
            invoice_due_date: formData.due_date || invoice.due_date,
          };

          if (formData.reference && formData.reference.trim()) {
            wafeqPayload.reference = formData.reference.trim();
          }
          if (formData.notes && formData.notes.trim()) {
            wafeqPayload.notes = formData.notes.trim();
          }

          // Update line items
          if (lineItems && Array.isArray(lineItems)) {
            wafeqPayload.line_items = lineItems.map((item: any) => {
              const lineItem: any = {
                description: item.description,
                quantity: item.quantity,
                unit_amount: item.unit_price,
              };

              if (item.account) {
                lineItem.account = item.account;
              }
              if (item.tax_rate) {
                lineItem.tax_rate = item.tax_rate;
              }
              if (item.discount && item.discount > 0) {
                lineItem.discount = item.discount;
              }

              return lineItem;
            });
          }

          // Update in Wafeq (if supported)
          const wafeqResponse = await fetch(`/api/wafeq/invoices/${invoice.wafeq_invoice_id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(wafeqPayload),
          });

          if (!wafeqResponse.ok) {
            console.warn('Failed to update invoice in Wafeq, but saved locally');
          }
        } catch (wafeqError) {
          console.warn('Error updating Wafeq invoice:', wafeqError);
          // Continue anyway - local save succeeded
        }
      }

      router.push('/dashboard/invoices');
    } catch (error: any) {
      console.error('Error saving invoice:', error);
      alert(`Failed to save changes: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-gray-600">Invoice not found</div>
      </div>
    );
  }

  const { subtotal, tax, total } = calculateTotals();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => router.push('/dashboard/invoices')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Invoices
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Edit Invoice</h1>
          <p className="text-sm text-gray-600 mt-1">Invoice {invoice.invoice_number}</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
          
          {/* Read-only Section */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Invoice Information (Read-only)</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={invoice.invoice_number}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">Cannot be changed for audit trail</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={invoice.invoice_date}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">Historical accuracy</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Customer
                </label>
                <input
                  type="text"
                  value={customer?.company_name || customer?.name || 'Unknown'}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">Cannot be changed</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Currency
                </label>
                <input
                  type="text"
                  value={invoice.currency || 'SAR'}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">Cannot be changed</p>
              </div>
            </div>
          </div>

          {/* Editable Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Editable Fields</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date *
                </label>
                <input
                  type="date"
                  required
                  value={formData.due_date}
                  onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status *
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="draft">Draft</option>
                  <option value="pending">Pending</option>
                  <option value="sent">Sent</option>
                  <option value="overdue">Overdue</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference
              </label>
              <input
                type="text"
                value={formData.reference}
                onChange={(e) => setFormData({...formData, reference: e.target.value})}
                placeholder="PO number, project code, etc."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Payment terms, special instructions, etc."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Line Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Line Items</h2>
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Line Item
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Item Name</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Description</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Account</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Qty</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Price</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Tax Rate</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Discount</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Amount</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {lineItems.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.item_name || ''}
                          onChange={(e) => updateLineItem(index, 'item_name', e.target.value)}
                          placeholder="Product/Service"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          placeholder="Description"
                          required
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={item.account}
                          onChange={(e) => updateLineItem(index, 'account', e.target.value)}
                          required
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                          disabled={loadingOptions}
                        >
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.account_type || acc.type || 'Account'}: {acc.name || acc.code || acc.id}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          required
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          required
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={item.tax_rate || ''}
                          onChange={(e) => updateLineItem(index, 'tax_rate', e.target.value)}
                          required
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                          disabled={loadingOptions || taxRates.length === 0}
                        >
                          {taxRates.length === 0 ? (
                            <option value="">{loadingOptions ? 'Loading...' : 'No tax rates available'}</option>
                          ) : (
                            taxRates.map(tr => (
                              <option key={tr.id} value={tr.id}>
                                {tr.name} {tr.rate ? `(${tr.rate}%)` : ''}
                              </option>
                            ))
                          )}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.discount}
                          onChange={(e) => updateLineItem(index, 'discount', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={item.amount.toFixed(2)}
                          disabled
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-100 text-gray-600 cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(index)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                            title="Remove line item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mt-4">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">{invoice.currency || 'SAR'} {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax:</span>
                  <span className="font-medium">{invoice.currency || 'SAR'} {tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t border-gray-300 pt-2">
                  <span>Total:</span>
                  <span>{invoice.currency || 'SAR'} {total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => router.push('/dashboard/invoices')}
              className="px-6 py-3 border-2 border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
