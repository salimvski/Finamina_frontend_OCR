'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Upload, FileText, DollarSign, Clock, CheckCircle, Loader2 } from 'lucide-react';

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [company, setCompany] = useState<any>(null);
    const [companyId, setCompanyId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string>('');
    const [invoices, setInvoices] = useState<any[]>([]);
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        paid: 0,
        totalAmount: 0
    });

    useEffect(() => {
        checkUser();
    }, []);

    useEffect(() => {
        if (companyId) {
            loadInvoices();
        }
    }, [companyId]);

    const checkUser = async () => {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            router.push('/login');
            return;
        }

        setUser(session.user);

        // Get company info
        const { data: userData } = await supabase
            .from('users')
            .select('company_id, companies(name)')
            .eq('auth_user_id', session.user.id)
            .single();

        if (userData) {
            setCompany(userData.companies);
            setCompanyId(userData.company_id);
        }

        setLoading(false);
    };

    const loadInvoices = async () => {
        const { data, error } = await supabase
            .from('invoices')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (data) {
            setInvoices(data);

            // Calculate stats
            const total = data.length;
            const pending = data.filter(i => i.status === 'pending').length;
            const paid = data.filter(i => i.status === 'paid').length;
            const totalAmount = data.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

            setStats({ total, pending, paid, totalAmount });
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setUploadStatus('Uploading and processing invoice...');

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const formData = new FormData();
            formData.append('data', file);
            formData.append('company_id', companyId);

            const response = await fetch('http://localhost:5678/webhook/upload-invoice', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const result = await response.json();

            setUploadStatus('✅ Invoice processed successfully!');

            // Reload invoices
            setTimeout(() => {
                loadInvoices();
                setUploadStatus('');
            }, 2000);

        } catch (error: any) {
            setUploadStatus(`❌ Error: ${error.message}`);
        } finally {
            setUploading(false);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Finamina</h1>
                        <p className="text-sm text-gray-600">{company?.name}</p>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="text-gray-600 hover:text-gray-900 font-medium"
                    >
                        Sign Out
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Welcome */}
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">
                        Welcome back! 👋
                    </h2>
                    <p className="text-gray-600">
                        Manage your invoices and track payments
                    </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-600 text-sm">Total Invoices</span>
                            <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-600 text-sm">Pending</span>
                            <Clock className="w-5 h-5 text-yellow-600" />
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{stats.pending}</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-600 text-sm">Paid</span>
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{stats.paid}</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-600 text-sm">Total Amount</span>
                            <DollarSign className="w-5 h-5 text-blue-600" />
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{stats.totalAmount.toFixed(2)} SAR</p>
                    </div>
                </div>

                {/* Upload Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 mb-8">
                    <div className="text-center">
                        <Upload className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-gray-900 mb-2">
                            Upload Invoice
                        </h3>
                        <p className="text-gray-600 mb-6">
                            Upload PDF or image files for automatic processing
                        </p>

                        <label className="inline-block">
                            <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={handleFileUpload}
                                disabled={uploading}
                                className="hidden"
                            />
                            <span className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition cursor-pointer inline-flex items-center gap-2 disabled:opacity-50">
                                {uploading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-5 h-5" />
                                        Choose File
                                    </>
                                )}
                            </span>
                        </label>

                        {uploadStatus && (
                            <div className={`mt-4 p-4 rounded-lg ${uploadStatus.includes('✅')
                                ? 'bg-green-50 text-green-700'
                                : uploadStatus.includes('❌')
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-blue-50 text-blue-700'
                                }`}>
                                {uploadStatus}
                            </div>
                        )}
                    </div>
                </div>

                {/* Invoices List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                    <div className="p-6 border-b border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900">Recent Invoices</h3>
                    </div>

                    {invoices.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            No invoices yet. Upload your first invoice above!
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                {/* In the table header - add new column */}
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Invoice #
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Company
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Date
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Amount
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Status
                                        </th>
                                    </tr>
                                </thead>

                                {/* In the table body - add company name cell */}
                                <tbody className="divide-y divide-gray-100">
                                    {invoices.map((invoice) => (
                                        <tr
                                            key={invoice.id}
                                            onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                                            className="hover:bg-gray-50 cursor-pointer"
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {invoice.invoice_number}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                {invoice.extraction_data?.supplierName || 'Unknown'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                {new Date(invoice.invoice_date).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {parseFloat(invoice.amount).toFixed(2)} {invoice.currency}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${invoice.status === 'paid'
                                                        ? 'bg-green-100 text-green-800'
                                                        : invoice.status === 'overdue'
                                                            ? 'bg-red-100 text-red-800'
                                                            : 'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                    {invoice.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}