'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Upload, FileText, DollarSign, Clock, CheckCircle, Loader2, Zap, AlertCircle, X } from 'lucide-react';
import { calculateRiskLevel, getRiskBadgeStyles } from '@/lib/customerRisk';

// Toast Notification Component
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const styles = {
        success: 'bg-green-50 border-green-200 text-green-800',
        error: 'bg-red-50 border-red-200 text-red-800',
        info: 'bg-blue-50 border-blue-200 text-blue-800'
    };

    const icons = {
        success: <CheckCircle className="w-5 h-5 text-green-600" />,
        error: <AlertCircle className="w-5 h-5 text-red-600" />,
        info: <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
    };

    return (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-6 py-4 rounded-lg border-2 shadow-lg ${styles[type]} animate-slide-in`}>
            {icons[type]}
            <span className="font-medium">{message}</span>
            <button onClick={onClose} className="ml-2 hover:opacity-70">
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [company, setCompany] = useState<any>(null);
    const [companyId, setCompanyId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [reconciling, setReconciling] = useState(false);
    const [refreshingInvoices, setRefreshingInvoices] = useState(false);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [customerRisks, setCustomerRisks] = useState<Map<string, any>>(new Map());

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        paid: 0,
        totalAmount: 0,
        dso: 0
    });

    useEffect(() => {
        checkUser();
    }, []);

    useEffect(() => {
        if (companyId) {
            loadInvoices();
        }
    }, [companyId]);

    const showToast = (message: string, type: 'success' | 'error' | 'info') => {
        setToast({ message, type });
    };

    const checkUser = async () => {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            router.push('/login');
            return;
        }

        setUser(session.user);

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
            .select('*, customers(name)')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (data) {
            setInvoices(data);

            const total = data.length;
            const pending = data.filter(i => i.status === 'pending').length;
            const paid = data.filter(i => i.status === 'paid').length;
            const totalAmount = data.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

            // Calculate DSO (Days Sales Outstanding)
            const paidInvoices = data.filter(i => i.status === 'paid' && i.paid_at);
            let dso = 0;

            if (paidInvoices.length > 0) {
                const totalDays = paidInvoices.reduce((sum, inv) => {
                    const issueDate = new Date(inv.invoice_date);
                    const paidDate = new Date(inv.paid_at);
                    const days = Math.floor((paidDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));
                    return sum + days;
                }, 0);

                dso = Math.round(totalDays / paidInvoices.length);
            }

            setStats({ total, pending, paid, totalAmount, dso });

            // Calculate customer risks
            await calculateCustomerRisks();
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        showToast('Processing invoice...', 'info');

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

            showToast('Invoice processed successfully!', 'success');
            setTimeout(() => {
                loadInvoices();
            }, 1000);

        } catch (error: any) {
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            setUploading(false);
        }
    };

    const calculateCustomerRisks = async () => {
        // Get all paid invoices with payment info
        const { data: paidInvoices } = await supabase
            .from('invoices')
            .select('customer_id, invoice_date, due_date, paid_at')
            .eq('company_id', companyId)
            .eq('status', 'paid')
            .not('paid_at', 'is', null);

        // Get overdue invoices
        const { data: overdueInvoices } = await supabase
            .from('invoices')
            .select('customer_id')
            .eq('company_id', companyId)
            .eq('status', 'overdue');

        const risks = new Map();

        // Calculate for each customer
        if (paidInvoices) {
            const customerStats: any = {};

            paidInvoices.forEach(inv => {
                const dueDate = new Date(inv.due_date);
                const paidDate = new Date(inv.paid_at);
                const daysLate = Math.floor((paidDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

                if (!customerStats[inv.customer_id]) {
                    customerStats[inv.customer_id] = { totalDays: 0, count: 0, overdue: 0 };
                }
                customerStats[inv.customer_id].totalDays += daysLate;
                customerStats[inv.customer_id].count += 1;
            });

            // Count overdue per customer
            if (overdueInvoices) {
                overdueInvoices.forEach(inv => {
                    if (customerStats[inv.customer_id]) {
                        customerStats[inv.customer_id].overdue += 1;
                    }
                });
            }

            // Calculate risk level for each customer
            Object.keys(customerStats).forEach(customerId => {
                const stats = customerStats[customerId];
                const avgDaysLate = stats.count > 0 ? stats.totalDays / stats.count : 0;
                const riskLevel = calculateRiskLevel(avgDaysLate, stats.overdue);

                risks.set(customerId, {
                    riskLevel,
                    avgDaysLate: Math.round(avgDaysLate),
                    paidCount: stats.count,
                    overdueCount: stats.overdue
                });
            });
        }

        setCustomerRisks(risks);
    };

    const handleReconcile = async () => {
        if (reconciling || refreshingInvoices) return;

        setReconciling(true);
        showToast('Running reconciliation...', 'info');

        try {
            // Get count of reconciliation matches before
            const { count: beforeCount } = await supabase
                .from('reconciliation_matches')
                .select('*', { count: 'exact', head: true });

            const response = await fetch('http://localhost:5678/webhook/lean-reconciliation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ company_id: companyId })
            });

            if (response.ok) {
                showToast('Reconciliation complete! Checking results...', 'info');
                setRefreshingInvoices(true);

                // Poll for new reconciliation matches
                let attempts = 0;
                let newMatches = false;

                while (attempts < 10 && !newMatches) {
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    const { count: afterCount } = await supabase
                        .from('reconciliation_matches')
                        .select('*', { count: 'exact', head: true });

                    if (afterCount && beforeCount !== null && afterCount > beforeCount) {
                        newMatches = true;
                        console.log(`✅ New matches created: ${afterCount - beforeCount}`);
                    }

                    attempts++;
                }

                // Refresh invoices
                await loadInvoices();
                setRefreshingInvoices(false);

                if (newMatches) {
                    showToast('Invoices matched successfully!', 'success');
                } else {
                    showToast('No matching transactions found.', 'info');
                }
            } else {
                showToast('Reconciliation failed. Please try again.', 'error');
            }
        } catch (error) {
            showToast('Error connecting to reconciliation service.', 'error');
        } finally {
            setReconciling(false);
            setRefreshingInvoices(false);
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
            {/* Toast Notification */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}

            {/* Progress Bar */}
            {(reconciling || refreshingInvoices) && (
                <div className="fixed top-0 left-0 right-0 h-1 bg-blue-600 animate-pulse z-50"></div>
            )}

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

                {/* Navigation Tabs */}
                <div className="flex gap-4 mb-8 border-b border-gray-200">
                    <button className="px-4 py-3 font-medium text-blue-600 border-b-2 border-blue-600">
                        Invoices
                    </button>
                    <Link
                        href="/dashboard/transactions"
                        className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition"
                    >
                        Bank Transactions
                    </Link>
                    <Link
                        href="/dashboard/reconciliation"
                        className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition"
                    >
                        Reconciliation History
                    </Link>
                    <Link
                        href="/dashboard/cashflow"
                        className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition"
                    >
                        Cashflow Forecast
                    </Link>
                    <Link
                        href="/dashboard/suppliers"
                        className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition"
                    >
                        Supplier Invoices
                    </Link>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
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

                    {/* NEW: DSO Card */}
                    <div className={`p-6 rounded-xl shadow-sm border ${stats.dso === 0
                        ? 'bg-gray-50 border-gray-200'
                        : stats.dso <= 30
                            ? 'bg-green-50 border-green-200'
                            : stats.dso <= 45
                                ? 'bg-yellow-50 border-yellow-200'
                                : 'bg-red-50 border-red-200'
                        }`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-600 text-sm">DSO (Days)</span>
                            <Clock className={`w-5 h-5 ${stats.dso === 0
                                ? 'text-gray-400'
                                : stats.dso <= 30
                                    ? 'text-green-600'
                                    : stats.dso <= 45
                                        ? 'text-yellow-600'
                                        : 'text-red-600'
                                }`} />
                        </div>
                        <p className={`text-3xl font-bold ${stats.dso === 0
                            ? 'text-gray-400'
                            : stats.dso <= 30
                                ? 'text-green-700'
                                : stats.dso <= 45
                                    ? 'text-yellow-700'
                                    : 'text-red-700'
                            }`}>
                            {stats.dso > 0 ? stats.dso : '-'}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                            {stats.dso === 0
                                ? 'No data yet'
                                : stats.dso <= 30
                                    ? '✅ Excellent'
                                    : stats.dso <= 45
                                        ? '⚠️ Average'
                                        : '🔴 Needs attention'}
                        </p>
                    </div>
                </div>

                {/* Upload & Reconcile Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Upload Section */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Upload className="w-8 h-8 text-blue-600" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">
                                Upload Invoice
                            </h3>
                            <p className="text-sm text-gray-600 mb-6">
                                Upload PDF or image for automatic processing
                            </p>

                            <label className="inline-block">
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    onChange={handleFileUpload}
                                    disabled={uploading}
                                    className="hidden"
                                />
                                <span className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition cursor-pointer inline-flex items-center gap-2 disabled:opacity-50">
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
                        </div>
                    </div>

                    {/* Reconcile Section */}
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-sm border border-green-200 p-8">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Zap className="w-8 h-8 text-green-600" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">
                                Auto-Reconcile
                            </h3>
                            <p className="text-sm text-gray-600 mb-2">
                                Match invoices with bank transactions
                            </p>
                            <p className="text-xs text-gray-500 mb-6">
                                {stats.pending} pending invoice{stats.pending !== 1 ? 's' : ''} ready
                            </p>

                            <button
                                onClick={handleReconcile}
                                disabled={reconciling || refreshingInvoices || stats.pending === 0}
                                className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {reconciling || refreshingInvoices ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        {reconciling ? 'Reconciling...' : 'Updating...'}
                                    </>
                                ) : (
                                    <>
                                        <Zap className="w-5 h-5" />
                                        Reconcile Now
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Invoices List */}

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 relative">
                    {/* Loading Overlay */}
                    {refreshingInvoices && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                            <div className="text-center">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
                                <p className="text-sm font-medium text-gray-700">Updating invoices...</p>
                            </div>
                        </div>
                    )}

                    <div className="p-6 border-b border-gray-100">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900">Recent Invoices</h3>
                            {refreshingInvoices && (
                                <span className="text-sm text-blue-600 flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Refreshing...
                                </span>
                            )}
                        </div>
                    </div>

                    {invoices.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            No invoices yet. Upload your first invoice above!
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Invoice #
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Customer
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
                                <tbody className="divide-y divide-gray-100">
                                    {invoices.map((invoice) => {
                                        const customerRisk = invoice.customer_id ? customerRisks.get(invoice.customer_id) : null;
                                        const riskStyles = customerRisk ? getRiskBadgeStyles(customerRisk.riskLevel) : null;

                                        return (
                                            <tr
                                                key={invoice.id}
                                                onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                                                className="hover:bg-gray-50 cursor-pointer transition"
                                            >
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    {invoice.invoice_number}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        {invoice.customer_id ? (
                                                            <Link
                                                                href={`/dashboard/customers/${invoice.customer_id}`}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="text-sm text-blue-600 hover:text-blue-800 font-medium underline"
                                                            >
                                                                {invoice.customers?.name || invoice.extraction_data?.supplierName || 'Unknown'}
                                                            </Link>
                                                        ) : (
                                                            <span className="text-sm text-gray-700">
                                                                {invoice.extraction_data?.supplierName || 'Unknown'}
                                                            </span>
                                                        )}
                                                        {customerRisk && riskStyles && (
                                                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${riskStyles.bg} ${riskStyles.text} ${riskStyles.border}`}>
                                                                {customerRisk.riskLevel === 'low' ? '🟢' : customerRisk.riskLevel === 'medium' ? '🟡' : '🔴'} {riskStyles.label}
                                                            </span>
                                                        )}
                                                    </div>
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
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            <style jsx>{`
                @keyframes slide-in {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                .animate-slide-in {
                    animation: slide-in 0.3s ease-out;
                }
            `}</style>
        </div>
    );
}