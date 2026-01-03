'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Upload, Loader2, FileText, CheckCircle, XCircle, AlertCircle, 
    Search, ArrowLeft, RefreshCw, Eye, Edit, Trash2, TrendingDown,
    Clock, DollarSign, Package, AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SupplierInvoice {
    id: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    amount: string;
    currency: string;
    status: string;
    supplier: {
        name: string;
    };
}

interface UploadStatus {
    stage: 'idle' | 'uploading' | 'ocr' | 'saving' | 'success' | 'error';
    message: string;
    fileName?: string;
    error?: string;
}

export default function SuppliersPage() {
    const router = useRouter();
    const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ stage: 'idle', message: '' });
    const [reconciling, setReconciling] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [companyId, setCompanyId] = useState<string>('');

    useEffect(() => {
        loadSupplierInvoices();
        getCompanyId();
    }, []);

    const getCompanyId = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('users')
                .select('company_id')
                .eq('auth_user_id', user.id)
                .single();
            if (data) setCompanyId(data.company_id);
        }
    };

    const loadSupplierInvoices = async () => {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return;

        const { data: userData } = await supabase
            .from('users')
            .select('company_id')
            .eq('auth_user_id', user.id)
            .single();

        if (!userData) return;

        const { data, error } = await supabase
            .from('supplier_invoices')
            .select(`
                *,
                supplier:suppliers(name)
            `)
            .eq('company_id', userData.company_id)
            .order('created_at', { ascending: false });

        if (data) {
            setSupplierInvoices(data);
        }
        setLoading(false);
    };

    const handleReconcile = async () => {
        if (!companyId) return;
        
        setReconciling(true);
        try {
            const response = await fetch('http://localhost:5678/webhook/reconcile-suppliers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ company_id: companyId })
            });

            if (response.ok) {
                alert('Reconciliation completed! Check your invoices.');
                loadSupplierInvoices();
            } else {
                alert('Reconciliation failed. Please try again.');
            }
        } catch (error) {
            alert('Error during reconciliation');
        } finally {
            setReconciling(false);
        }
    };

    const handleDelete = async (id: string, invoiceNumber: string) => {
        if (!confirm(`Delete invoice ${invoiceNumber}?`)) return;

        const { error } = await supabase
            .from('supplier_invoices')
            .delete()
            .eq('id', id);

        if (!error) {
            loadSupplierInvoices();
        } else {
            alert('Failed to delete invoice');
        }
    };

    const validateFile = (file: File): { valid: boolean; error?: string } => {
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        if (!validTypes.includes(file.type)) {
            return { valid: false, error: 'Only PDF, JPG, and PNG files are allowed' };
        }

        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            return { valid: false, error: 'File size must be less than 10MB' };
        }

        return { valid: true };
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !companyId) return;

        const validation = validateFile(file);
        if (!validation.valid) {
            setUploadStatus({
                stage: 'error',
                message: validation.error || 'Invalid file',
                fileName: file.name,
                error: validation.error
            });
            if (fileInputRef.current) fileInputRef.current.value = '';
            setTimeout(() => setUploadStatus({ stage: 'idle', message: '' }), 5000);
            return;
        }

        setUploadStatus({
            stage: 'uploading',
            message: 'Uploading file...',
            fileName: file.name
        });

        const formData = new FormData();
        formData.append('data', file);
        formData.append('company_id', companyId);

        try {
            await new Promise(resolve => setTimeout(resolve, 500));

            setUploadStatus({
                stage: 'ocr',
                message: 'Reading invoice with AI...',
                fileName: file.name
            });

            const response = await fetch('http://localhost:5678/webhook/upload-supplier-invoice', {
                method: 'POST',
                body: formData
            });

            const responseText = await response.text();

            if (!response.ok || responseText.includes('duplicate key') || responseText.includes('already exists') || responseText.includes('error')) {
                if (responseText.includes('duplicate key') || responseText.includes('already exists')) {
                    const invoiceMatch = responseText.match(/invoice_number\)=\([^,]+,\s*([^)]+)\)/);
                    const invoiceNumber = invoiceMatch ? invoiceMatch[1] : 'this invoice';
                    throw new Error(`Invoice ${invoiceNumber} already exists in your system`);
                }

                if (responseText.includes('violates') || responseText.includes('constraint')) {
                    throw new Error('Database error: This invoice conflicts with existing data');
                }

                throw new Error('Upload failed. Please try again.');
            }

            setUploadStatus({
                stage: 'saving',
                message: 'Saving to database...',
                fileName: file.name
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            setUploadStatus({
                stage: 'success',
                message: 'Invoice uploaded successfully!',
                fileName: file.name
            });

            await loadSupplierInvoices();

            setTimeout(() => {
                setUploadStatus({ stage: 'idle', message: '' });
            }, 3000);

        } catch (error: any) {
            console.error('Upload error:', error);
            setUploadStatus({
                stage: 'error',
                message: 'Upload failed',
                fileName: file.name,
                error: error.message || 'An unexpected error occurred. Please try again.'
            });

            setTimeout(() => {
                setUploadStatus({ stage: 'idle', message: '' });
            }, 8000);
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // Calculate stats
    const stats = {
        total: supplierInvoices.length,
        pending: supplierInvoices.filter(inv => inv.status === 'pending').length,
        paid: supplierInvoices.filter(inv => inv.status === 'paid').length,
        overdue: supplierInvoices.filter(inv => inv.status === 'overdue').length,
        totalOwed: supplierInvoices
            .filter(inv => inv.status === 'pending')
            .reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0),
    };

    // Filter and search invoices
    const filteredInvoices = supplierInvoices.filter(invoice => {
        const matchesStatus = filterStatus === 'all' || invoice.status === filterStatus;
        const matchesSearch = 
            invoice.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            invoice.supplier?.name?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link
                                href="/dashboard"
                                className="p-2 hover:bg-gray-100 rounded-lg transition"
                            >
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </Link>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Supplier Invoices</h1>
                                <p className="text-gray-600 mt-1">Manage your accounts payable</p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleReconcile}
                                disabled={reconciling}
                                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                {reconciling ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Reconciling...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="w-5 h-5" />
                                        Auto-Reconcile
                                    </>
                                )}
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,.pdf"
                                onChange={handleFileUpload}
                                className="hidden"
                                id="supplier-invoice-upload"
                                disabled={uploadStatus.stage !== 'idle'}
                            />
                            <label
                                htmlFor="supplier-invoice-upload"
                                className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium cursor-pointer transition ${
                                    uploadStatus.stage !== 'idle'
                                        ? 'bg-gray-400 cursor-not-allowed text-white'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                                }`}
                            >
                                {uploadStatus.stage !== 'idle' ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-5 h-5" />
                                        Upload Invoice
                                    </>
                                )}
                            </label>
                        </div>
                    </div>

                    {/* Upload Status */}
                    {uploadStatus.stage !== 'idle' && (
                        <div className={`mt-4 p-4 rounded-lg border ${
                            uploadStatus.stage === 'success' ? 'bg-green-50 border-green-200' :
                            uploadStatus.stage === 'error' ? 'bg-red-50 border-red-200' :
                            'bg-blue-50 border-blue-200'
                        }`}>
                            <div className="flex items-start gap-3">
                                {uploadStatus.stage === 'success' && <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />}
                                {uploadStatus.stage === 'error' && <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
                                {['uploading', 'ocr', 'saving'].includes(uploadStatus.stage) && (
                                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0 mt-0.5" />
                                )}

                                <div className="flex-1">
                                    <p className={`font-medium ${
                                        uploadStatus.stage === 'success' ? 'text-green-900' :
                                        uploadStatus.stage === 'error' ? 'text-red-900' :
                                        'text-blue-900'
                                    }`}>
                                        {uploadStatus.fileName}
                                    </p>
                                    <p className={`text-sm ${
                                        uploadStatus.stage === 'success' ? 'text-green-700' :
                                        uploadStatus.stage === 'error' ? 'text-red-700' :
                                        'text-blue-700'
                                    }`}>
                                        {uploadStatus.message}
                                    </p>
                                    {uploadStatus.error && (
                                        <p className="text-sm text-red-600 mt-2">
                                            {uploadStatus.error}
                                        </p>
                                    )}

                                    {['uploading', 'ocr', 'saving'].includes(uploadStatus.stage) && (
                                        <div className="flex gap-2 mt-3">
                                            <div className={`h-1 flex-1 rounded ${uploadStatus.stage === 'uploading' ? 'bg-blue-600' : 'bg-blue-200'}`} />
                                            <div className={`h-1 flex-1 rounded ${uploadStatus.stage === 'ocr' ? 'bg-blue-600' : uploadStatus.stage === 'saving' ? 'bg-blue-200' : 'bg-gray-200'}`} />
                                            <div className={`h-1 flex-1 rounded ${uploadStatus.stage === 'saving' ? 'bg-blue-600' : 'bg-gray-200'}`} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-8 py-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
                        <div className="flex items-center justify-between mb-3">
                            <Package className="w-10 h-10 text-blue-500" />
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                        <p className="text-sm text-gray-600">Total Invoices</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
                        <div className="flex items-center justify-between mb-3">
                            <Clock className="w-10 h-10 text-orange-500" />
                        </div>
                        <p className="text-2xl font-bold text-orange-600">{stats.pending}</p>
                        <p className="text-sm text-gray-600">Pending Payment</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
                        <div className="flex items-center justify-between mb-3">
                            <CheckCircle className="w-10 h-10 text-green-500" />
                        </div>
                        <p className="text-2xl font-bold text-green-600">{stats.paid}</p>
                        <p className="text-sm text-gray-600">Paid</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
                        <div className="flex items-center justify-between mb-3">
                            <DollarSign className="w-10 h-10 text-red-500" />
                        </div>
                        <p className="text-2xl font-bold text-red-600">{stats.totalOwed.toFixed(2)}</p>
                        <p className="text-sm text-gray-600">Total Owed (SAR)</p>
                    </div>
                </div>

                {/* Search and Filters */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input
                                type="text"
                                placeholder="Search by invoice # or supplier name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setFilterStatus('all')}
                                className={`px-4 py-2.5 rounded-lg font-medium transition ${
                                    filterStatus === 'all'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                All ({stats.total})
                            </button>
                            <button
                                onClick={() => setFilterStatus('pending')}
                                className={`px-4 py-2.5 rounded-lg font-medium transition ${
                                    filterStatus === 'pending'
                                        ? 'bg-orange-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                Pending ({stats.pending})
                            </button>
                            <button
                                onClick={() => setFilterStatus('paid')}
                                className={`px-4 py-2.5 rounded-lg font-medium transition ${
                                    filterStatus === 'paid'
                                        ? 'bg-green-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                Paid ({stats.paid})
                            </button>
                        </div>
                    </div>
                </div>

                {/* Invoices Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {filteredInvoices.length === 0 ? (
                        <div className="p-16 text-center">
                            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-xl text-gray-600 mb-2">No invoices found</p>
                            <p className="text-gray-500">
                                {searchQuery ? 'Try a different search term' : 'Upload your first supplier invoice to get started'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Invoice #
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Supplier
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Invoice Date
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Due Date
                                        </th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Amount
                                        </th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Status
                                        </th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {filteredInvoices.map((invoice) => (
                                        <tr key={invoice.id} className="hover:bg-gray-50 transition">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Link 
                                                    href={`/dashboard/suppliers/invoices/${invoice.id}`}
                                                    className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
                                                >
                                                    {invoice.invoice_number}
                                                </Link>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-sm font-medium text-gray-900">
                                                    {invoice.supplier?.name || 'Unknown'}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                {new Date(invoice.invoice_date).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                {new Date(invoice.due_date).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <p className="text-sm font-semibold text-gray-900">
                                                    {parseFloat(invoice.amount).toFixed(2)} {invoice.currency}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                                                    invoice.status === 'paid'
                                                        ? 'bg-green-100 text-green-800'
                                                        : invoice.status === 'pending'
                                                        ? 'bg-orange-100 text-orange-800'
                                                        : 'bg-red-100 text-red-800'
                                                }`}>
                                                    {invoice.status.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => router.push(`/dashboard/suppliers/invoices/${invoice.id}`)}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                        title="View"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => router.push(`/dashboard/suppliers/invoices/${invoice.id}/edit`)}
                                                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                                                        title="Edit"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(invoice.id, invoice.invoice_number)}
                                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}