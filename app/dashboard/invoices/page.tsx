'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Search, Filter, ArrowUpDown, X, Edit, CheckCircle, Clock, Info, FileText, ArrowLeft, Download, Upload, CloudUpload, Plus, Package, Shield, AlertTriangle, Loader2 } from 'lucide-react';
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
  po_id: string | null;
  dn_id?: string | null;
  match_status?: string;
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

interface DeliveryNote {
  id: string;
  dn_number: string;
  dn_date: string;
  customer_id?: string;
  po_id?: string;
  amount?: string;
  status?: string;
  customers?: {
    id: string;
    name: string;
    company_name?: string;
  };
}

interface ARMatch {
  id: string;
  po_id: string;
  dn_id?: string;
  invoice_id: string;
  customer_id: string;
  match_status: string;
  match_type: string;
  match_score?: number;
  amount_discrepancy?: number;
  purchase_order?: {
    po_number: string;
  };
  delivery_note?: {
    dn_number: string;
  };
  invoice?: {
    invoice_number: string;
  };
}

interface ARAnomaly {
  id: string;
  customer_id: string;
  po_id?: string;
  dn_id?: string;
  invoice_id?: string;
  anomaly_type: string;
  severity: string;
  status: string;
  description?: string;
  discrepancy_amount?: number;
  customers?: {
    name: string;
    company_name?: string;
  };
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  po_date: string;
  currency: string;
  amount: string;
  tax_amount: string;
  status: string;
  supplier_id?: string;
  customer_id?: string;
  notes?: string;
  expected_delivery_date?: string;
  customers?: {
    id: string;
    name: string;
    company_name?: string;
  };
  suppliers?: {
    id: string;
    name: string;
  };
  hasInvoice?: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
}

function InvoicesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState('');
  const [activeTab, setActiveTab] = useState<'pending-pos' | 'invoices' | 'matching'>('pending-pos');
  
  // Purchase Orders (pending)
  const [pendingPOs, setPendingPOs] = useState<PurchaseOrder[]>([]);
  const [filteredPOs, setFilteredPOs] = useState<PurchaseOrder[]>([]);
  const [poSearchTerm, setPoSearchTerm] = useState('');
  
  // Invoices
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'overdue' | 'draft'>('all');
  
  // Upload modals
  const [showUploadPOModal, setShowUploadPOModal] = useState(false);
  const [showUploadInvoiceModal, setShowUploadInvoiceModal] = useState(false);
  const [showUploadDNModal, setShowUploadDNModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 3-Way Matching
  const [matching, setMatching] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [arMatches, setArMatches] = useState<ARMatch[]>([]);
  const [arAnomalies, setArAnomalies] = useState<ARAnomaly[]>([]);
  const [matchingTab, setMatchingTab] = useState<'overview' | 'delivery-notes' | 'matches' | 'anomalies'>('overview');

  useEffect(() => {
    loadData();
  }, []);

  // Reload pending POs when page becomes visible (e.g., after creating an invoice)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && companyId) {
        loadPendingPOs(companyId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also reload when window gains focus
    const handleFocus = () => {
      if (companyId) {
        loadPendingPOs(companyId);
      }
    };
    
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [companyId]);

  useEffect(() => {
    filterPOs();
  }, [pendingPOs, poSearchTerm]);

  useEffect(() => {
    filterInvoices();
  }, [invoices, searchTerm, statusFilter]);

  useEffect(() => {
    const invoiceId = searchParams.get('id');
    if (invoiceId && invoices.length > 0) {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (invoice) {
        setSelectedInvoice(invoice);
        setActiveTab('invoices');
      }
    } else if (invoices.length > 0 && !selectedInvoice && activeTab === 'invoices') {
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
      await Promise.all([
        loadPendingPOs(userData.company_id),
        loadInvoices(userData.company_id)
      ]);
    }

    setLoading(false);
  };

  const loadPendingPOs = async (company_id: string) => {
    try {
      // Load all purchase orders (without joins to avoid errors)
      const { data: allPOs, error: poError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('company_id', company_id)
        .order('po_date', { ascending: false });

      if (poError) {
        console.error('Error loading purchase orders:', poError);
        setPendingPOs([]);
        return;
      }

      console.log('All POs loaded:', allPOs?.length || 0);

      if (!allPOs || allPOs.length === 0) {
        console.log('No purchase orders found');
        setPendingPOs([]);
        return;
      }

      // Load all invoices to find which POs already have invoices
      // Check both po_id column and extraction_data.purchase_order_id
      const { data: allInvoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, po_id, extraction_data')
        .eq('company_id', company_id);

      // Create a map of PO ID to invoice info
      const poToInvoiceMap = new Map<string, { id: string; invoice_number: string }>();
      (allInvoices || []).forEach((inv: any) => {
        const invoiceInfo = { id: inv.id, invoice_number: inv.invoice_number };
        if (inv.po_id) {
          poToInvoiceMap.set(inv.po_id, invoiceInfo);
        }
        // Also check extraction_data.purchase_order_id for backward compatibility
        if (inv.extraction_data?.purchase_order_id) {
          poToInvoiceMap.set(inv.extraction_data.purchase_order_id, invoiceInfo);
        }
      });

      console.log('PO to Invoice map:', Array.from(poToInvoiceMap.entries()));

      // Get all customer IDs to check if supplier_id matches a customer
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, company_name')
        .eq('company_id', company_id);

      const customerIds = new Set((customers || []).map((c: any) => c.id));
      const customerMap = new Map((customers || []).map((c: any) => [c.id, c]));

      // Show ALL POs (for tracking history), but mark which ones have invoices
      // In A/R context, we show all POs from customers
      const allPOsWithInfo = allPOs
        .map(po => {
          // Check if PO has an invoice
          const invoiceInfo = poToInvoiceMap.get(po.id);
          const hasInvoice = !!invoiceInfo;
          
          // Try to find customer info
          let customerId = po.customer_id;
          if (!customerId && po.supplier_id && customerIds.has(po.supplier_id)) {
            customerId = po.supplier_id;
          }
          
          const customer = customerId ? customerMap.get(customerId) : null;
          
          return {
            ...po,
            customers: customer ? {
              id: customer.id,
              name: customer.name,
              company_name: customer.company_name
            } : undefined,
            hasInvoice: hasInvoice,
            invoiceId: invoiceInfo?.id,
            invoiceNumber: invoiceInfo?.invoice_number
          };
        })
        // Filter to only show POs from customers (for A/R)
        .filter(po => {
          // Show PO if it has customer_id or supplier_id matches a customer
          if (po.customer_id) return true;
          if (po.supplier_id && customerIds.has(po.supplier_id)) return true;
          // Also show POs without customer/supplier (user can assign later)
          return true;
        });

      console.log('All POs with info:', allPOsWithInfo.length);
      console.log('POs with invoices:', allPOsWithInfo.filter(po => po.hasInvoice).length);
      setPendingPOs(allPOsWithInfo);
    } catch (error) {
      console.error('Error in loadPendingPOs:', error);
      setPendingPOs([]);
    }
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

  const loadDeliveryNotes = async (company_id: string) => {
    try {
      // Load delivery notes without joins first to avoid errors
      const { data: allDNs, error: allDNsError } = await supabase
        .from('delivery_notes')
        .select('*')
        .eq('company_id', company_id);

      if (allDNsError) {
        console.error('Error loading delivery notes:', allDNsError);
        setDeliveryNotes([]);
        return;
      }

      if (!allDNs || allDNs.length === 0) {
        setDeliveryNotes([]);
        return;
      }

      // Filter for A/R delivery notes:
      // 1. If context column exists and equals 'ar'
      // 2. OR if customer_id exists (and no supplier_id, or supplier_id is null)
      const arDeliveryNotes = allDNs.filter((dn: any) => {
        // If context column exists, use it
        if (dn.context !== undefined && dn.context !== null) {
          return dn.context === 'ar';
        }
        // Otherwise, check if it has customer_id (likely A/R)
        // and either no supplier_id or supplier_id is null
        return dn.customer_id && (!dn.supplier_id || dn.supplier_id === null);
      });

      // Load customer and PO info separately for each DN
      const customerIds = [...new Set(arDeliveryNotes.map((dn: any) => dn.customer_id).filter(Boolean))];
      const poIds = [...new Set(arDeliveryNotes.map((dn: any) => dn.po_id).filter(Boolean))];

      const customersMap = new Map();
      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from('customers')
          .select('id, name, company_name')
          .in('id', customerIds);
        
        if (customers) {
          customers.forEach((c: any) => customersMap.set(c.id, c));
        }
      }

      const poMap = new Map();
      if (poIds.length > 0) {
        const { data: pos } = await supabase
          .from('purchase_orders')
          .select('id, po_number')
          .in('id', poIds);
        
        if (pos) {
          pos.forEach((po: any) => poMap.set(po.id, po));
        }
      }

      // Map delivery notes with customer and PO info
      const notesWithInfo = arDeliveryNotes.map((dn: any) => ({
        ...dn,
        customers: dn.customer_id ? customersMap.get(dn.customer_id) : undefined,
        purchase_order: dn.po_id ? poMap.get(dn.po_id) : undefined
      }));

      setDeliveryNotes(notesWithInfo);
    } catch (error) {
      console.error('Error in loadDeliveryNotes:', error);
      setDeliveryNotes([]);
    }
  };

  const loadARMatches = async (company_id: string) => {
    try {
      const { data, error } = await supabase
        .from('ar_three_way_matches')
        .select(`
          *,
          purchase_order:purchase_orders(po_number),
          delivery_note:delivery_notes(dn_number),
          invoice:invoices(invoice_number)
        `)
        .eq('company_id', company_id)
        .order('created_at', { ascending: false });

      if (data) {
        setArMatches(data);
      } else if (error) {
        console.error('Error loading AR matches:', error);
      }
    } catch (error) {
      console.error('Error in loadARMatches:', error);
    }
  };

  const loadARAnomalies = async (company_id: string) => {
    try {
      const { data, error } = await supabase
        .from('ar_anomalies')
        .select(`
          *,
          customers(id, name, company_name)
        `)
        .eq('company_id', company_id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (data) {
        setArAnomalies(data);
      } else if (error) {
        console.error('Error loading AR anomalies:', error);
      }
    } catch (error) {
      console.error('Error in loadARAnomalies:', error);
    }
  };

  const handleRun3WayMatch = async () => {
    if (!companyId) return;

    setMatching(true);
    try {
      // Use our own API route instead of n8n (no new workflow needed)
      const response = await fetch('/api/ar/three-way-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert(`A/R 3-Way matching completed! ${result.matches_created} matches, ${result.anomalies_created} anomalies.`);
        await Promise.all([
          loadARMatches(companyId),
          loadARAnomalies(companyId),
          loadInvoices(companyId)
        ]);
      } else {
        alert(result.error || 'Matching failed. Please try again.');
      }
    } catch (error) {
      console.error('Error running match:', error);
      alert('Error running 3-way match.');
    } finally {
      setMatching(false);
    }
  };

  const handleUploadDN = async () => {
    if (!selectedFile || !companyId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('data', selectedFile);
      formData.append('company_id', companyId);
      formData.append('context', 'ar'); // Mark as A/R delivery note

      // Use our API route instead of calling n8n directly
      // This ensures the DN is saved with correct A/R fields (customer_id, context='ar')
      const response = await fetch('/api/ar/upload-delivery-note', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert('Delivery Note uploaded successfully!');
        setShowUploadDNModal(false);
        setSelectedFile(null);
        
        // Wait a bit more for database to be fully updated, then reload
        setTimeout(async () => {
          await loadDeliveryNotes(companyId);
        }, 2000);
      } else {
        alert(result.error || 'Upload failed. Please try again.');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Error uploading delivery note.');
    }

    setUploading(false);
  };

  const filterPOs = () => {
    let filtered = pendingPOs;

    if (poSearchTerm) {
      filtered = filtered.filter(po =>
        po.po_number.toLowerCase().includes(poSearchTerm.toLowerCase()) ||
        po.customers?.name?.toLowerCase().includes(poSearchTerm.toLowerCase()) ||
        po.customers?.company_name?.toLowerCase().includes(poSearchTerm.toLowerCase())
      );
    }

    setFilteredPOs(filtered);
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
    if (!selectedInvoice && filtered.length > 0 && activeTab === 'invoices') {
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

  const handleGenerateInvoice = (po: PurchaseOrder) => {
    // Navigate to create invoice page with PO pre-selected
    router.push(`/dashboard/invoices/create?po_id=${po.id}`);
  };

  const handleUploadPO = async () => {
    if (!selectedFile || !companyId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('data', selectedFile);
      formData.append('company_id', companyId);

      const response = await fetch(`${process.env.NEXT_PUBLIC_N8N_URL}/webhook/upload-purchase-order`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        alert('Purchase Order uploaded successfully!');
        setShowUploadPOModal(false);
        setSelectedFile(null);
        
        // Wait a bit for the webhook to process and save to database
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Reload pending POs
        await loadPendingPOs(companyId);
      } else {
        const errorText = await response.text();
        console.error('Upload failed:', errorText);
        alert('Upload failed. Please try again.');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Error uploading purchase order.');
    }

    setUploading(false);
  };

  const handleUploadInvoice = async () => {
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
        setShowUploadInvoiceModal(false);
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    try {
      if (invoice.extraction_data?.pdf_url) {
        window.open(invoice.extraction_data.pdf_url, '_blank');
        return;
      }

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const lineItems = invoice.extraction_data?.lineItems || [];
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
      {/* Left Sidebar */}
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
              <h1 className="text-lg font-semibold text-gray-900">A/R {'>'} Invoices</h1>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                setActiveTab('pending-pos');
                setSelectedInvoice(null);
              }}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition ${
                activeTab === 'pending-pos'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Package className="w-4 h-4" />
                Pending POs
              </div>
            </button>
            <button
              onClick={() => {
                setActiveTab('invoices');
                if (filteredInvoices.length > 0 && !selectedInvoice) {
                  setSelectedInvoice(filteredInvoices[0]);
                }
              }}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition ${
                activeTab === 'invoices'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <FileText className="w-4 h-4" />
                Invoices
              </div>
            </button>
            <button
              onClick={() => {
                setActiveTab('matching');
                if (companyId) {
                  loadDeliveryNotes(companyId);
                  loadARMatches(companyId);
                  loadARAnomalies(companyId);
                }
              }}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition ${
                activeTab === 'matching'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Shield className="w-4 h-4" />
                3-Way Match
              </div>
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={activeTab === 'pending-pos' ? 'Search POs...' : 'Search invoices...'}
              value={activeTab === 'pending-pos' ? poSearchTerm : searchTerm}
              onChange={(e) => {
                if (activeTab === 'pending-pos') {
                  setPoSearchTerm(e.target.value);
                } else {
                  setSearchTerm(e.target.value);
                }
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {activeTab === 'pending-pos' ? (
              <button
                onClick={() => setShowUploadPOModal(true)}
                className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload PO
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowUploadInvoiceModal(true)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload
                </button>
                <Link
                  href="/dashboard/invoices/create"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create
                </Link>
              </>
            )}
          </div>

          {/* Filter for Invoices */}
          {activeTab === 'invoices' && (
            <div className="mt-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'pending-pos' ? (
            // Pending POs List
            filteredPOs.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                <Package className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p>No pending purchase orders</p>
                <p className="text-xs mt-1 text-gray-400">Upload a PO to get started</p>
              </div>
            ) : (
              filteredPOs.map((po) => {
                const customerName = po.customers?.company_name || po.customers?.name || 'Unknown';
                
                return (
                  <div
                    key={po.id}
                    className={`p-4 border-b border-gray-100 hover:bg-gray-50 transition ${
                      po.hasInvoice ? 'bg-gray-50/50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{customerName}</div>
                        <div className="text-sm text-gray-500 mt-1">
                          {new Date(po.po_date).toLocaleDateString('en-CA')} | {po.po_number}
                        </div>
                        {po.hasInvoice && po.invoiceNumber && (
                          <div className="text-xs text-blue-600 mt-1">
                            Invoice: {po.invoiceNumber}
                          </div>
                        )}
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        po.hasInvoice 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {po.hasInvoice ? 'Invoiced' : 'Pending'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-sm font-semibold text-gray-900">
                        {po.currency} {parseFloat(po.amount || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="flex gap-2">
                        {po.hasInvoice && po.invoiceId ? (
                          <Link
                            href={`/dashboard/invoices?id=${po.invoiceId}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTab('invoices');
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                          >
                            View Invoice
                          </Link>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateInvoice(po);
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                          >
                            Generate Invoice
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            // Invoices List
            filteredInvoices.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No invoices found
              </div>
            ) : (
              filteredInvoices.map((invoice) => {
                const customerName = invoice.customers?.company_name || invoice.customers?.name || 'Unknown';
                const isSelected = selectedInvoice?.id === invoice.id;
                
                const getMatchStatusColor = (status?: string) => {
                  switch (status) {
                    case 'full_matched':
                      return 'bg-green-100 text-green-800';
                    case 'dn_matched':
                    case 'po_matched':
                      return 'bg-yellow-100 text-yellow-800';
                    default:
                      return 'bg-gray-100 text-gray-800';
                  }
                };

                const getMatchStatusLabel = (status?: string) => {
                  switch (status) {
                    case 'full_matched':
                      return '3-Way Matched';
                    case 'dn_matched':
                      return 'DN Matched';
                    case 'po_matched':
                      return 'PO Matched';
                    default:
                      return 'Unmatched';
                  }
                };
                
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
                      <div className="flex flex-col gap-1 items-end">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(invoice.status)}`}>
                          {getStatusLabel(invoice.status)}
                        </span>
                        {invoice.match_status && (
                          <span className={`px-2 py-1 text-xs font-medium rounded ${getMatchStatusColor(invoice.match_status)}`}>
                            {getMatchStatusLabel(invoice.match_status)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 mt-2">
                      {invoice.currency} {parseFloat(invoice.amount?.toString() || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    {invoice.due_date && (
                      <div className="text-xs text-gray-500 mt-1">
                        Due: {new Date(invoice.due_date).toLocaleDateString('en-CA')}
                      </div>
                    )}
                  </div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'matching' ? (
          // 3-Way Matching View
          <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">3-Way Matching (A/R)</h2>
                  <p className="text-sm text-gray-600 mt-1">Match Customer PO + Delivery Note + Invoice</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowUploadDNModal(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Upload DN
                  </button>
                  <button
                    onClick={handleRun3WayMatch}
                    disabled={matching}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 disabled:bg-gray-400"
                  >
                    {matching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Matching...
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4" />
                        Run 3-Way Match
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-gray-200 px-6">
              <div className="flex gap-4">
                {['overview', 'delivery-notes', 'matches', 'anomalies'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setMatchingTab(tab as any)}
                    className={`py-3 px-4 border-b-2 font-medium transition ${
                      matchingTab === tab
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {matchingTab === 'overview' && (
                <div className="max-w-7xl mx-auto">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <FileText className="w-8 h-8 text-blue-500 mb-2" />
                      <p className="text-2xl font-bold text-gray-900">{deliveryNotes.length}</p>
                      <p className="text-sm text-gray-600">Delivery Notes</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <CheckCircle className="w-8 h-8 text-green-500 mb-2" />
                      <p className="text-2xl font-bold text-gray-900">
                        {arMatches.filter(m => m.match_status === 'perfect').length}
                      </p>
                      <p className="text-sm text-gray-600">Perfect Matches</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
                      <p className="text-2xl font-bold text-gray-900">{arAnomalies.length}</p>
                      <p className="text-sm text-gray-600">Anomalies</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <Shield className="w-8 h-8 text-purple-500 mb-2" />
                      <p className="text-2xl font-bold text-gray-900">{arMatches.length}</p>
                      <p className="text-sm text-gray-600">Total Matches</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">How 3-Way Matching Works</h3>
                    <div className="space-y-3 text-sm text-gray-600">
                      <p>1. Upload Customer Purchase Orders (POs)</p>
                      <p>2. Upload Delivery Notes (DNs) when goods are delivered</p>
                      <p>3. Create Invoices from POs</p>
                      <p>4. Run 3-Way Match to verify PO + DN + Invoice match</p>
                      <p className="mt-4 text-xs text-gray-500">
                        This helps ensure what was ordered matches what was delivered and what was invoiced.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {matchingTab === 'delivery-notes' && (
                <div className="max-w-7xl mx-auto">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">DN Number</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Customer</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">PO Number</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {deliveryNotes.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                              No delivery notes found. Upload a delivery note to get started.
                            </td>
                          </tr>
                        ) : (
                          deliveryNotes.map((dn) => (
                            <tr key={dn.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{dn.dn_number}</td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {dn.customers?.company_name || dn.customers?.name || 'Unknown'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {new Date(dn.dn_date).toLocaleDateString('en-CA')}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {dn.po_id ? 'Linked' : '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                {dn.amount ? parseFloat(dn.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {matchingTab === 'matches' && (
                <div className="max-w-7xl mx-auto">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Match Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">PO</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">DN</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Invoice</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Discrepancy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {arMatches.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                              No matches found. Run 3-way matching to see results.
                            </td>
                          </tr>
                        ) : (
                          arMatches.map((match) => (
                            <tr key={match.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{match.match_type}</td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {match.purchase_order?.po_number || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {match.delivery_note?.dn_number || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {match.invoice?.invoice_number || '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                  match.match_status === 'perfect' 
                                    ? 'bg-green-100 text-green-800'
                                    : match.match_status === 'partial'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {match.match_status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                {match.amount_discrepancy ? match.amount_discrepancy.toFixed(2) : '0.00'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {matchingTab === 'anomalies' && (
                <div className="max-w-7xl mx-auto">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Customer</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Severity</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Description</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Amount</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {arAnomalies.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                              No anomalies found. All documents match perfectly!
                            </td>
                          </tr>
                        ) : (
                          arAnomalies.map((anomaly) => (
                            <tr key={anomaly.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {anomaly.customers?.company_name || anomaly.customers?.name || 'Unknown'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">{anomaly.anomaly_type}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                  anomaly.severity === 'high' 
                                    ? 'bg-red-100 text-red-800'
                                    : anomaly.severity === 'medium'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {anomaly.severity}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">{anomaly.description || '-'}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                {anomaly.discrepancy_amount ? anomaly.discrepancy_amount.toFixed(2) : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                  anomaly.status === 'open' 
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                  {anomaly.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'pending-pos' ? (
          // Pending POs View
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Package className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-lg">Select a purchase order to generate an invoice</p>
              <p className="text-sm mt-2 text-gray-400">
                Purchase orders are waiting to be converted to invoices
              </p>
            </div>
          </div>
        ) : selectedInvoice ? (
          // Invoice Details View
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
                              
                              let vatAmount = 0;
                              let taxRate = 0;
                              if (item.amount && taxableAmount > 0) {
                                vatAmount = item.amount - taxableAmount;
                                taxRate = taxableAmount > 0 ? (vatAmount / taxableAmount) : 0;
                              } else if (selectedInvoice.tax_amount && lineItems.length > 0) {
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

      {/* Upload PO Modal */}
      {showUploadPOModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Upload Purchase Order</h3>
                <button
                  onClick={() => {
                    setShowUploadPOModal(false);
                    setSelectedFile(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select PO File (PDF/Image)
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition cursor-pointer">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="po-upload"
                  />
                  <label htmlFor="po-upload" className="cursor-pointer">
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
                    setShowUploadPOModal(false);
                    setSelectedFile(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadPO}
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
                      Upload PO
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Delivery Note Modal */}
      {showUploadDNModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Upload Delivery Note</h3>
                <button
                  onClick={() => {
                    setShowUploadDNModal(false);
                    setSelectedFile(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Delivery Note File (PDF/Image)
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="dn-upload"
                  />
                  <label htmlFor="dn-upload" className="cursor-pointer">
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
                    setShowUploadDNModal(false);
                    setSelectedFile(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadDN}
                  disabled={!selectedFile || uploading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload DN
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Invoice Modal */}
      {showUploadInvoiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Upload Invoice</h3>
                <button
                  onClick={() => {
                    setShowUploadInvoiceModal(false);
                    setSelectedFile(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Invoice File (PDF/Image)
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
                    setShowUploadInvoiceModal(false);
                    setSelectedFile(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadInvoice}
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

export default function InvoicesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <InvoicesPageContent />
    </Suspense>
  );
}
