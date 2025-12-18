'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, FileText, DollarSign, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function SupplierInvoicesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [companyId, setCompanyId] = useState<string>('');
    const [companyName, setCompanyName] = useState<string>('');
    const [supplierInvoices, setSupplierInvoices] = useState<any[]>([]);
    const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all');
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        paid: 0,
        totalOwed: 0,
        totalPaid: 0
    });

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (companyId) {
            loadSupplierInvoices();
        }
    }, [companyId, filter]);

    const loadData = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            router.push('/login');
            return;
        }

        const { data: userData } = await supabase
            .from('users')
            .select('company_id, companies(name)')
            .eq('auth_user_id', session.user.id)
            .single();

        if (userData) {
            setCompanyId(userData.company_id);
            setCompanyName(userData.companies.name);
        }

        setLoading(false);
    };

    const loadSupplierInvoices = async () => {
        let query = supabase
            .from('supplier_invoices')
            .select(`
                *,
                supplier:suppliers(name, email, vat_number)
            `)
            .eq('company_id', companyId)
            .order('invoice_date', { ascending: false });

        if (filter !== 'all') {
            query = query.eq('status', filter);
        }

        const { data, error } = await query;

        if (data) {
            setSupplierInvoices(data);

            const total = data.length;
            const pending = data.filter(i => i.status === 'pending').length;
            const paid = data.filter(i => i.status === 'paid').length;
            const totalOwed = data
                .filter(i => i.status === 'pending')
                .reduce((sum, i) => sum + parseFloat(i.amount), 0);
            const totalPaid = data
                .filter(i => i.status === 'paid')
                .reduce((sum, i) => sum + parseFloat(i.amount), 0);

            setStats({ total, pending, paid, totalOwed, totalPaid });
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                {/* Back Button */}
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Back to Dashboard
                </Link>

                {/* Navigation Tabs */}
                <div className="flex gap-4 mb-8 border-b border-gray-200">
                    <Link href="/dashboard" className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition">
                        Invoices (Receivable)
                    </Link>
                    <Link href="/dashboard/transactions" className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition">
                        Bank Transactions
                    </Link>
                    <Link href="/dashboard/reconciliation" className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition">
                        Reconciliation History
                    </Link>
                    <Link href="/dashboard/cashflow" className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition">
                        Cashflow Forecast
                    </Link>
                    <button className="px-4 py-3 font-medium text-blue-600 border-b-2 border-blue-600">
                        Supplier Invoices
                    </button>
                </div>

                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Supplier Invoices (Payables)</h1>
                    <p className="text-gray-600">{companyName} - Track what you owe to suppliers</p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Total Invoices</span>
                            <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Pending</span>
                            <Clock className="w-5 h-5 text-orange-600" />
                        </div>
                        <p className="text-3xl font-bold text-orange-700">{stats.pending}</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Paid</span>
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>
                        <p className="text-3xl font-bold text-green-700">{stats.paid}</p>
                    </div>

                    <div className="bg-orange-50 p-6 rounded-xl shadow-sm border border-orange-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Total Owed</span>
                            <AlertCircle className="w-5 h-5 text-orange-600" />
                        </div>
                        <p className="text-3xl font-bold text-orange-700">
                            {stats.totalOwed.toFixed(2)} SAR
                        </p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Total Paid</span>
                            <DollarSign className="w-5 h-5 text-gray-600" />
                        </div>
                        <p className="text-3xl font-bold text-gray-900">
                            {stats.totalPaid.toFixed(2)} SAR
                        </p>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
                    <div className="flex gap-4">
                        <button
                            onClick={() => setFilter('all')}
                            className={`px-4 py-2 rounded-lg font-medium transition ${
                                filter === 'all'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            All Invoices
                        </button>
                        <button
                            onClick={() => setFilter('pending')}
                            className={`px-4 py-2 rounded-lg font-medium transition ${
                                filter === 'pending'
                                    ? 'bg-orange-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            Pending
                        </button>
                        <button
                            onClick={() => setFilter('paid')}
                            className={`px-4 py-2 rounded-lg font-medium transition ${
                                filter === 'paid'
                                    ? 'bg-green-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            Paid
                        </button>
                    </div>
                </div>

                {/* Supplier Invoices Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {supplierInvoices.length === 0 ? (
                        <div className="p-12 text-center">
                            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Supplier Invoices</h3>
                            <p className="text-gray-500">
                                {filter === 'all' 
                                    ? 'No supplier invoices found.'
                                    : `No ${filter} supplier invoices.`}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Invoice #</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Supplier</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Invoice Date</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Due Date</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {supplierInvoices.map((invoice) => (
                                        <tr
                                            key={invoice.id}
                                            onClick={() => router.push(`/dashboard/suppliers/invoices/${invoice.id}`)}
                                            className="hover:bg-gray-50 cursor-pointer transition"
                                        >
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                                {invoice.invoice_number}
                                            </td>
                                            <td className="px-6 py-4">
                                                <Link
                                                    href={`/dashboard/suppliers/${invoice.supplier_id}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-sm text-blue-600 hover:text-blue-800 font-medium underline"
                                                >
                                                    {invoice.supplier?.name || 'Unknown Supplier'}
                                                </Link>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                {new Date(invoice.invoice_date).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-900 text-right font-semibold">
                                                {parseFloat(invoice.amount).toFixed(2)} {invoice.currency}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full ${
                                                    invoice.status === 'paid'
                                                        ? 'bg-green-100 text-green-700'
                                                        : invoice.status === 'overdue'
                                                            ? 'bg-red-100 text-red-700'
                                                            : 'bg-orange-100 text-orange-700'
                                                }`}>
                                                    {invoice.status === 'paid' ? (
                                                        <CheckCircle className="w-4 h-4" />
                                                    ) : (
                                                        <Clock className="w-4 h-4" />
                                                    )}
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
            </div>
        </div>
    );
}