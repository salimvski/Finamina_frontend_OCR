'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    TrendingUp, TrendingDown, Clock, CheckCircle, AlertTriangle, 
    DollarSign, Upload, Zap, Shield, Package, FileText, Calendar
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

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

    const [cashflowData, setCashflowData] = useState<Array<{
        date: string;
        day: number;
        balance: number;
        incoming: number;
        outgoing: number;
    }>>([]);
    const [currentCashPosition, setCurrentCashPosition] = useState(0);

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
            await Promise.all([
                loadAllStats(userData.company_id),
                loadCashflowData(userData.company_id)
            ]);
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

    const loadCashflowData = async (company_id: string) => {
        const today = new Date();
        const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

        // Get customer invoices (money coming IN)
        const { data: customerInvoices } = await supabase
            .from('invoices')
            .select('amount, due_date, status')
            .eq('company_id', company_id)
            .eq('status', 'pending')
            .lte('due_date', ninetyDaysFromNow.toISOString());

        // Get supplier invoices (money going OUT)
        const { data: supplierInvoices } = await supabase
            .from('supplier_invoices')
            .select('amount, due_date, status')
            .eq('company_id', company_id)
            .eq('status', 'pending')
            .lte('due_date', ninetyDaysFromNow.toISOString());

        // Calculate current net position from pending invoices
        const totalReceivables = (customerInvoices || [])
            .reduce((sum, i) => sum + parseFloat(i.amount || '0'), 0);
        const totalPayables = (supplierInvoices || [])
            .reduce((sum, i) => sum + parseFloat(i.amount || '0'), 0);
        const currentNetPosition = totalReceivables - totalPayables;
        
        setCurrentCashPosition(currentNetPosition);

        // Generate chart data (daily cashflow for 90 days)
        const chartData = [];
        let runningBalance = currentNetPosition; // Start from current net position
        
        for (let i = 0; i <= 90; i++) {
            const currentDate = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
            const dateStr = currentDate.toISOString().split('T')[0];
            
            // Calculate incoming for this day
            const dayIncoming = (customerInvoices || [])
                .filter(inv => inv.due_date && inv.due_date.split('T')[0] === dateStr)
                .reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0);
            
            // Calculate outgoing for this day
            const dayOutgoing = (supplierInvoices || [])
                .filter(inv => inv.due_date && inv.due_date.split('T')[0] === dateStr)
                .reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0);
            
            // Update running balance
            runningBalance += dayIncoming - dayOutgoing;
            
            chartData.push({
                date: dateStr,
                day: i,
                balance: Math.round(runningBalance),
                incoming: Math.round(dayIncoming),
                outgoing: Math.round(dayOutgoing)
            });
        }

        setCashflowData(chartData);
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
                    <div className="relative bg-gradient-to-br from-green-500 via-emerald-500 to-green-600 rounded-2xl p-8 text-white shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden group">
                        {/* Decorative background pattern */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-16 -mt-16"></div>
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white opacity-5 rounded-full -ml-12 -mb-12"></div>
                        
                        <div className="relative z-10">
                            <div className="flex items-start justify-between mb-6">
                                <div className="p-4 bg-white bg-opacity-30 rounded-2xl backdrop-blur-sm group-hover:bg-opacity-40 transition-all">
                                    <TrendingUp className="w-8 h-8 text-green-700" />
                                </div>
                                <span className="px-4 py-1.5 bg-white bg-opacity-30 backdrop-blur-sm rounded-full text-xs font-bold uppercase tracking-wide text-green-900">
                                    Money In
                                </span>
                            </div>
                            
                            <div className="mb-6">
                                <p className="text-sm font-medium opacity-90 mb-3 tracking-wide text-white">Total Receivables (A/R)</p>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-5xl font-extrabold leading-none text-white">
                                        {stats.totalReceivables.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                    </p>
                                    <p className="text-lg font-semibold opacity-80 text-white">SAR</p>
                                </div>
                            </div>
                            
                            <div className="pt-6 border-t border-white border-opacity-30">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 opacity-80 text-white" />
                                        <span className="text-sm font-medium text-white">{stats.pendingCustomerInvoices} pending</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium opacity-80 text-white">DSO:</span>
                                        <span className="text-sm font-bold text-white">{stats.averageDSO}d</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Money Going Out (A/P) */}
                    <div className="relative bg-gradient-to-br from-red-500 via-rose-500 to-red-600 rounded-2xl p-8 text-white shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden group">
                        {/* Decorative background pattern */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-16 -mt-16"></div>
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white opacity-5 rounded-full -ml-12 -mb-12"></div>
                        
                        <div className="relative z-10">
                            <div className="flex items-start justify-between mb-6">
                                <div className="p-4 bg-white bg-opacity-30 rounded-2xl backdrop-blur-sm group-hover:bg-opacity-40 transition-all">
                                    <TrendingDown className="w-8 h-8 text-red-700" />
                                </div>
                                <span className="px-4 py-1.5 bg-white bg-opacity-30 backdrop-blur-sm rounded-full text-xs font-bold uppercase tracking-wide text-red-900">
                                    Money Out
                                </span>
                            </div>
                            
                            <div className="mb-6">
                                <p className="text-sm font-medium opacity-90 mb-3 tracking-wide text-white">Total Payables (A/P)</p>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-5xl font-extrabold leading-none text-white">
                                        {stats.totalPayables.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                    </p>
                                    <p className="text-lg font-semibold opacity-80 text-white">SAR</p>
                                </div>
                            </div>
                            
                            <div className="pt-6 border-t border-white border-opacity-30">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 opacity-80 text-white" />
                                        <span className="text-sm font-medium text-white">{stats.pendingSupplierInvoices} pending</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {stats.anomaliesDetected > 0 ? (
                                            <>
                                                <AlertTriangle className="w-4 h-4 opacity-80 text-white" />
                                                <span className="text-sm font-bold text-white">{stats.anomaliesDetected} alerts</span>
                                            </>
                                        ) : (
                                            <span className="text-sm font-medium opacity-80 text-white">No alerts</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Net Position */}
                    <div className={`relative bg-gradient-to-br ${
                        stats.netCashPosition >= 0 
                            ? 'from-blue-500 via-indigo-500 to-blue-600' 
                            : 'from-orange-500 via-amber-500 to-orange-600'
                    } rounded-2xl p-8 text-white shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden group`}>
                        {/* Decorative background pattern */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-16 -mt-16"></div>
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white opacity-5 rounded-full -ml-12 -mb-12"></div>
                        
                        <div className="relative z-10">
                            <div className="flex items-start justify-between mb-6">
                                <div className="p-4 bg-white bg-opacity-30 rounded-2xl backdrop-blur-sm group-hover:bg-opacity-40 transition-all">
                                    <DollarSign className={`w-8 h-8 ${
                                        stats.netCashPosition >= 0 ? 'text-blue-700' : 'text-orange-700'
                                    }`} />
                                </div>
                                <span className={`px-4 py-1.5 bg-white bg-opacity-30 backdrop-blur-sm rounded-full text-xs font-bold uppercase tracking-wide ${
                                    stats.netCashPosition >= 0 ? 'text-blue-900' : 'text-orange-900'
                                }`}>
                                    Net Position
                                </span>
                            </div>
                            
                            <div className="mb-6">
                                <p className="text-sm font-medium opacity-90 mb-3 tracking-wide text-white">Cash Flow Balance</p>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-5xl font-extrabold leading-none text-white">
                                        {stats.netCashPosition >= 0 ? '+' : ''}{Math.abs(stats.netCashPosition).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                    </p>
                                    <p className="text-lg font-semibold opacity-80 text-white">SAR</p>
                                </div>
                            </div>
                            
                            <div className="pt-6 border-t border-white border-opacity-30">
                                <div className="flex items-center gap-2">
                                    {stats.netCashPosition >= 0 ? (
                                        <>
                                            <CheckCircle className="w-5 h-5 text-white" />
                                            <span className="text-sm font-semibold text-white">Healthy cash position</span>
                                        </>
                                    ) : (
                                        <>
                                            <AlertTriangle className="w-5 h-5 text-white" />
                                            <span className="text-sm font-semibold text-white">Negative cash flow</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* AR, AP & Bank Reconciliation - Unified Module Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Module 1: Accounts Receivable */}
                    <div className="bg-white rounded-xl border-2 border-gray-200 hover:border-green-500 p-6 shadow-sm hover:shadow-lg transition group">
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-500 transition">
                                <TrendingUp className="w-8 h-8 text-green-600 group-hover:text-white transition" />
                            </div>
                            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                                A/R
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Accounts Receivable</h3>
                        <p className="text-gray-600 text-sm mb-4">Track customer payments and send auto-reminders</p>
                        <div className="space-y-2 mb-4">
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
                        <Link 
                            href="/dashboard?upload=customer"
                            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-green-50 border-2 border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition font-semibold text-sm"
                        >
                            <Upload className="w-4 h-4" />
                            Upload Invoice
                        </Link>
                    </div>

                    {/* Module 2: Accounts Payable */}
                    <div className="bg-white rounded-xl border-2 border-gray-200 hover:border-red-500 p-6 shadow-sm hover:shadow-lg transition group">
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-red-100 rounded-lg group-hover:bg-red-500 transition">
                                <TrendingDown className="w-8 h-8 text-red-600 group-hover:text-white transition" />
                            </div>
                            <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">
                                A/P
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Accounts Payable</h3>
                        <p className="text-gray-600 text-sm mb-4">Manage supplier invoices and payments</p>
                        <div className="space-y-2 mb-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Total Invoices:</span>
                                <span className="font-semibold text-gray-900">{stats.totalSupplierInvoices}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Pending:</span>
                                <span className="font-semibold text-orange-600">{stats.pendingSupplierInvoices}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Paid:</span>
                                <span className="font-semibold text-green-600">{stats.paidSupplierInvoices}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-200">
                                <span className="text-gray-600">Total Amount:</span>
                                <span className="font-bold text-gray-900">{stats.totalPayables.toFixed(0)} SAR</span>
                            </div>
                        </div>
                        <Link 
                            href="/dashboard/suppliers?upload=supplier"
                            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-red-50 border-2 border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition font-semibold text-sm"
                        >
                            <FileText className="w-4 h-4" />
                            Upload Invoice
                        </Link>
                    </div>

                    {/* Module 3: Bank Reconciliation */}
                    <div className="bg-white rounded-xl border-2 border-gray-200 hover:border-blue-500 p-6 shadow-sm hover:shadow-lg transition group">
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-500 transition">
                                <CheckCircle className="w-8 h-8 text-blue-600 group-hover:text-white transition" />
                            </div>
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                                Bank
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Bank Reconciliation</h3>
                        <p className="text-gray-600 text-sm mb-4">Auto-match bank transactions with invoices</p>
                        <div className="space-y-2 mb-4">
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
                        <Link 
                            href="/dashboard/reconciliation"
                            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-50 border-2 border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition font-semibold text-sm"
                        >
                            <Zap className="w-4 h-4" />
                            Auto-Reconcile
                        </Link>
                    </div>
                </div>

                {/* Cashflow Forecast Chart */}
                <Link 
                    href="/dashboard/cashflow"
                    className="block bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8 hover:shadow-lg transition cursor-pointer group"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">90-Day Cash Flow Projection</h2>
                            <p className="text-sm text-gray-600 mt-1">
                                Current Position: <span className={`font-semibold ${currentCashPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {currentCashPosition >= 0 ? '+' : ''}{currentCashPosition.toFixed(0)} SAR
                                </span>
                            </p>
                        </div>
                        <Calendar className="w-6 h-6 text-gray-400 group-hover:text-blue-600 transition" />
                    </div>
                    <div className="h-64">
                        {cashflowData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={cashflowData}>
                                    <defs>
                                        <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                    <XAxis 
                                        dataKey="day" 
                                        label={{ value: 'Days', position: 'insideBottom', offset: -5 }}
                                        tick={{ fontSize: 12 }}
                                        stroke="#6b7280"
                                    />
                                    <YAxis 
                                        label={{ value: 'Balance (SAR)', angle: -90, position: 'insideLeft' }}
                                        tick={{ fontSize: 12 }}
                                        stroke="#6b7280"
                                    />
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: 'white', 
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '8px',
                                            padding: '12px'
                                        }}
                                        formatter={(value: number | undefined, name: string | undefined) => {
                                            const labels: Record<string, string> = {
                                                balance: 'Balance',
                                                incoming: 'Money In',
                                                outgoing: 'Money Out'
                                            };
                                            const label = labels[name ?? ''] || name || 'Unknown';
                                            return [`${(value ?? 0).toLocaleString()} SAR`, label];
                                        }}
                                        labelFormatter={(label) => `Day ${label}`}
                                    />
                                    <Legend 
                                        verticalAlign="top" 
                                        height={36}
                                        iconType="line"
                                        formatter={(value) => {
                                            const labels: Record<string, string> = {
                                                balance: 'Net Balance',
                                                incoming: 'Incoming',
                                                outgoing: 'Outgoing'
                                            };
                                            return labels[value] || value;
                                        }}
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="balance" 
                                        stroke="#3b82f6" 
                                        strokeWidth={3}
                                        fill="url(#colorBalance)"
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="incoming" 
                                        stroke="#10b981" 
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        dot={false}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="outgoing" 
                                        stroke="#ef4444" 
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        dot={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400">
                                <div className="text-center">
                                    <Calendar className="w-12 h-12 mx-auto mb-2" />
                                    <p>Loading cashflow data...</p>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="mt-4 flex items-center justify-center gap-8 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-0.5 bg-blue-500"></div>
                            <span>Net Balance</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-0.5 bg-green-500 border-dashed border-t-2 border-green-500"></div>
                            <span>Money In</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-0.5 bg-red-500 border-dashed border-t-2 border-red-500"></div>
                            <span>Money Out</span>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 text-center mt-2 group-hover:text-blue-600 transition">
                        Click to view detailed forecast →
                    </p>
                </Link>

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