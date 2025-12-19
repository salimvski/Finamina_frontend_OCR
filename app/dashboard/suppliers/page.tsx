'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Upload, Loader2, FileText, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';

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
    const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ stage: 'idle', message: '' });
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

    const validateFile = (file: File): { valid: boolean; error?: string } => {
        // Check file type
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        if (!validTypes.includes(file.type)) {
            return { valid: false, error: 'Only PDF, JPG, and PNG files are allowed' };
        }

        // Check file size (10MB max)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            return { valid: false, error: 'File size must be less than 10MB' };
        }

        return { valid: true };
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !companyId) return;

        // Validate file
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

        // Start upload process
        setUploadStatus({
            stage: 'uploading',
            message: 'Uploading file...',
            fileName: file.name
        });

        const formData = new FormData();
        formData.append('data', file);
        formData.append('company_id', companyId);

        try {
            // Stage 1: Uploading
            await new Promise(resolve => setTimeout(resolve, 500));

            // Stage 2: OCR Processing
            setUploadStatus({
                stage: 'ocr',
                message: 'Reading invoice with AI...',
                fileName: file.name
            });

            const response = await fetch('http://localhost:5678/webhook/upload-supplier-invoice', {
                method: 'POST',
                body: formData
            });

            // Get response text regardless of status
            const responseText = await response.text();

            // Check for errors in response (even if status is 200)
            if (!response.ok || responseText.includes('duplicate key') || responseText.includes('already exists') || responseText.includes('error')) {

                // Check for duplicate invoice
                if (responseText.includes('duplicate key') || responseText.includes('already exists')) {
                    const invoiceMatch = responseText.match(/invoice_number\)=\([^,]+,\s*([^)]+)\)/);
                    const invoiceNumber = invoiceMatch ? invoiceMatch[1] : 'this invoice';
                    throw new Error(`Invoice ${invoiceNumber} already exists in your system`);
                }

                // Other SQL errors
                if (responseText.includes('violates') || responseText.includes('constraint')) {
                    throw new Error('Database error: This invoice conflicts with existing data');
                }

                throw new Error('Upload failed. Please try again.');
            }

            // Stage 3: Saving
            setUploadStatus({
                stage: 'saving',
                message: 'Saving to database...',
                fileName: file.name
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            // Stage 4: Success
            setUploadStatus({
                stage: 'success',
                message: 'Invoice uploaded successfully!',
                fileName: file.name
            });

            // Refresh list
            await loadSupplierInvoices();

            // Reset after 3 seconds
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

            // Clear error after 8 seconds
            setTimeout(() => {
                setUploadStatus({ stage: 'idle', message: '' });
            }, 8000);
        } finally {
            // Reset file input
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
        totalOwed: supplierInvoices
            .filter(inv => inv.status === 'pending')
            .reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0),
        totalPaid: supplierInvoices
            .filter(inv => inv.status === 'paid')
            .reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0),
    };

    // Filter invoices
    const filteredInvoices = filterStatus === 'all'
        ? supplierInvoices
        : supplierInvoices.filter(inv => inv.status === filterStatus);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Supplier Invoices</h1>
                <p className="text-gray-600">Track invoices you need to pay to suppliers</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-sm text-gray-600 mb-1">Total Invoices</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-sm text-gray-600 mb-1">Pending</p>
                    <p className="text-2xl font-bold text-orange-600">{stats.pending}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-sm text-gray-600 mb-1">Paid</p>
                    <p className="text-2xl font-bold text-green-600">{stats.paid}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-sm text-gray-600 mb-1">Total Owed</p>
                    <p className="text-2xl font-bold text-red-600">{stats.totalOwed.toFixed(2)} SAR</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-sm text-gray-600 mb-1">Total Paid</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalPaid.toFixed(2)} SAR</p>
                </div>
            </div>

            {/* Upload Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Upload Supplier Invoice</h3>
                        <p className="text-sm text-gray-600 mb-4">Upload invoices you need to pay (PDF, JPG, PNG - Max 10MB)</p>

                        {/* Upload Status Messages */}
                        {uploadStatus.stage !== 'idle' && (
                            <div className={`mb-4 p-4 rounded-lg border ${uploadStatus.stage === 'success' ? 'bg-green-50 border-green-200' :
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
                                        <p className={`font-medium ${uploadStatus.stage === 'success' ? 'text-green-900' :
                                                uploadStatus.stage === 'error' ? 'text-red-900' :
                                                    'text-blue-900'
                                            }`}>
                                            {uploadStatus.fileName}
                                        </p>
                                        <p className={`text-sm ${uploadStatus.stage === 'success' ? 'text-green-700' :
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

                                        {/* Progress steps */}
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

                    <div>
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
                            className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium cursor-pointer transition ${uploadStatus.stage !== 'idle'
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
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
                <div className="flex gap-2">
                    <button
                        onClick={() => setFilterStatus('all')}
                        className={`px-4 py-2 rounded-lg font-medium transition ${filterStatus === 'all'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        All ({stats.total})
                    </button>
                    <button
                        onClick={() => setFilterStatus('pending')}
                        className={`px-4 py-2 rounded-lg font-medium transition ${filterStatus === 'pending'
                                ? 'bg-orange-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        Pending ({stats.pending})
                    </button>
                    <button
                        onClick={() => setFilterStatus('paid')}
                        className={`px-4 py-2 rounded-lg font-medium transition ${filterStatus === 'paid'
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        Paid ({stats.paid})
                    </button>
                </div>
            </div>

            {/* Invoices Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filteredInvoices.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center">
                                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                    <p className="text-gray-500">No supplier invoices found</p>
                                    <p className="text-sm text-gray-400 mt-1">Upload your first invoice to get started</p>
                                </td>
                            </tr>
                        ) : (
                            filteredInvoices.map((invoice) => (
                                <tr key={invoice.id} className="hover:bg-gray-50 cursor-pointer">
                                    <td className="px-6 py-4">
                                        <Link href={`/dashboard/suppliers/invoices/${invoice.id}`} className="text-blue-600 hover:underline font-medium">
                                            {invoice.invoice_number}
                                        </Link>
                                    </td>
                                    <td className="px-6 py-4 text-gray-900">{invoice.supplier?.name || 'Unknown'}</td>
                                    <td className="px-6 py-4 text-gray-600">{new Date(invoice.invoice_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 text-gray-600">{new Date(invoice.due_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 font-medium text-gray-900">
                                        {parseFloat(invoice.amount).toFixed(2)} {invoice.currency}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${invoice.status === 'paid'
                                                ? 'bg-green-100 text-green-800'
                                                : invoice.status === 'pending'
                                                    ? 'bg-orange-100 text-orange-800'
                                                    : 'bg-gray-100 text-gray-800'
                                            }`}>
                                            {invoice.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}