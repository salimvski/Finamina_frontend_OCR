'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    TrendingUp, TrendingDown, Clock, CheckCircle, AlertTriangle, 
    DollarSign, Upload, Zap, Shield, Package, FileText, Calendar
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CompleteDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [companyId, setCompanyId] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [activeTab, setActiveTab] = useState<'overview' | 'ar' | 'ap' | 'reconciliation'>('overview');
    
    const [stats, setStats] = useState({
        // A/R Stats (Money Coming In)
        totalCustomerInvoices: 0,
        pendingCustomerInvoices: 0,
        paidCustomerInvoices: 0,
        totalReceivables: 0,
        averageDSO: 0,
        
        // A/P Stats (Money Going Out)
        totalSupplierInvoices: 0,
        pendingSupplierInvoices: 0,
        paidSupplierInvoices: 0,
        totalPayables: 0,
        
        // Procurement Stats
        totalPOs: 0,
        anomaliesDetected: 0,
        moneySaved: 0,
        
        // Reconciliation Stats
        totalBankTransactions: 0,
        reconciledTransactions: 0,
        unreconciledTransactions: 0,
        
        // Net Position
        netCashPosition: 0
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/login');
            return;
        }

        const { data: userData } = await supabase
            .from('users')
            .select('company_id, companies(name)')
            .eq('auth_user_id', user.id)
            .single();

        if (userData) {
            setCompanyId(userData.company_id);
            setCompanyName(userData.companies?.[0]?.name || 'My Company');
            await loadAllStats(userData.company_id);
        }

        setLoading(false);
    };

    const loadAllStats = async (company_id: string) => {
        // Load A/R data (customer invoices)
        const { data: customerInvoices } = await supabase
            .from('invoices')
            .select('amount, status, invoice_date, paid_at')
            .eq('company_id', company_id);

        const totalCustomerInvoices = customerInvoices?.length || 0;
        const pendingCustomerInvoices = customerInvoices?.filter(i => i.status === 'pending').length || 0;
        const paidCustomerInvoices = customerInvoices?.filter(i => i.status === 'paid').length || 0;
        const totalReceivables = customerInvoices
            ?.filter(i => i.status === 'pending')
            .reduce((sum, i) => sum + parseFloat(i.amount), 0) || 0;

        // Calculate DSO
        const paidInvoices = customerInvoices?.filter(i => i.status === 'paid' && i.paid_at) || [];
        const avgDSO = paidInvoices.length > 0
            ? paidInvoices.reduce((sum, inv) => {
                const invoiceDate = new Date(inv.invoice_date);
                const paidDate = new Date(inv.paid_at);
                const days = Math.floor((paidDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
                return sum + days;
            }, 0) / paidInvoices.length
            : 0;

        // Load A/P data (supplier invoices)
        const { data: supplierInvoices } = await supabase
            .from('supplier_invoices')
            .select('amount, status')
            .eq('company_id', company_id);

        const totalSupplierInvoices = supplierInvoices?.length || 0;
        const pendingSupplierInvoices = supplierInvoices?.filter(i => i.status === 'pending').length || 0;
        const paidSupplierInvoices = supplierInvoices?.filter(i => i.status === 'paid').length || 0;
        const totalPayables = supplierInvoices
            ?.filter(i => i.status === 'pending')
            .reduce((sum, i) => sum + parseFloat(i.amount), 0) || 0;

        // Load Procurement data
        const { data: purchaseOrders } = await supabase
            .from('purchase_orders')
            .select('id')
            .eq('company_id', company_id);

        const { data: anomalies } = await supabase
            .from('procurement_anomalies')
            .select('variance_percentage, expected_value')
            .eq('company_id', company_id)
            .eq('status', 'open');

        const moneySaved = anomalies?.reduce((sum, a) => {
            const variance = parseFloat(a.variance_percentage) || 0;
            const expected = parseFloat(a.expected_value) || 0;
            return sum + Math.abs(expected * variance / 100);
        }, 0) || 0;

        // Load Bank/Reconciliation data
        const { data: bankTransactions } = await supabase
            .from('bank_transactions')
            .select('is_reconciled')
            .eq('bank_account_id', (await supabase
                .from('bank_accounts')
                .select('id')
                .eq('company_id', company_id)
                .single()
            )?.data?.id);

        const totalBankTransactions = bankTransactions?.length || 0;
        const reconciledTransactions = bankTransactions?.filter(t => t.is_reconciled).length || 0;
        const unreconciledTransactions = totalBankTransactions - reconciledTransactions;

        setStats({
            totalCustomerInvoices,
            pendingCustomerInvoices,
            paidCustomerInvoices,
            totalReceivables,
            averageDSO: Math.round(avgDSO),
            
            totalSupplierInvoices,
            pendingSupplierInvoices,
            paidSupplierInvoices,
            totalPayables,
            
            totalPOs: purchaseOrders?.length || 0,
            anomaliesDetected: anomalies?.length || 0,
            moneySaved: Math.round(moneySaved),
            
            totalBankTransactions,
            reconciledTransactions,
            unreconciledTransactions,
            
            netCashPosition: totalReceivables - totalPayables
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading dashboard...</p>
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
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">Finamina</h1>
                            <p className="text-gray-600 mt-1">{companyName}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => supabase.auth.signOut()}
                                className="px-4 py-2 text-gray-600 hover:text-gray-900 transition"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-8 py-8">
                {/* Financial Overview Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Money Coming In (A/R) */}
                    <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg">
                        <div className="flex items-start justify-between mb-4">
                            <TrendingUp className="w-12 h-12 opacity-80" />
                            <span className="px-3 py-1 bg-white bg-opacity-20 rounded-full text-xs font-semibold">
                                Money In
                            </span>
                        </div>
                        <p className="text-sm opacity-90 mb-2">Total Receivables (A/R)</p>
                        <p className="text-4xl font-bold mb-1">
                            {stats.totalReceivables.toFixed(0)}
                        </p>
                        <p className="text-sm opacity-90">SAR</p>
                        <div className="mt-4 pt-4 border-t border-white border-opacity-20">
                            <div className="flex justify-between text-sm">
                                <span className="opacity-90">{stats.pendingCustomerInvoices} pending</span>
                                <span className="opacity-90">DSO: {stats.averageDSO}d</span>
                            </div>
                        </div>
                    </div>

                    {/* Money Going Out (A/P) */}
                    <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-xl p-6 text-white shadow-lg">
                        <div className="flex items-start justify-between mb-4">
                            <TrendingDown className="w-12 h-12 opacity-80" />
                            <span className="px-3 py-1 bg-white bg-opacity-20 rounded-full text-xs font-semibold">
                                Money Out
                            </span>
                        </div>
                        <p className="text-sm opacity-90 mb-2">Total Payables (A/P)</p>
                        <p className="text-4xl font-bold mb-1">
                            {stats.totalPayables.toFixed(0)}
                        </p>
                        <p className="text-sm opacity-90">SAR</p>
                        <div className="mt-4 pt-4 border-t border-white border-opacity-20">
                            <div className="flex justify-between text-sm">
                                <span className="opacity-90">{stats.pendingSupplierInvoices} pending</span>
                                <span className="opacity-90">{stats.anomaliesDetected} alerts</span>
                            </div>
                        </div>
                    </div>

                    {/* Net Position */}
                    <div className={`bg-gradient-to-br ${
                        stats.netCashPosition >= 0 
                            ? 'from-blue-500 to-indigo-600' 
                            : 'from-orange-500 to-amber-600'
                    } rounded-xl p-6 text-white shadow-lg`}>
                        <div className="flex items-start justify-between mb-4">
                            <DollarSign className="w-12 h-12 opacity-80" />
                            <span className="px-3 py-1 bg-white bg-opacity-20 rounded-full text-xs font-semibold">
                                Net Position
                            </span>
                        </div>
                        <p className="text-sm opacity-90 mb-2">Cash Flow Balance</p>
                        <p className="text-4xl font-bold mb-1">
                            {stats.netCashPosition >= 0 ? '+' : ''}{stats.netCashPosition.toFixed(0)}
                        </p>
                        <p className="text-sm opacity-90">SAR</p>
                        <div className="mt-4 pt-4 border-t border-white border-opacity-20">
                            <p className="text-sm opacity-90">
                                {stats.netCashPosition >= 0 
                                    ? '✓ Healthy cash position' 
                                    : '⚠ Negative cash flow'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <Link 
                            href="/dashboard"
                            className="flex flex-col items-center justify-center p-4 bg-green-50 border-2 border-green-200 rounded-lg hover:bg-green-100 transition group"
                        >
                            <Upload className="w-8 h-8 text-green-600 mb-2 group-hover:scale-110 transition" />
                            <p className="text-sm font-semibold text-gray-900 text-center">Upload Customer Invoice</p>
                            <p className="text-xs text-gray-600 mt-1">A/R</p>
                        </Link>

                        <Link 
                            href="/dashboard/suppliers"
                            className="flex flex-col items-center justify-center p-4 bg-red-50 border-2 border-red-200 rounded-lg hover:bg-red-100 transition group"
                        >
                            <FileText className="w-8 h-8 text-red-600 mb-2 group-hover:scale-110 transition" />
                            <p className="text-sm font-semibold text-gray-900 text-center">Upload Supplier Invoice</p>
                            <p className="text-xs text-gray-600 mt-1">A/P</p>
                        </Link>

                        <Link 
                            href="/dashboard/procurement"
                            className="flex flex-col items-center justify-center p-4 bg-purple-50 border-2 border-purple-200 rounded-lg hover:bg-purple-100 transition group"
                        >
                            <Package className="w-8 h-8 text-purple-600 mb-2 group-hover:scale-110 transition" />
                            <p className="text-sm font-semibold text-gray-900 text-center">Upload PO/DN</p>
                            <p className="text-xs text-gray-600 mt-1">Procurement</p>
                        </Link>

                        <Link 
                            href="/dashboard/reconciliation"
                            className="flex flex-col items-center justify-center p-4 bg-blue-50 border-2 border-blue-200 rounded-lg hover:bg-blue-100 transition group"
                        >
                            <Zap className="w-8 h-8 text-blue-600 mb-2 group-hover:scale-110 transition" />
                            <p className="text-sm font-semibold text-gray-900 text-center">Auto-Reconcile</p>
                            <p className="text-xs text-gray-600 mt-1">Bank Match</p>
                        </Link>

                        <Link 
                            href="/dashboard/cashflow"
                            className="flex flex-col items-center justify-center p-4 bg-orange-50 border-2 border-orange-200 rounded-lg hover:bg-orange-100 transition group"
                        >
                            <Calendar className="w-8 h-8 text-orange-600 mb-2 group-hover:scale-110 transition" />
                            <p className="text-sm font-semibold text-gray-900 text-center">Cashflow Forecast</p>
                            <p className="text-xs text-gray-600 mt-1">90 Days</p>
                        </Link>
                    </div>
                </div>

                {/* Module Navigation Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Module 1: Accounts Receivable */}
                    <Link 
                        href="/dashboard"
                        className="bg-white rounded-xl border-2 border-gray-200 hover:border-green-500 p-6 shadow-sm hover:shadow-lg transition group"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-500 transition">
                                <TrendingUp className="w-8 h-8 text-green-600 group-hover:text-white transition" />
                            </div>
                            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                                Module 1
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Accounts Receivable</h3>
                        <p className="text-gray-600 text-sm mb-4">Track customer payments and send auto-reminders</p>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Total Invoices:</span>
                                <span className="font-semibold text-gray-900">{stats.totalCustomerInvoices}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Pending:</span>
                                <span className="font-semibold text-orange-600">{stats.pendingCustomerInvoices}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Paid:</span>
                                <span className="font-semibold text-green-600">{stats.paidCustomerInvoices}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-200">
                                <span className="text-gray-600">Total Amount:</span>
                                <span className="font-bold text-gray-900">{stats.totalReceivables.toFixed(0)} SAR</span>
                            </div>
                        </div>
                    </Link>

                    {/* Module 2: Accounts Payable + Procurement */}
                    <Link 
                        href="/dashboard/procurement"
                        className="bg-white rounded-xl border-2 border-gray-200 hover:border-purple-500 p-6 shadow-sm hover:shadow-lg transition group"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-500 transition">
                                <Shield className="w-8 h-8 text-purple-600 group-hover:text-white transition" />
                            </div>
                            <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                                Module 2
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Procurement & Payables</h3>
                        <p className="text-gray-600 text-sm mb-4">3-way matching detects fraud and overcharges</p>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Supplier Invoices:</span>
                                <span className="font-semibold text-gray-900">{stats.totalSupplierInvoices}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Purchase Orders:</span>
                                <span className="font-semibold text-blue-600">{stats.totalPOs}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Anomalies:</span>
                                <span className="font-semibold text-red-600">{stats.anomaliesDetected}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-200">
                                <span className="text-gray-600">Money Saved:</span>
                                <span className="font-bold text-green-600">{stats.moneySaved.toFixed(0)} SAR</span>
                            </div>
                        </div>
                    </Link>

                    {/* Module 3: Bank Reconciliation */}
                    <Link 
                        href="/dashboard/reconciliation"
                        className="bg-white rounded-xl border-2 border-gray-200 hover:border-blue-500 p-6 shadow-sm hover:shadow-lg transition group"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-500 transition">
                                <CheckCircle className="w-8 h-8 text-blue-600 group-hover:text-white transition" />
                            </div>
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                                Module 3
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Bank Reconciliation</h3>
                        <p className="text-gray-600 text-sm mb-4">Auto-match bank transactions with invoices</p>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Total Transactions:</span>
                                <span className="font-semibold text-gray-900">{stats.totalBankTransactions}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Reconciled:</span>
                                <span className="font-semibold text-green-600">{stats.reconciledTransactions}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Unreconciled:</span>
                                <span className="font-semibold text-orange-600">{stats.unreconciledTransactions}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-200">
                                <span className="text-gray-600">Match Rate:</span>
                                <span className="font-bold text-blue-600">
                                    {stats.totalBankTransactions > 0 
                                        ? Math.round((stats.reconciledTransactions / stats.totalBankTransactions) * 100)
                                        : 0}%
                                </span>
                            </div>
                        </div>
                    </Link>
                </div>

                {/* Alerts Section */}
                {stats.anomaliesDetected > 0 && (
                    <div className="mt-8 bg-red-50 border-2 border-red-200 rounded-xl p-6">
                        <div className="flex items-start gap-4">
                            <AlertTriangle className="w-8 h-8 text-red-600 flex-shrink-0" />
                            <div>
                                <h3 className="text-xl font-bold text-red-900 mb-2">
                                    ⚠️ {stats.anomaliesDetected} Procurement Alert{stats.anomaliesDetected > 1 ? 's' : ''}
                                </h3>
                                <p className="text-red-700 mb-3">
                                    Potential overcharges detected. You could be losing {stats.moneySaved.toFixed(0)} SAR.
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
            </div>
        </div>
    );
}