'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    TrendingUp, TrendingDown, Clock, CheckCircle, AlertTriangle, 
    DollarSign, Upload, Zap, Shield, Package, FileText, Calendar, Plus, User,
    ArrowRight, Receipt, Building, CreditCard, BarChart3, Database
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

export default function DashboardHome() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [companyId, setCompanyId] = useState('');
    const [companyName, setCompanyName] = useState('');
    
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
        totalARMatches: 0,
        anomaliesDetected: 0,
        moneySaved: 0,
        
        // Customer POs Stats
        totalCustomerPOs: 0,
        
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
                const days = Math.ceil((paidDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
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
            .select('*')
            .eq('company_id', company_id);

        const totalPOs = purchaseOrders?.length || 0;

        const { count: arMatchesCount } = await supabase
            .from('ar_three_way_matches')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', company_id);
        const totalARMatches = arMatchesCount ?? 0;

        // Load Customer POs count
        const { count: customerPOsCount } = await supabase
            .from('customer_purchase_orders')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', company_id);
        const totalCustomerPOs = customerPOsCount ?? 0;

        // Load Reconciliation data
        const { data: bankAccounts } = await supabase
            .from('bank_accounts')
            .select('id')
            .eq('company_id', company_id);

        let totalBankTransactions = 0;
        let reconciledTransactions = 0;
        if (bankAccounts && bankAccounts.length > 0) {
            const accountIds = bankAccounts.map(a => a.id);
            const { data: transactions } = await supabase
                .from('bank_transactions')
                .select('is_reconciled')
                .in('bank_account_id', accountIds);

            totalBankTransactions = transactions?.length || 0;
            reconciledTransactions = transactions?.filter(t => t.is_reconciled).length || 0;
        }

        // Calculate net cash position
        const netCashPosition = totalReceivables - totalPayables;

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
            totalPOs,
            totalARMatches,
            anomaliesDetected: 0, // TODO: Calculate from procurement_anomalies
            moneySaved: 0, // TODO: Calculate from anomalies
            totalCustomerPOs,
            totalBankTransactions,
            reconciledTransactions,
            unreconciledTransactions: totalBankTransactions - reconciledTransactions,
            netCashPosition
        });
    };

    const loadCashflowData = async (company_id: string) => {
        // Get current date
        const today = new Date();
        const daysAhead = 30;
        
        // Load customer invoices (A/R)
        const { data: customerInvoices } = await supabase
            .from('invoices')
            .select('amount, invoice_date, due_date, status')
            .eq('company_id', company_id)
            .in('status', ['pending', 'paid']);

        // Load supplier invoices (A/P)
        const { data: supplierInvoices } = await supabase
            .from('supplier_invoices')
            .select('amount, invoice_date, due_date, status')
            .eq('company_id', company_id)
            .in('status', ['pending', 'paid']);

        // Generate cashflow data for next 30 days
        const cashflow: Array<{
            date: string;
            day: number;
            balance: number;
            incoming: number;
            outgoing: number;
        }> = [];

        let currentBalance = stats.netCashPosition;

        for (let i = 0; i <= daysAhead; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];

            // Calculate incoming (A/R payments due today)
            const incoming = customerInvoices
                ?.filter(inv => {
                    if (inv.status === 'paid') return false;
                    const dueDate = inv.due_date ? new Date(inv.due_date).toISOString().split('T')[0] : null;
                    return dueDate === dateStr;
                })
                .reduce((sum, inv) => sum + parseFloat(inv.amount), 0) || 0;

            // Calculate outgoing (A/P payments due today)
            const outgoing = supplierInvoices
                ?.filter(inv => {
                    if (inv.status === 'paid') return false;
                    const dueDate = inv.due_date ? new Date(inv.due_date).toISOString().split('T')[0] : null;
                    return dueDate === dateStr;
                })
                .reduce((sum, inv) => sum + parseFloat(inv.amount), 0) || 0;

            currentBalance = currentBalance + incoming - outgoing;

            cashflow.push({
                date: dateStr,
                day: i,
                balance: currentBalance,
                incoming,
                outgoing
            });
        }

        setCashflowData(cashflow);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-lg">Loading...</div>
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
                            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                            <p className="text-gray-600 mt-1">Welcome back, {companyName}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-8 py-8">
                {/* Quick Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {/* Net Cash Position */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-blue-100 rounded-lg">
                                <DollarSign className="w-6 h-6 text-blue-600" />
                            </div>
                            <span className={`text-sm font-semibold ${stats.netCashPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {stats.netCashPosition >= 0 ? <TrendingUp className="w-4 h-4 inline" /> : <TrendingDown className="w-4 h-4 inline" />}
                            </span>
                        </div>
                        <h3 className="text-gray-600 text-sm font-medium mb-1">Net Cash Position</h3>
                        <p className="text-2xl font-bold text-gray-900">
                            {stats.netCashPosition >= 0 ? '+' : ''}{stats.netCashPosition.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                        </p>
                    </div>

                    {/* Total Receivables */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-green-100 rounded-lg">
                                <TrendingUp className="w-6 h-6 text-green-600" />
                            </div>
                        </div>
                        <h3 className="text-gray-600 text-sm font-medium mb-1">Total Receivables (A/R)</h3>
                        <p className="text-2xl font-bold text-gray-900">
                            {stats.totalReceivables.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{stats.pendingCustomerInvoices} pending invoices</p>
                    </div>

                    {/* Total Payables */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-red-100 rounded-lg">
                                <TrendingDown className="w-6 h-6 text-red-600" />
                            </div>
                        </div>
                        <h3 className="text-gray-600 text-sm font-medium mb-1">Total Payables (A/P)</h3>
                        <p className="text-2xl font-bold text-gray-900">
                            {stats.totalPayables.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{stats.pendingSupplierInvoices} pending invoices</p>
                    </div>

                    {/* Average DSO */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-purple-100 rounded-lg">
                                <Clock className="w-6 h-6 text-purple-600" />
                            </div>
                        </div>
                        <h3 className="text-gray-600 text-sm font-medium mb-1">Average DSO</h3>
                        <p className="text-2xl font-bold text-gray-900">{stats.averageDSO} days</p>
                        <p className="text-xs text-gray-500 mt-1">Days Sales Outstanding</p>
                    </div>
                </div>

                {/* Demo Data Management Widget - Only show for test company */}
                {companyId === '22222222-2222-2222-2222-222222222222' && (
                  <div className="bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-200 rounded-xl p-6 mb-8 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                          <Database className="w-5 h-5 text-orange-600" />
                          Demo Data Management
                        </h2>
                        <p className="text-sm text-gray-600 mt-1">Quick access to reset and manage test data</p>
                      </div>
                      <Link
                        href="/dashboard/admin/reset-demo-x7k9p2"
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-medium text-sm flex items-center gap-2"
                      >
                        <Database className="w-4 h-4" />
                        Manage
                      </Link>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div className="bg-white/60 rounded-lg p-3">
                        <div className="text-xs text-gray-600 mb-1">Test Invoices</div>
                        <div className="text-lg font-bold text-gray-900">{stats.totalCustomerInvoices}</div>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3">
                        <div className="text-xs text-gray-600 mb-1">Test POs</div>
                        <div className="text-lg font-bold text-gray-900">{stats.totalPOs}</div>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3">
                        <div className="text-xs text-gray-600 mb-1">Test DNs</div>
                        <div className="text-lg font-bold text-gray-900">-</div>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3">
                        <div className="text-xs text-gray-600 mb-1">Matches</div>
                        <div className="text-lg font-bold text-gray-900">{stats.totalARMatches}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Main Modules Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    {/* Module 1: Sales & Invoices (A/R) */}
                    <Link 
                        href="/dashboard/invoices"
                        className="bg-white rounded-xl border-2 border-gray-200 hover:border-green-500 p-6 shadow-sm hover:shadow-lg transition group"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-500 transition">
                                <Receipt className="w-8 h-8 text-green-600 group-hover:text-white transition" />
                            </div>
                            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                                Sales
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Sales & Invoices</h3>
                        <p className="text-gray-600 text-sm mb-4">Manage customer invoices and track receivables (A/R)</p>
                        <div className="space-y-2 mb-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Total Invoices</span>
                                <span className="font-semibold text-gray-900">{stats.totalCustomerInvoices}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Pending</span>
                                <span className="font-semibold text-yellow-600">{stats.pendingCustomerInvoices}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Paid</span>
                                <span className="font-semibold text-green-600">{stats.paidCustomerInvoices}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-green-50 border-2 border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition font-semibold text-sm">
                            <FileText className="w-4 h-4" />
                            View Invoices
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    </Link>

                    {/* Module 2: Suppliers & Payables (A/P) */}
                    <Link 
                        href="/dashboard/suppliers"
                        className="bg-white rounded-xl border-2 border-gray-200 hover:border-red-500 p-6 shadow-sm hover:shadow-lg transition group"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-red-100 rounded-lg group-hover:bg-red-500 transition">
                                <Building className="w-8 h-8 text-red-600 group-hover:text-white transition" />
                            </div>
                            <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">
                                Purchasing
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Suppliers & Payables</h3>
                        <p className="text-gray-600 text-sm mb-4">Manage supplier invoices and track payables (A/P)</p>
                        <div className="space-y-2 mb-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Total Invoices</span>
                                <span className="font-semibold text-gray-900">{stats.totalSupplierInvoices}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Pending</span>
                                <span className="font-semibold text-yellow-600">{stats.pendingSupplierInvoices}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Paid</span>
                                <span className="font-semibold text-green-600">{stats.paidSupplierInvoices}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-red-50 border-2 border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition font-semibold text-sm">
                            <Building className="w-4 h-4" />
                            View Suppliers
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    </Link>

                    {/* Module 3: Procurement */}
                    <Link 
                        href="/dashboard/procurement"
                        className="bg-white rounded-xl border-2 border-gray-200 hover:border-blue-500 p-6 shadow-sm hover:shadow-lg transition group"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-500 transition">
                                <Package className="w-8 h-8 text-blue-600 group-hover:text-white transition" />
                            </div>
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                                Procurement
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Procurement</h3>
                        <p className="text-gray-600 text-sm mb-4">Manage purchase orders and detect anomalies</p>
                        <div className="space-y-2 mb-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Total POs</span>
                                <span className="font-semibold text-gray-900">{stats.totalPOs}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Anomalies</span>
                                <span className="font-semibold text-red-600">{stats.anomaliesDetected}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-50 border-2 border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition font-semibold text-sm">
                            <Package className="w-4 h-4" />
                            View Procurement
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    </Link>

                    {/* Module 4: Reconciliation */}
                    <Link 
                        href="/dashboard/reconciliation"
                        className="bg-white rounded-xl border-2 border-gray-200 hover:border-yellow-500 p-6 shadow-sm hover:shadow-lg transition group"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-yellow-100 rounded-lg group-hover:bg-yellow-500 transition">
                                <Zap className="w-8 h-8 text-yellow-600 group-hover:text-white transition" />
                            </div>
                            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">
                                Reconciliation
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Reconciliation</h3>
                        <p className="text-gray-600 text-sm mb-4">Match bank transactions with invoices</p>
                        <div className="space-y-2 mb-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Total Transactions</span>
                                <span className="font-semibold text-gray-900">{stats.totalBankTransactions}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Reconciled</span>
                                <span className="font-semibold text-green-600">{stats.reconciledTransactions}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Unreconciled</span>
                                <span className="font-semibold text-red-600">{stats.unreconciledTransactions}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-yellow-50 border-2 border-yellow-200 text-yellow-700 rounded-lg hover:bg-yellow-100 transition font-semibold text-sm">
                            <Zap className="w-4 h-4" />
                            Auto-Reconcile
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    </Link>

                    {/* Module 5: Contacts */}
                    <Link 
                        href="/dashboard/contacts"
                        className="bg-white rounded-xl border-2 border-gray-200 hover:border-purple-500 p-6 shadow-sm hover:shadow-lg transition group"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-500 transition">
                                <User className="w-8 h-8 text-purple-600 group-hover:text-white transition" />
                            </div>
                            <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                                Contacts
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Contacts</h3>
                        <p className="text-gray-600 text-sm mb-4">Manage contacts and sync with Wafeq</p>
                        <div className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-purple-50 border-2 border-purple-200 text-purple-700 rounded-lg hover:bg-purple-100 transition font-semibold text-sm">
                            <User className="w-4 h-4" />
                            Manage Contacts
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    </Link>

                    {/* Module 6: Cashflow */}
                    <Link 
                        href="/dashboard/cashflow"
                        className="bg-white rounded-xl border-2 border-gray-200 hover:border-indigo-500 p-6 shadow-sm hover:shadow-lg transition group"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-indigo-100 rounded-lg group-hover:bg-indigo-500 transition">
                                <BarChart3 className="w-8 h-8 text-indigo-600 group-hover:text-white transition" />
                            </div>
                            <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-semibold">
                                Cashflow
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Cashflow Forecast</h3>
                        <p className="text-gray-600 text-sm mb-4">View cashflow projections and forecasts</p>
                        <div className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-indigo-50 border-2 border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 transition font-semibold text-sm">
                            <BarChart3 className="w-4 h-4" />
                            View Forecast
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    </Link>
                </div>

                {/* Cashflow Forecast Chart */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Cashflow Forecast</h2>
                            <p className="text-sm text-gray-600 mt-1">30-day projection</p>
                        </div>
                        <Link
                            href="/dashboard/cashflow"
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                            View Details →
                        </Link>
                    </div>
                    {cashflowData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={cashflowData}>
                                <defs>
                                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorIncoming" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorOutgoing" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                                <XAxis 
                                    dataKey="day" 
                                    tickFormatter={(value) => `Day ${value}`}
                                    stroke="#6B7280"
                                />
                                <YAxis 
                                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                                    stroke="#6B7280"
                                />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                                    formatter={(value: number | undefined) => [`${(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`, '']}
                                    labelFormatter={(label) => `Day ${label}`}
                                />
                                <Legend />
                                <Area 
                                    type="monotone" 
                                    dataKey="balance" 
                                    stroke="#3B82F6" 
                                    fillOpacity={1} 
                                    fill="url(#colorBalance)"
                                    name="Balance"
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="incoming" 
                                    stroke="#10B981" 
                                    fillOpacity={1} 
                                    fill="url(#colorIncoming)"
                                    name="Incoming"
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="outgoing" 
                                    stroke="#EF4444" 
                                    fillOpacity={1} 
                                    fill="url(#colorOutgoing)"
                                    name="Outgoing"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[300px] flex items-center justify-center text-gray-500">
                            <div className="text-center">
                                <BarChart3 className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                                <p>Loading cashflow data...</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
