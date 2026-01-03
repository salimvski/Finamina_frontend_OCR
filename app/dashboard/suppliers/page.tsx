'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Upload, Search, Filter, TrendingDown, Clock, CheckCircle, 
    AlertTriangle, DollarSign, ArrowLeft, Eye, Edit, Trash2,
    Shield, Zap, Package
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SupplierInvoice {
    id: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    amount: string;
    tax_amount: string;
    currency: string;
    status: 'pending' | 'paid' | 'overdue';
    match_status: 'unmatched' | 'po_matched' | 'full_matched';
    pdf_url: string;
    paid_at: string | null;
    po_id: string | null;
    dn_id: string | null;
    discrepancy_notes: string | null;
    supplier: {
        id: string;
        name: string;
        email: string;
        vat_number: string;
    };
}

export default function SupplierInvoices() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [companyId, setCompanyId] = useState('');
    const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
    const [filteredInvoices, setFilteredInvoices] = useState<SupplierInvoice[]>([]);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'overdue'>('all');
    const [matchFilter, setMatchFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const [stats, setStats] = useState({
        totalInvoices: 0,
        pendingInvoices: 0,
        paidInvoices: 0,
        overdueInvoices: 0,
        totalOwed: 0,
        matchedInvoices: 0,
        unmatchedInvoices: 0,
        anomaliesDetected: 0
    });

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        filterInvoices();
    }, [invoices, searchTerm, statusFilter, matchFilter]);

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
            .from('supplier_invoices')
            .select(`
                *,
                supplier:suppliers(id, name, email, vat_number)
            `)
            .eq('company_id', company_id)
            .order('invoice_date', { ascending: false });

        if (data) {
            // Update status for overdue invoices
            const today = new Date();
            const updatedInvoices = data.map(inv => {
                if (inv.status === 'pending' && new Date(inv.due_date) < today) {
                    return { ...inv, status: 'overdue' };
                }
                return inv;
            });

            setInvoices(updatedInvoices);
            calculateStats(updatedInvoices, company_id);
        }
    };

    const calculateStats = async (invoiceList: SupplierInvoice[], company_id: string) => {
        const totalInvoices = invoiceList.length;
        const pendingInvoices = invoiceList.filter(i => i.status === 'pending').length;
        const paidInvoices = invoiceList.filter(i => i.status === 'paid').length;
        const overdueInvoices = invoiceList.filter(i => i.status === 'overdue').length;

        const totalOwed = invoiceList
            .filter(i => i.status === 'pending' || i.status === 'overdue')
            .reduce((sum, i) => sum + parseFloat(i.amount), 0);

        const matchedInvoices = invoiceList.filter(i => 
            i.match_status === 'full_matched' || i.match_status === 'po_matched'
        ).length;
        const unmatchedInvoices = invoiceList.filter(i => i.match_status === 'unmatched').length;

        // Get anomalies count
        const { data: anomalies } = await supabase
            .from('procurement_anomalies')
            .select('id', { count: 'exact' })
            .eq('company_id', company_id)
            .eq('status', 'open');

        setStats({
            totalInvoices,
            pendingInvoices,
            paidInvoices,
            overdueInvoices,
            totalOwed,
            matchedInvoices,
            unmatchedInvoices,
            anomaliesDetected: anomalies?.length || 0
        });
    };

    const filterInvoices = () => {
        let filtered = [...invoices];

        // Search filter
        if (searchTerm) {
            filtered = filtered.filter(inv =>
                inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inv.supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inv.supplier.email.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(inv => inv.status === statusFilter);
        }

        // Match filter
        if (matchFilter === 'matched') {
            filtered = filtered.filter(inv => 
                inv.match_status === 'full_matched' || inv.match_status === 'po_matched'
            );
        } else if (matchFilter === 'unmatched') {
            filtered = filtered.filter(inv => inv.match_status === 'unmatched');
        }

        setFilteredInvoices(filtered);
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

            const response = await fetch('http://localhost:5678/webhook/upload-supplier-invoice', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                alert('Supplier invoice uploaded successfully!');
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

    const handleDelete = async (invoiceId: string) => {
        if (!confirm('Are you sure you want to delete this invoice?')) return;

        const { error } = await supabase
            .from('supplier_invoices')
            .delete()
            .eq('id', invoiceId);

        if (!error) {
            await loadInvoices(companyId);
        }
    };

    const handleRun3WayMatch = async () => {
        try {
            const response = await fetch('http://localhost:5678/webhook/run-three-way-match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ company_id: companyId })
            });

            if (response.ok) {
                alert('3-way matching completed! Check the Procurement page for results.');
                await loadInvoices(companyId);
            } else {
                alert('3-way matching failed. Please try again.');
            }
        } catch (error) {
            alert('Error running 3-way match.');
        }
    };

    const getDaysUntilDue = (dueDate: string) => {
        const today = new Date();
        const due = new Date(dueDate);
        const diff = due.getTime() - today.getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    // Format date without timezone issues
    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'N/A';
        
        // Parse as local date to avoid timezone shifts
        const [year, month, day] = dateString.split('T')[0].split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        
        if (isNaN(date.getTime())) return 'Invalid date';
        
        return date.toLocaleDateString();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading supplier invoices...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition">
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </Link>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Supplier Invoices</h1>
                                <p className="text-gray-600 mt-1">Manage payments to suppliers (A/P)</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleRun3WayMatch}
                                className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition"
                            >
                                <Zap className="w-5 h-5" />
                                Run 3-Way Match
                            </button>
                            <button
                                onClick={() => setShowUploadModal(true)}
                                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition"
                            >
                                <Upload className="w-5 h-5" />
                                Upload Invoice
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-8 py-8">
                {/* Anomaly Alert */}
                {stats.anomaliesDetected > 0 && (
                    <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 mb-8">
                        <div className="flex items-start gap-4">
                            <AlertTriangle className="w-8 h-8 text-red-600 flex-shrink-0" />
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-red-900 mb-2">
                                    🚨 {stats.anomaliesDetected} Procurement Anomal{stats.anomaliesDetected > 1 ? 'ies' : 'y'} Detected
                                </h3>
                                <p className="text-red-700 mb-3">
                                    Potential fraud or overcharges found. Review immediately to prevent losses.
                                </p>
                                <Link 
                                    href="/dashboard/procurement"
                                    className="inline-block px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold transition"
                                >
                                    Review Anomalies →
                                </Link>
                            </div>
                        </div>
                    </div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <DollarSign className="w-6 h-6 text-purple-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">Total Invoices</p>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{stats.totalInvoices}</p>
                        <p className="text-sm text-gray-500 mt-1">{stats.totalOwed.toFixed(0)} SAR owed</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border-2 border-orange-200 p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-orange-100 rounded-lg">
                                <Clock className="w-6 h-6 text-orange-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">Pending Payment</p>
                        </div>
                        <p className="text-3xl font-bold text-orange-600">{stats.pendingInvoices}</p>
                        <p className="text-sm text-gray-500 mt-1">{stats.overdueInvoices} overdue</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border-2 border-green-200 p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <CheckCircle className="w-6 h-6 text-green-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">Paid</p>
                        </div>
                        <p className="text-3xl font-bold text-green-600">{stats.paidInvoices}</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border-2 border-blue-200 p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <Shield className="w-6 h-6 text-blue-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">3-Way Matched</p>
                        </div>
                        <p className="text-3xl font-bold text-blue-600">{stats.matchedInvoices}</p>
                        <p className="text-sm text-gray-500 mt-1">{stats.unmatchedInvoices} unmatched</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by invoice #, supplier name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                        </div>

                        {/* Status Filter */}
                        <div className="relative">
                            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none bg-white"
                            >
                                <option value="all">All Status</option>
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                                <option value="overdue">Overdue</option>
                            </select>
                        </div>

                        {/* Match Filter */}
                        <div className="relative">
                            <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <select
                                value={matchFilter}
                                onChange={(e) => setMatchFilter(e.target.value as any)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none bg-white"
                            >
                                <option value="all">All Matches</option>
                                <option value="matched">Matched (3-Way)</option>
                                <option value="unmatched">Unmatched</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Invoices Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {filteredInvoices.length === 0 ? (
                        <div className="p-12 text-center">
                            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-xl text-gray-600 mb-2">No supplier invoices found</p>
                            <p className="text-gray-500 mb-4">
                                {searchTerm ? 'Try a different search term' : 'Upload your first supplier invoice to get started'}
                            </p>
                            <button
                                onClick={() => setShowUploadModal(true)}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                            >
                                <Upload className="w-5 h-5" />
                                Upload Invoice
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Invoice #</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Supplier</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Due Date</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase">Match Status</th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredInvoices.map((invoice) => {
                                        const daysUntilDue = getDaysUntilDue(invoice.due_date);
                                        const hasDiscrepancy = invoice.discrepancy_notes !== null;
                                        
                                        return (
                                            <tr key={invoice.id} className={`hover:bg-gray-50 transition ${
                                                hasDiscrepancy ? 'bg-red-50' : ''
                                            }`}>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-semibold text-gray-900">{invoice.invoice_number}</p>
                                                    {hasDiscrepancy && (
                                                        <p className="text-xs text-red-600 mt-1">⚠️ Discrepancy</p>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-medium text-gray-900">{invoice.supplier.name}</p>
                                                    <p className="text-xs text-gray-600">{invoice.supplier.vat_number}</p>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                    {formatDate(invoice.invoice_date)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm text-gray-900">
                                                        {formatDate(invoice.due_date)}
                                                    </p>
                                                    {invoice.status === 'pending' && (
                                                        <p className={`text-xs ${
                                                            daysUntilDue < 0 ? 'text-red-600' :
                                                            daysUntilDue <= 7 ? 'text-orange-600' :
                                                            'text-gray-600'
                                                        }`}>
                                                            {daysUntilDue < 0 ? `${Math.abs(daysUntilDue)}d overdue` : `${daysUntilDue}d left`}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <p className="text-sm font-bold text-gray-900">
                                                        {parseFloat(invoice.amount).toFixed(2)} {invoice.currency}
                                                    </p>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                                                        invoice.match_status === 'full_matched' ? 'bg-blue-100 text-blue-800' :
                                                        invoice.match_status === 'po_matched' ? 'bg-purple-100 text-purple-800' :
                                                        'bg-gray-100 text-gray-800'
                                                    }`}>
                                                        {invoice.match_status === 'full_matched' && <Shield className="w-3 h-3" />}
                                                        {invoice.match_status === 'full_matched' ? '3-Way' :
                                                         invoice.match_status === 'po_matched' ? 'PO Only' :
                                                         'Unmatched'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                                                        invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                                                        invoice.status === 'overdue' ? 'bg-red-100 text-red-800' :
                                                        'bg-orange-100 text-orange-800'
                                                    }`}>
                                                        {invoice.status === 'paid' && <CheckCircle className="w-3 h-3" />}
                                                        {invoice.status === 'overdue' && <AlertTriangle className="w-3 h-3" />}
                                                        {invoice.status === 'pending' && <Clock className="w-3 h-3" />}
                                                        {invoice.status.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <Link
                                                            href={`/dashboard/suppliers/invoices/${invoice.id}`}
                                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                            title="View"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </Link>
                                                        <button
                                                            onClick={() => handleDelete(invoice.id)}
                                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Info Box */}
                {stats.unmatchedInvoices > 0 && (
                    <div className="mt-6 bg-purple-50 border-2 border-purple-200 rounded-xl p-6">
                        <div className="flex items-start gap-4">
                            <Shield className="w-8 h-8 text-purple-600 flex-shrink-0" />
                            <div>
                                <h3 className="text-lg font-bold text-purple-900 mb-2">
                                    💡 {stats.unmatchedInvoices} Invoice{stats.unmatchedInvoices > 1 ? 's' : ''} Need{stats.unmatchedInvoices === 1 ? 's' : ''} 3-Way Matching
                                </h3>
                                <p className="text-purple-700 mb-3">
                                    Click "Run 3-Way Match" to automatically verify these invoices against Purchase Orders and Delivery Notes. This helps detect fraud, overcharges, and quantity discrepancies.
                                </p>
                                <button
                                    onClick={handleRun3WayMatch}
                                    className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition"
                                >
                                    Run 3-Way Match Now →
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">Upload Supplier Invoice</h3>
                        
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Select Invoice (PDF or Image)
                            </label>
                            <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={handleFileSelect}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                            />
                            {selectedFile && (
                                <p className="text-sm text-gray-600 mt-2">
                                    Selected: {selectedFile.name}
                                </p>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowUploadModal(false);
                                    setSelectedFile(null);
                                }}
                                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                                disabled={uploading}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpload}
                                disabled={!selectedFile || uploading}
                                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {uploading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Uploading...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-4 h-4" />
                                        Upload
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}