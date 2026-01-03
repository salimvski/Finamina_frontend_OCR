'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { 
  ArrowLeft, 
  Download, 
  ExternalLink, 
  CheckCircle, 
  AlertCircle,
  Trash2,
  Edit,
  FileText,
  Loader2
} from 'lucide-react';

export default function SupplierInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<any>(null);
  const [supplier, setSupplier] = useState<any>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');

  useEffect(() => {
    console.log('Invoice ID:', id);
    loadInvoice();
  }, [id]);

  const loadInvoice = async () => {
    try {
      console.log('Fetching invoice with ID:', id);
      
      // Try without supplier join first
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('supplier_invoices')
        .select('*')
        .eq('id', id)
        .single();

      console.log('Invoice Data:', invoiceData);
      console.log('Invoice Error:', invoiceError);

      if (invoiceError) {
        setDebugInfo(`Error: ${invoiceError.message}`);
        setLoading(false);
        return;
      }

      if (!invoiceData) {
        setDebugInfo('No invoice data returned');
        setLoading(false);
        return;
      }

      setInvoice(invoiceData);

      // Then fetch supplier separately
      if (invoiceData.supplier_id) {
        const { data: supplierData, error: supplierError } = await supabase
          .from('suppliers')
          .select('*')
          .eq('id', invoiceData.supplier_id)
          .single();

        console.log('Supplier Data:', supplierData);
        console.log('Supplier Error:', supplierError);

        if (supplierData) {
          setSupplier(supplierData);
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Catch error:', err);
      setDebugInfo(`Exception: ${err}`);
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async () => {
    const { error } = await supabase
      .from('supplier_invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      loadInvoice();
      alert('Invoice marked as paid');
    } else {
      alert('Error: ' + error.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;

    const { error } = await supabase
      .from('supplier_invoices')
      .delete()
      .eq('id', id);

    if (!error) {
      router.push('/dashboard/suppliers');
    } else {
      alert('Error: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading invoice {id}...</p>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Invoice Not Found</h2>
          <p className="text-gray-600 mb-4">ID: {id}</p>
          {debugInfo && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 font-mono text-left">{debugInfo}</p>
            </div>
          )}
          <Link 
            href="/dashboard/suppliers" 
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Supplier Invoices
          </Link>
        </div>
      </div>
    );
  }

  const extractionData = invoice.extraction_data || {};
  const lineItems = extractionData.lineItems || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <Link
            href="/dashboard/suppliers"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Supplier Invoices
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {invoice.invoice_number}
              </h1>
              <p className="text-gray-600">
                Supplier Invoice • {supplier?.name || 'Unknown Supplier'}
              </p>
            </div>
            <span
              className={`px-4 py-2 rounded-full text-sm font-semibold ${
                invoice.status === 'paid'
                  ? 'bg-green-100 text-green-700'
                  : invoice.status === 'overdue'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-orange-100 text-orange-700'
              }`}
            >
              {invoice.status.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Invoice Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Invoice Info */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Invoice Information</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Invoice Number</p>
                  <p className="font-semibold text-gray-900">{invoice.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Invoice Date</p>
                  <p className="font-semibold text-gray-900">
                    {new Date(invoice.invoice_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Due Date</p>
                  <p className="font-semibold text-gray-900">
                    {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Amount</p>
                  <p className="font-semibold text-gray-900">
                    {parseFloat(invoice.amount).toFixed(2)} {invoice.currency}
                  </p>
                </div>
                {invoice.tax_amount > 0 && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Tax Amount</p>
                    <p className="font-semibold text-gray-900">
                      {parseFloat(invoice.tax_amount).toFixed(2)} {invoice.currency}
                    </p>
                  </div>
                )}
                {invoice.paid_at && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Paid At</p>
                    <p className="font-semibold text-green-700">
                      {new Date(invoice.paid_at).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Supplier Info */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Supplier Information</h2>
              
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Supplier Name</p>
                  <p className="font-semibold text-gray-900">{supplier?.name || 'N/A'}</p>
                </div>
                {supplier?.email && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Email</p>
                    <p className="font-semibold text-gray-900">{supplier.email}</p>
                  </div>
                )}
                {supplier?.vat_number && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">VAT Number</p>
                    <p className="font-semibold text-gray-900">{supplier.vat_number}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Line Items */}
            {lineItems.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Line Items</h2>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Description
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                          Quantity
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                          Unit Price
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {lineItems.map((item: any, index: number) => (
                        <tr key={index}>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {item.description || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">
                            {item.quantity || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">
                            {item.unitPrice ? `${item.unitPrice.toFixed(2)}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                            {item.amount ? `${item.amount.toFixed(2)}` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - PDF Preview & Actions */}
          <div className="space-y-6">
            {/* Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Actions</h2>
              
              <div className="space-y-3">
                {invoice.pdf_url ? (
                  <>
                    <a
                      href={invoice.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View PDF
                    </a>
                    <a
                      href={invoice.pdf_url}
                      download
                      className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                    >
                      <Download className="w-4 h-4" />
                      Download PDF
                    </a>
                  </>
                ) : (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">No PDF available</p>
                  </div>
                )}
                
                {invoice.status === 'pending' && (
                  <button
                    onClick={handleMarkAsPaid}
                    className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Mark as Paid
                  </button>
                )}

                <Link
                  href={`/dashboard/suppliers/invoices/${id}/edit`}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                >
                  <Edit className="w-4 h-4" />
                  Edit Invoice
                </Link>

                <button
                  onClick={handleDelete}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Invoice
                </button>
              </div>
            </div>

            {/* PDF Preview */}
            {invoice.pdf_url && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Document Preview</h2>
                
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {invoice.pdf_url.endsWith('.pdf') ? (
                    <iframe
                      src={invoice.pdf_url}
                      className="w-full h-96"
                      title="Invoice PDF"
                    />
                  ) : (
                    <img
                      src={invoice.pdf_url}
                      alt="Invoice"
                      className="w-full h-auto"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}