'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Upload, Search, Filter, TrendingUp, Clock, CheckCircle, 
    AlertTriangle, DollarSign, ArrowLeft, Eye, Edit, Trash2,
    Send, Download, Calendar
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

interface CustomerInvoice {
    id: string;
    invoice_number: string;
    invoice_date: string | null;
    due_date: string | null;
    amount: string;
    tax_amount: string;
    currency: string;
    status: 'pending' | 'paid' | 'overdue' | 'cancelled';
    pdf_url: string;
    paid_at: string | null;
    customer: {
        id: string;
        name: string;
        email: string;
    };
}

export default function CustomerInvoices() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [companyId, setCompanyId] = useState('');
    const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
    const [filteredInvoices, setFilteredInvoices] = useState<CustomerInvoice[]>([]);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'overdue'>('all');
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const [stats, setStats] = useState({
        totalInvoices: 0,
        pendingInvoices: 0,
        paidInvoices: 0,
        overdueInvoices: 0,
        totalAmount: 0,
        pendingAmount: 0,
        paidAmount: 0,
        averageDSO: 0
    });

    useEffect(() => {
        loadData();
    }, []);

    // Check if we should open upload modal from URL parameter
    useEffect(() => {
        const uploadParam = searchParams.get('upload');
        if (uploadParam === 'customer' && !loading && companyId) {
            setShowUploadModal(true);
            // Clean up URL parameter
            router.replace('/dashboard', { scroll: false });
        }
    }, [searchParams, loading, companyId, router]);

    useEffect(() => {
        filterInvoices();
    }, [invoices, searchTerm, statusFilter]);

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
                customer:customers(id, name, email)
            `)
            .eq('company_id', company_id)
            .order('invoice_date', { ascending: false });

        if (data) {
            console.log('Raw invoice data:', data); // Debug log
            
            // Update status for overdue invoices
            const today = new Date();
            const updatedInvoices = data.map(inv => {
                // Only update status if we have a valid due_date
                if (inv.status === 'pending' && inv.due_date) {
                    const dueDate = new Date(inv.due_date);
                    if (!isNaN(dueDate.getTime()) && dueDate < today) {
                        return { ...inv, status: 'overdue' };
                    }
                }
                return inv;
            });

            setInvoices(updatedInvoices);
            calculateStats(updatedInvoices);
        } else if (error) {
            console.error('Error loading invoices:', error);
        }
    };

    const calculateStats = (invoiceList: CustomerInvoice[]) => {
        const totalInvoices = invoiceList.length;
        const pendingInvoices = invoiceList.filter(i => i.status === 'pending').length;
        const paidInvoices = invoiceList.filter(i => i.status === 'paid').length;
        const overdueInvoices = invoiceList.filter(i => i.status === 'overdue').length;

        const totalAmount = invoiceList.reduce((sum, i) => sum + parseFloat(i.amount), 0);
        const pendingAmount = invoiceList
            .filter(i => i.status === 'pending' || i.status === 'overdue')
            .reduce((sum, i) => sum + parseFloat(i.amount), 0);
        const paidAmount = invoiceList
            .filter(i => i.status === 'paid')
            .reduce((sum, i) => sum + parseFloat(i.amount), 0);

        // Calculate DSO (Days Sales Outstanding)
        const paidInvs = invoiceList.filter(i => 
            i.status === 'paid' && 
            i.paid_at && 
            i.invoice_date &&
            !isNaN(new Date(i.paid_at).getTime()) &&
            !isNaN(new Date(i.invoice_date).getTime())
        );
        
        const avgDSO = paidInvs.length > 0
            ? paidInvs.reduce((sum, inv) => {
                if (!inv.invoice_date || !inv.paid_at) return sum;
                const invoiceDate = new Date(inv.invoice_date);
                const paidDate = new Date(inv.paid_at);
                const days = Math.floor((paidDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
                return sum + days;
            }, 0) / paidInvs.length
            : 0;

        setStats({
            totalInvoices,
            pendingInvoices,
            paidInvoices,
            overdueInvoices,
            totalAmount,
            pendingAmount,
            paidAmount,
            averageDSO: Math.round(avgDSO)
        });
    };

    const filterInvoices = () => {
        let filtered = [...invoices];

        // Search filter
        if (searchTerm) {
            filtered = filtered.filter(inv =>
                inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inv.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inv.customer.email.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(inv => inv.status === statusFilter);
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

    const handleDelete = async (invoiceId: string) => {
        if (!confirm('Are you sure you want to delete this invoice?')) return;

        const { error } = await supabase
            .from('invoices')
            .delete()
            .eq('id', invoiceId);

        if (!error) {
            await loadInvoices(companyId);
        }
    };

    const getDaysUntilDue = (dueDate: string | null) => {
        if (!dueDate) return 0;
        
        const today = new Date();
        const due = new Date(dueDate);
        
        // Check if date is valid
        if (isNaN(due.getTime())) return 0;
        
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
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading invoices...</p>
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
                                <h1 className="text-3xl font-bold text-gray-900">Customer Invoices</h1>
                                <p className="text-gray-600 mt-1">Track payments from customers (A/R)</p>
                            </div>
                        </div>
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

            <div className="max-w-7xl mx-auto px-8 py-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <DollarSign className="w-6 h-6 text-blue-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">Total Invoices</p>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{stats.totalInvoices}</p>
                        <p className="text-sm text-gray-500 mt-1">{stats.totalAmount.toFixed(0)} SAR</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border-2 border-orange-200 p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-orange-100 rounded-lg">
                                <Clock className="w-6 h-6 text-orange-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">Pending</p>
                        </div>
                        <p className="text-3xl font-bold text-orange-600">{stats.pendingInvoices}</p>
                        <p className="text-sm text-gray-500 mt-1">{stats.pendingAmount.toFixed(0)} SAR</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border-2 border-green-200 p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <CheckCircle className="w-6 h-6 text-green-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">Paid</p>
                        </div>
                        <p className="text-3xl font-bold text-green-600">{stats.paidInvoices}</p>
                        <p className="text-sm text-gray-500 mt-1">{stats.paidAmount.toFixed(0)} SAR</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border-2 border-red-200 p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-red-100 rounded-lg">
                                <AlertTriangle className="w-6 h-6 text-red-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">Overdue</p>
                        </div>
                        <p className="text-3xl font-bold text-red-600">{stats.overdueInvoices}</p>
                        <p className="text-sm text-gray-500 mt-1">DSO: {stats.averageDSO}d</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by invoice #, customer name, or email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        {/* Status Filter */}
                        <div className="relative">
                            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                            >
                                <option value="all">All Status</option>
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                                <option value="overdue">Overdue</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Invoices Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {filteredInvoices.length === 0 ? (
                        <div className="p-12 text-center">
                            <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-xl text-gray-600 mb-2">No invoices found</p>
                            <p className="text-gray-500 mb-4">
                                {searchTerm ? 'Try a different search term' : 'Upload your first customer invoice to get started'}
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
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Customer</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Due Date</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredInvoices.map((invoice) => {
                                        return (
                                            <tr key={invoice.id} className="hover:bg-gray-50 transition">
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-semibold text-gray-900">{invoice.invoice_number}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-medium text-gray-900">{invoice.customer.name}</p>
                                                    <p className="text-xs text-gray-600">{invoice.customer.email}</p>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                    {formatDate(invoice.invoice_date)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {invoice.due_date ? (
                                                        <>
                                                            <p className="text-sm text-gray-900">
                                                                {formatDate(invoice.due_date)}
                                                            </p>
                                                            {invoice.status === 'pending' && (() => {
                                                                const daysUntilDue = getDaysUntilDue(invoice.due_date);
                                                                return (
                                                                    <p className={`text-xs ${
                                                                        daysUntilDue < 0 ? 'text-red-600' :
                                                                        daysUntilDue <= 7 ? 'text-orange-600' :
                                                                        'text-gray-600'
                                                                    }`}>
                                                                        {daysUntilDue < 0 ? `${Math.abs(daysUntilDue)}d overdue` : `${daysUntilDue}d left`}
                                                                    </p>
                                                                );
                                                            })()}
                                                        </>
                                                    ) : (
                                                        <p className="text-sm text-gray-400">No due date</p>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <p className="text-sm font-bold text-gray-900">
                                                        {parseFloat(invoice.amount).toFixed(2)} {invoice.currency}
                                                    </p>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                                                        invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                                                        invoice.status === 'overdue' ? 'bg-red-100 text-red-800' :
                                                        invoice.status === 'pending' ? 'bg-orange-100 text-orange-800' :
                                                        'bg-gray-100 text-gray-800'
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
                                                            href={`/dashboard/invoices/${invoice.id}`}
                                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                            title="View"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </Link>
                                                        <Link
                                                            href={`/dashboard/invoices/${invoice.id}/edit`}
                                                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                                                            title="Edit"
                                                        >
                                                            <Edit className="w-4 h-4" />
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
            </div>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">Upload Customer Invoice</h3>
                        
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Select Invoice (PDF or Image)
                            </label>
                            <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={handleFileSelect}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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