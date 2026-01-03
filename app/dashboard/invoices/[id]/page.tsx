'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, FileText, Calendar, DollarSign, Building, CheckCircle, Clock, Mail, Download, Edit, Trash2 } from 'lucide-react';

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    // Load invoice
    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('*, customers(*)')
      .eq('id', invoiceId)
      .single();

    if (invoiceData) {
      setInvoice(invoiceData);
      setCustomer(invoiceData.customers);

      // Parse extraction_data for line items if available
      if (invoiceData.extraction_data?.lineItems) {
        setLineItems(invoiceData.extraction_data.lineItems);
      }
    }

    setLoading(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(true);

    const updates: any = { status: newStatus };
    if (newStatus === 'paid') {
      updates.paid_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId);

    if (!error) {
      loadInvoice();
    }

    setActionLoading(false);
  };

  const handleSendReminder = async () => {
    setActionLoading(true);

    // TODO: Integrate with your email reminder n8n workflow
    alert('Reminder email sent! (Feature coming soon)');

    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Invoice not found</div>
      </div>
    );
  }

  const extractionData = invoice.extraction_data || {};

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>

          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Invoice #{invoice.invoice_number}
              </h1>
              <p className="text-gray-600 mt-1">
                {new Date(invoice.invoice_date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = invoice.pdf_url;
                  link.download = `invoice_${invoice.invoice_number}.pdf`;
                  link.click();
                }}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <Download className="w-4 h-4" />
                Download
              </button>

              <span className={`px-4 py-2 inline-flex items-center gap-2 text-sm font-semibold rounded-lg ${invoice.status === 'paid'
                  ? 'bg-green-100 text-green-800'
                  : invoice.status === 'overdue'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                {invoice.status === 'paid' ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Invoice Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Amount Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Invoice Summary</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {(
      parseFloat(invoice.amount || '0') - 
      parseFloat(invoice.tax_amount?.toString() || '0')
    ).toFixed(2)} {invoice.currency}
                  </span>
                </div>

                {invoice.tax_amount && (
                  <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                    <span className="text-gray-600">VAT (15%)</span>
                    <span className="text-lg font-semibold text-gray-900">
                      {parseFloat(invoice.tax_amount).toFixed(2)} {invoice.currency}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-xl font-bold text-gray-900">Total Amount</span>
                  <span className="text-3xl font-bold text-blue-600">
                    {parseFloat(invoice.amount).toFixed(2)} {invoice.currency}
                  </span>
                </div>
              </div>
            </div>

            {/* Supplier Info */}
            {extractionData.supplierName && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Building className="w-5 h-5" />
                  Supplier Information
                </h2>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm text-gray-600">Company Name</span>
                    <p className="font-semibold text-gray-900">{extractionData.supplierName}</p>
                  </div>

                  {extractionData.supplierVAT && (
                    <div>
                      <span className="text-sm text-gray-600">VAT Number</span>
                      <p className="font-semibold text-gray-900">{extractionData.supplierVAT}</p>
                    </div>
                  )}

                  {extractionData.supplierAddress && (
                    <div>
                      <span className="text-sm text-gray-600">Address</span>
                      <p className="text-gray-900">{extractionData.supplierAddress}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Line Items */}
            {lineItems.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Line Items</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-gray-200">
                      <tr>
                        <th className="text-left py-3 text-sm font-medium text-gray-600">Description</th>
                        <th className="text-right py-3 text-sm font-medium text-gray-600">Qty</th>
                        <th className="text-right py-3 text-sm font-medium text-gray-600">Unit Price</th>
                        <th className="text-right py-3 text-sm font-medium text-gray-600">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lineItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-3 text-gray-900">{item.description}</td>
                          <td className="py-3 text-right text-gray-900">{item.quantity}</td>
                          <td className="py-3 text-right text-gray-900">
                            {item.unitPrice?.toFixed(2) || '-'}
                          </td>
                          <td className="py-3 text-right font-semibold text-gray-900">
                            {item.amount?.toFixed(2) || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Actions Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
              <div className="space-y-3">
                {invoice.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('paid')}
                      disabled={actionLoading}
                      className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Mark as Paid
                    </button>

                    <button
                      onClick={handleSendReminder}
                      disabled={actionLoading}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                    >
                      <Mail className="w-5 h-5" />
                      Send Reminder
                    </button>

                    <button
                      onClick={() => handleStatusChange('overdue')}
                      disabled={actionLoading}
                      className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                    >
                      <Clock className="w-5 h-5" />
                      Mark as Overdue
                    </button>
                  </>
                )}

                {invoice.status === 'paid' && (
                  <div className="text-center py-4">
                    <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-2" />
                    <p className="text-green-700 font-semibold">Invoice Paid</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {invoice.paid_at && new Date(invoice.paid_at).toLocaleDateString()}
                    </p>
                  </div>
                )}

                <button
                  onClick={() => router.push(`/dashboard/invoices/${invoiceId}/edit`)}
                  className="w-full flex items-center justify-center gap-2 border-2 border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-3 rounded-lg transition"
                >
                  <Edit className="w-5 h-5" />
                  Edit Invoice
                </button>
                {/* Add this after the Edit button */}
                <button
                  onClick={async () => {
                    if (confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
                      setActionLoading(true);
                      const { error } = await supabase
                        .from('invoices')
                        .delete()
                        .eq('id', invoiceId);

                      if (!error) {
                        router.push('/dashboard');
                      } else {
                        alert('Failed to delete invoice');
                      }
                      setActionLoading(false);
                    }
                  }}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 border-2 border-red-600 hover:bg-red-50 text-red-600 font-semibold py-3 rounded-lg transition disabled:opacity-50"
                >
                  <Trash2 className="w-5 h-5" />
                  Delete Invoice
                </button>
              </div>
            </div>

            {/* Invoice Details */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-gray-600 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Issue Date
                  </span>
                  <p className="font-semibold text-gray-900 mt-1">
                    {new Date(invoice.invoice_date).toLocaleDateString()}
                  </p>
                </div>

                {invoice.due_date && (
                  <div>
                    <span className="text-sm text-gray-600 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Due Date
                    </span>
                    <p className="font-semibold text-gray-900 mt-1">
                      {new Date(invoice.due_date).toLocaleDateString()}
                    </p>
                  </div>
                )}

                <div>
                  <span className="text-sm text-gray-600">Currency</span>
                  <p className="font-semibold text-gray-900 mt-1">{invoice.currency}</p>
                </div>

                {invoice.confidence_score && (
                  <div>
                    <span className="text-sm text-gray-600">Extraction Confidence</span>
                    <div className="mt-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${invoice.confidence_score * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {(invoice.confidence_score * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}