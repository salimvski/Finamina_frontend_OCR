'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Search, Filter, ArrowUpDown, X, Edit, CheckCircle, Clock, Info, FileText, ArrowLeft, Download, Upload, CloudUpload } from 'lucide-react';
import Link from 'next/link';

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  amount: number;
  tax_amount: number | null;
  currency: string;
  status: string;
  customer_id: string;
  extraction_data?: any;
  customers?: {
    id: string;
    name: string;
    email: string;
    company_name?: string;
    phone?: string;
    country?: string;
  };
}

export default function InvoicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'overdue' | 'draft'>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterInvoices();
  }, [invoices, searchTerm, statusFilter]);

  useEffect(() => {
    const invoiceId = searchParams.get('id');
    if (invoiceId && invoices.length > 0) {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (invoice) {
        setSelectedInvoice(invoice);
      }
    } else if (invoices.length > 0 && !selectedInvoice) {
      setSelectedInvoice(invoices[0]);
    }
  }, [invoices, searchParams]);

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
      await loadInvoices(userData.company_id);
    }

    setLoading(false);
  };

  const loadInvoices = async (company_id: string) => {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        customers(id, name, email, company_name, phone, country)
      `)
      .eq('company_id', company_id)
      .order('invoice_date', { ascending: false });

    if (data) {
      const today = new Date();
      const updatedInvoices = data.map((inv: any) => {
        if (inv.status === 'pending' && inv.due_date) {
          const dueDate = new Date(inv.due_date);
          if (!isNaN(dueDate.getTime()) && dueDate < today) {
            return { ...inv, status: 'overdue' };
          }
        }
        return inv;
      });
      setInvoices(updatedInvoices);
    } else if (error) {
      console.error('Error loading invoices:', error);
    }
  };

  const filterInvoices = () => {
    let filtered = invoices;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(inv =>
        inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.customers?.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(inv => inv.status === statusFilter);
    }

    setFilteredInvoices(filtered);
    
    // Auto-select first invoice if none selected
    if (!selectedInvoice && filtered.length > 0) {
      setSelectedInvoice(filtered[0]);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const calculateSubtotal = (invoice: Invoice) => {
    return (invoice.amount || 0) - (invoice.tax_amount || 0);
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    try {
      // If PDF URL exists in extraction_data, download it
      if (invoice.extraction_data?.pdf_url) {
        window.open(invoice.extraction_data.pdf_url, '_blank');
        return;
      }

      // If PDF URL exists directly on invoice, download it
      if (invoice.extraction_data?.pdf_url) {
        const link = document.createElement('a');
        link.href = invoice.extraction_data.pdf_url;
        link.download = `invoice-${invoice.invoice_number}.pdf`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // Generate PDF using html2pdf or similar library
      // For now, we'll use window.print() as a fallback and suggest PDF generation
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Invoice ${invoice.invoice_number}</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 40px; }
                .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
                .invoice-title { font-size: 24px; font-weight: bold; margin-bottom: 20px; }
                .customer-info, .invoice-info { margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background-color: #f2f2f2; }
                .total { text-align: right; font-weight: bold; margin-top: 20px; }
              </style>
            </head>
            <body>
              <div class="invoice-title">Tax Invoice</div>
              <div class="header">
                <div class="customer-info">
                  <div><strong>${invoice.customers?.company_name || invoice.customers?.name || 'Unknown'}</strong></div>
                  <div>${invoice.customers?.country || 'Kingdom of Saudi Arabia'}</div>
                  ${invoice.customers?.email ? `<div>${invoice.customers.email}</div>` : ''}
                  ${invoice.customers?.phone ? `<div>${invoice.customers.phone}</div>` : ''}
                </div>
                <div class="invoice-info">
                  <div>Invoice number: <strong>${invoice.invoice_number}</strong></div>
                  ${invoice.extraction_data?.reference ? `<div>Reference: <strong>${invoice.extraction_data.reference}</strong></div>` : ''}
                  <div>Date: <strong>${new Date(invoice.invoice_date).toLocaleDateString('en-CA')}</strong></div>
                  ${invoice.due_date ? `<div>Due date: <strong>${new Date(invoice.due_date).toLocaleDateString('en-CA')}</strong></div>` : ''}
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Taxable amount</th>
                    <th>VAT amount</th>
                    <th>Line amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${lineItems.map((item: any, index: number) => {
                    const qty = item.quantity || 1;
                    const unitPrice = item.unit_price || 0;
                    const discount = item.discount || 0;
                    const taxableAmount = (qty * unitPrice) - discount;
                    let vatAmount = 0;
                    if (item.amount && taxableAmount > 0) {
                      vatAmount = item.amount - taxableAmount;
                    } else if (invoice.tax_amount && lineItems.length > 0) {
                      const totalTaxable = lineItems.reduce((sum: number, li: any) => {
                        const liQty = li.quantity || 1;
                        const liPrice = li.unit_price || 0;
                        const liDiscount = li.discount || 0;
                        return sum + ((liQty * liPrice) - liDiscount);
                      }, 0);
                      if (totalTaxable > 0) {
                        vatAmount = (taxableAmount / totalTaxable) * (invoice.tax_amount || 0);
                      }
                    }
                    const lineAmount = taxableAmount + vatAmount;
                    const description = item.item_name && item.description 
                      ? `${item.item_name} - ${item.description}`
                      : item.description || item.item_name || 'Item';
                    return `
                      <tr>
                        <td>${index + 1}</td>
                        <td>${description}</td>
                        <td>${qty}</td>
                        <td>${unitPrice.toFixed(2)}</td>
                        <td>${taxableAmount.toFixed(2)}</td>
                        <td>${vatAmount.toFixed(2)}</td>
                        <td>${lineAmount.toFixed(2)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
              <div class="total">
                <div>Subtotal: ${invoice.currency} ${calculateSubtotal(invoice).toFixed(2)}</div>
                ${invoice.tax_amount ? `<div>Total VAT: ${invoice.currency} ${parseFloat(invoice.tax_amount.toString()).toFixed(2)}</div>` : ''}
                <div style="font-size: 18px; margin-top: 10px;">Total: ${invoice.currency} ${parseFloat(invoice.amount?.toString() || '0').toFixed(2)}</div>
              </div>
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      } else {
        alert('Please allow pop-ups to download the invoice PDF');
      }
    } catch (error) {
      console.error('Error downloading invoice:', error);
      alert('Failed to download invoice. Please try again.');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !companyId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('data', selectedFile);
      formData.append('company_id', companyId);

      const response = await fetch(`${process.env.NEXT_PUBLIC_N8N_URL}/webhook/upload-invoice`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        alert('Invoice uploaded successfully!');
        setShowUploadModal(false);
        setSelectedFile(null);
        await loadInvoices(companyId);
      } else {
        alert('Upload failed. Please try again.');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Error uploading invoice.');
    }

    setUploading(false);
  };

  const lineItems = selectedInvoice?.extraction_data?.lineItems || [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar - Invoice List */}
      <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="p-1.5 hover:bg-gray-100 rounded-lg transition"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4 text-gray-600" />
              </Link>
              <h1 className="text-lg font-semibold text-gray-900">Sales {'>'} Invoices</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload
              </button>
              <Link
                href="/dashboard/invoices/create"
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
              >
                Create
              </Link>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Sort and Filter */}
          <div className="flex gap-2">
            <button className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded border border-gray-300">
              <ArrowUpDown className="w-4 h-4" />
              Sort
            </button>
            <button className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded border border-gray-300">
              <Filter className="w-4 h-4" />
              Filter
            </button>
          </div>
        </div>

        {/* Invoice List */}
        <div className="flex-1 overflow-y-auto">
          {filteredInvoices.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              No invoices found
            </div>
          ) : (
            filteredInvoices.map((invoice) => {
              const customerName = invoice.customers?.company_name || invoice.customers?.name || 'Unknown';
              const isSelected = selectedInvoice?.id === invoice.id;
              
              return (
                <div
                  key={invoice.id}
                  onClick={() => {
                    setSelectedInvoice(invoice);
                    router.push(`/dashboard/invoices?id=${invoice.id}`, { scroll: false });
                  }}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition ${
                    isSelected ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{customerName}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        {new Date(invoice.invoice_date).toLocaleDateString('en-CA')} | {invoice.invoice_number}
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(invoice.status)}`}>
                      {getStatusLabel(invoice.status)}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-gray-900 mt-2">
                    {invoice.currency} {parseFloat(invoice.amount?.toString() || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Content Area - Invoice Details */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedInvoice ? (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link
                  href="/dashboard"
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                  title="Back to Dashboard"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </Link>
                <h2 className="text-xl font-semibold text-gray-900">
                  Invoice {selectedInvoice.invoice_number} {getStatusLabel(selectedInvoice.status).toUpperCase()}
                </h2>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <Info className="w-4 h-4" />
                  SYS-INV-{selectedInvoice.id.slice(-2).toUpperCase()}
                </span>
                <button
                  onClick={() => {
                    setSelectedInvoice(null);
                    router.push('/dashboard/invoices', { scroll: false });
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto bg-gray-50">
              <div className="max-w-5xl mx-auto p-6">
                {/* Payments Section */}
                {selectedInvoice.status === 'draft' && (
                  <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
                    <h3 className="font-semibold text-gray-900 mb-2">Payments</h3>
                    <p className="text-sm text-gray-600">Payments can only be recorded for Finalized Invoices</p>
                  </div>
                )}

                {/* Invoice Actions */}
                <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Invoice</h3>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => handleDownloadInvoice(selectedInvoice)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                    >
                      <Download className="w-4 h-4" />
                      Download PDF
                    </button>
                    <Link
                      href={`/dashboard/invoices/${selectedInvoice.id}/edit`}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-300 transition"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </Link>
                    {selectedInvoice.status === 'draft' && (
                      <button className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg transition">
                        Finalize
                      </button>
                    )}
                  </div>
                </div>

                {/* Tax Invoice */}
                <div className="bg-white rounded-lg border border-gray-200 p-8" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 20px, #f3f4f6 20px, #f3f4f6 21px)' }}>
                  <div className="bg-white p-8">
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-6">Tax Invoice</h1>
                        
                        {/* Customer Info */}
                        <div className="space-y-1">
                          <div className="font-semibold text-gray-900">
                            {selectedInvoice.customers?.company_name || selectedInvoice.customers?.name || 'Unknown'}
                          </div>
                          <div className="text-sm text-gray-600">
                            {selectedInvoice.customers?.country || 'Kingdom of Saudi Arabia'}
                          </div>
                          {selectedInvoice.customers?.email && (
                            <div className="text-sm text-gray-600">{selectedInvoice.customers.email}</div>
                          )}
                          {selectedInvoice.customers?.phone && (
                            <div className="text-sm text-gray-600">{selectedInvoice.customers.phone}</div>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        {/* Invoice Metadata */}
                        <div className="space-y-2 mb-6">
                          <div className="text-sm">
                            <span className="text-gray-600">Invoice number: </span>
                            <span className="font-semibold text-gray-900">{selectedInvoice.invoice_number}</span>
                          </div>
                          {selectedInvoice.extraction_data?.reference && (
                            <div className="text-sm">
                              <span className="text-gray-600">Reference: </span>
                              <span className="font-semibold text-gray-900">{selectedInvoice.extraction_data.reference}</span>
                            </div>
                          )}
                          <div className="text-sm">
                            <span className="text-gray-600">Date: </span>
                            <span className="font-semibold text-gray-900">
                              {new Date(selectedInvoice.invoice_date).toLocaleDateString('en-CA')}
                            </span>
                          </div>
                          {selectedInvoice.due_date && (
                            <div className="text-sm">
                              <span className="text-gray-600">Due date: </span>
                              <span className="font-semibold text-gray-900">
                                {new Date(selectedInvoice.due_date).toLocaleDateString('en-CA')}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Vendor Info */}
                        <div className="text-sm text-gray-600">
                          <div className="font-semibold text-gray-900">Velitra CA</div>
                          <div>Canada</div>
                        </div>
                      </div>
                    </div>

                    {/* Balance */}
                    <div className="text-right mb-6">
                      <div className="text-2xl font-bold text-gray-900">
                        {selectedInvoice.currency} {parseFloat(selectedInvoice.amount?.toString() || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Line Items Table */}
                    <div className="mb-6">
                      <table className="w-full">
                        <thead className="border-b-2 border-gray-300">
                          <tr>
                            <th className="text-left py-3 px-2 text-sm font-semibold text-gray-900">#</th>
                            <th className="text-left py-3 px-2 text-sm font-semibold text-gray-900">Description</th>
                            <th className="text-right py-3 px-2 text-sm font-semibold text-gray-900">Qty</th>
                            <th className="text-right py-3 px-2 text-sm font-semibold text-gray-900">Price</th>
                            <th className="text-right py-3 px-2 text-sm font-semibold text-gray-900">Taxable amount</th>
                            <th className="text-right py-3 px-2 text-sm font-semibold text-gray-900">VAT amount</th>
                            <th className="text-right py-3 px-2 text-sm font-semibold text-gray-900">Line amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineItems.length > 0 ? (
                            lineItems.map((item: any, index: number) => {
                              const qty = item.quantity || 1;
                              const unitPrice = item.unit_price || 0;
                              const discount = item.discount || 0;
                              const taxableAmount = (qty * unitPrice) - discount;
                              
                              // Calculate tax - if amount is provided, use it; otherwise calculate from tax rate
                              let vatAmount = 0;
                              let taxRate = 0;
                              if (item.amount && taxableAmount > 0) {
                                // Amount includes tax, so calculate backwards
                                vatAmount = item.amount - taxableAmount;
                                taxRate = taxableAmount > 0 ? (vatAmount / taxableAmount) : 0;
                              } else if (selectedInvoice.tax_amount && lineItems.length > 0) {
                                // Distribute tax proportionally
                                const totalTaxable = lineItems.reduce((sum: number, li: any) => {
                                  const liQty = li.quantity || 1;
                                  const liPrice = li.unit_price || 0;
                                  const liDiscount = li.discount || 0;
                                  return sum + ((liQty * liPrice) - liDiscount);
                                }, 0);
                                if (totalTaxable > 0) {
                                  vatAmount = (taxableAmount / totalTaxable) * (selectedInvoice.tax_amount || 0);
                                  taxRate = taxableAmount > 0 ? (vatAmount / taxableAmount) : 0;
                                }
                              }
                              
                              const lineAmount = taxableAmount + vatAmount;
                              const description = item.item_name && item.description 
                                ? `${item.item_name} - ${item.description}`
                                : item.description || item.item_name || 'Item';

                              return (
                                <tr key={index} className="border-b border-gray-200">
                                  <td className="py-3 px-2 text-sm text-gray-900">{index + 1}</td>
                                  <td className="py-3 px-2 text-sm text-gray-900">{description}</td>
                                  <td className="py-3 px-2 text-sm text-gray-900 text-right">{qty}</td>
                                  <td className="py-3 px-2 text-sm text-gray-900 text-right">
                                    {unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="py-3 px-2 text-sm text-gray-900 text-right">
                                    {taxableAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="py-3 px-2 text-sm text-gray-900 text-right">
                                    <div>{vatAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    {taxRate > 0 && (
                                      <div className="text-xs text-gray-500">{(taxRate * 100).toFixed(0)}%</div>
                                    )}
                                  </td>
                                  <td className="py-3 px-2 text-sm font-semibold text-gray-900 text-right">
                                    {lineAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-gray-500 text-sm">
                                No line items found
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary */}
                    <div className="border-t-2 border-gray-300 pt-4">
                      <div className="flex justify-end">
                        <div className="w-64 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Subtotal</span>
                            <span className="font-semibold text-gray-900">
                              {selectedInvoice.currency} {calculateSubtotal(selectedInvoice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          {selectedInvoice.tax_amount && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Total VAT</span>
                              <span className="font-semibold text-gray-900">
                                {selectedInvoice.currency} {parseFloat(selectedInvoice.tax_amount.toString()).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between text-lg font-bold border-t border-gray-300 pt-2">
                            <span className="text-gray-900">Total</span>
                            <span className="text-gray-900">
                              {selectedInvoice.currency} {parseFloat(selectedInvoice.amount?.toString() || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-lg">Select an invoice to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Upload Invoice Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Upload Invoice</h3>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Invoice File (PDF)
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="invoice-upload"
                  />
                  <label htmlFor="invoice-upload" className="cursor-pointer">
                    {selectedFile ? (
                      <div className="space-y-2">
                        <FileText className="w-12 h-12 text-green-600 mx-auto" />
                        <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                        <p className="text-xs text-gray-500">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <CloudUpload className="w-12 h-12 text-gray-400 mx-auto" />
                        <p className="text-sm font-medium text-gray-900">Click to upload or drag and drop</p>
                        <p className="text-xs text-gray-500">PDF, PNG, JPG (MAX. 10MB)</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload Invoice
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
