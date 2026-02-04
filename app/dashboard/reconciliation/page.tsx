'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    RefreshCw, Loader2, CheckCircle, XCircle, Clock, 
    TrendingUp, TrendingDown, DollarSign, AlertCircle,
    ArrowLeft, Search, Eye
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getBackendBaseUrl } from '@/lib/backend-url';

interface BankTransaction {
    id: string;
    lean_transaction_id: string;
    transaction_date: string;
    amount: string;
    credit_debit_indicator: string;
    description: string;
    merchant_name: string;
    creditor_name: string;
    debtor_name: string;
    matched_invoice_id: string | null;
    matched_supplier_invoice_id: string | null;
    invoice?: any;
    supplier_invoice?: any;
}

export default function ReconciliationPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [reconciling, setReconciling] = useState(false);
    const [transactions, setTransactions] = useState<BankTransaction[]>([]);
    const [companyId, setCompanyId] = useState<string>('');
    const [filterType, setFilterType] = useState<'all' | 'matched' | 'unmatched'>('all');
    const [filterDirection, setFilterDirection] = useState<'all' | 'credit' | 'debit'>('all');
    const [searchQuery, setSearchQuery] = useState('');

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
            .select('company_id')
            .eq('auth_user_id', user.id)
            .single();

        if (userData) {
            setCompanyId(userData.company_id);
            await loadTransactions(userData.company_id);
        }
    };

    const loadTransactions = async (company_id: string) => {
        const { data: bankAccountData } = await supabase
            .from('bank_accounts')
            .select('id')
            .eq('company_id', company_id)
            .single();

        if (!bankAccountData) {
            setLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from('bank_transactions')
            .select(`
                *,
                invoice:invoices(invoice_number, amount, customer:customers(name)),
                supplier_invoice:supplier_invoices(invoice_number, amount, supplier:suppliers(name))
            `)
            .eq('bank_account_id', bankAccountData.id)
            .order('transaction_date', { ascending: false });

        if (data) {
            setTransactions(data);
        }

        setLoading(false);
    };

    const handleReconcile = async () => {
        if (!companyId) return;
        const baseUrl = getBackendBaseUrl();
        if (!baseUrl) {
            alert('Backend URL is not configured. Set NEXT_PUBLIC_BACKEND_URL.');
            return;
        }
        const url = `${baseUrl}/webhook/lean-reconciliation?company_id=${encodeURIComponent(companyId)}`;
        setReconciling(true);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && (data.success !== false)) {
                const synced = data.synced ?? data.matches_applied ?? '';
                alert(synced !== '' ? `Reconciliation completed. ${synced} transactions synced.` : 'Reconciliation completed.');
                await loadTransactions(companyId);
            } else {
                alert(data.error || data.detail || `Reconciliation failed (${response.status})`);
            }
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Error during reconciliation');
        } finally {
            setReconciling(false);
        }
    };

    // Calculate stats
    const stats = {
        total: transactions.length,
        matched: transactions.filter(t => t.matched_invoice_id || t.matched_supplier_invoice_id).length,
        unmatched: transactions.filter(t => !t.matched_invoice_id && !t.matched_supplier_invoice_id).length,
        credits: transactions.filter(t => t.credit_debit_indicator === 'CREDIT').length,
        debits: transactions.filter(t => t.credit_debit_indicator === 'DEBIT').length,
        totalCredits: transactions
            .filter(t => t.credit_debit_indicator === 'CREDIT')
            .reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0),
        totalDebits: transactions
            .filter(t => t.credit_debit_indicator === 'DEBIT')
            .reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0),
    };

    // Filter transactions
    const filteredTransactions = transactions.filter(transaction => {
        const isMatched = transaction.matched_invoice_id || transaction.matched_supplier_invoice_id;
        
        const matchesType = 
            filterType === 'all' ? true :
            filterType === 'matched' ? isMatched :
            !isMatched;

        const matchesDirection =
            filterDirection === 'all' ? true :
            filterDirection === 'credit' ? transaction.credit_debit_indicator === 'CREDIT' :
            transaction.credit_debit_indicator === 'DEBIT';

        const matchesSearch = 
            transaction.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            transaction.merchant_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            transaction.creditor_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            transaction.debtor_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            transaction.invoice?.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            transaction.supplier_invoice?.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase());

        return matchesType && matchesDirection && matchesSearch;
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
                                <h1 className="text-3xl font-bold text-gray-900">Bank Reconciliation</h1>
                                <p className="text-gray-600 mt-1">Match bank transactions with invoices</p>
                            </div>
                        </div>

                        <button
                            onClick={handleReconcile}
                            disabled={reconciling}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 disabled:bg-gray-400 font-medium"
                        >
                            {reconciling ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Reconciling...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-5 h-5" />
                                    Reconcile
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-8 py-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-3">
                            <DollarSign className="w-10 h-10 text-blue-500" />
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                        <p className="text-sm text-gray-600">Total Transactions</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-3">
                            <CheckCircle className="w-10 h-10 text-green-500" />
                        </div>
                        <p className="text-2xl font-bold text-green-600">{stats.matched}</p>
                        <p className="text-sm text-gray-600">Matched</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-3">
                            <AlertCircle className="w-10 h-10 text-orange-500" />
                        </div>
                        <p className="text-2xl font-bold text-orange-600">{stats.unmatched}</p>
                        <p className="text-sm text-gray-600">Unmatched</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-3">
                            <TrendingUp className="w-10 h-10 text-blue-500" />
                        </div>
                        <p className="text-2xl font-bold text-blue-600">{stats.totalCredits.toFixed(2)}</p>
                        <p className="text-sm text-gray-600">Credits (SAR)</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-3">
                            <TrendingDown className="w-10 h-10 text-red-500" />
                        </div>
                        <p className="text-2xl font-bold text-red-600">{stats.totalDebits.toFixed(2)}</p>
                        <p className="text-sm text-gray-600">Debits (SAR)</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input
                                type="text"
                                placeholder="Search transactions..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div className="flex gap-2">
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value as any)}
                                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="all">All Status</option>
                                <option value="matched">Matched</option>
                                <option value="unmatched">Unmatched</option>
                            </select>

                            <select
                                value={filterDirection}
                                onChange={(e) => setFilterDirection(e.target.value as any)}
                                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="all">All Types</option>
                                <option value="credit">Credits (Income)</option>
                                <option value="debit">Debits (Expenses)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Transactions Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {filteredTransactions.length === 0 ? (
                        <div className="p-16 text-center">
                            <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-xl text-gray-600 mb-2">No transactions found</p>
                            <p className="text-gray-500">
                                {searchQuery ? 'Try a different search term' : 'Fetch transactions from Lean to get started'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Type</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase">Matched With</th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {filteredTransactions.map((transaction) => {
                                        const isMatched = transaction.matched_invoice_id || transaction.matched_supplier_invoice_id;
                                        const isCredit = transaction.credit_debit_indicator === 'CREDIT';

                                        return (
                                            <tr key={transaction.id} className="hover:bg-gray-50 transition">
                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                    {new Date(transaction.transaction_date).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                                                        isCredit 
                                                            ? 'bg-blue-100 text-blue-800' 
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {isCredit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                        {transaction.credit_debit_indicator}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-medium text-gray-900">
                                                        {transaction.description || transaction.merchant_name || 'N/A'}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {transaction.creditor_name || transaction.debtor_name || ''}
                                                    </p>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <p className={`text-sm font-semibold ${
                                                        isCredit ? 'text-green-600' : 'text-red-600'
                                                    }`}>
                                                        {isCredit ? '+' : '-'}{parseFloat(transaction.amount).toFixed(2)} SAR
                                                    </p>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {transaction.invoice ? (
                                                        <Link
                                                            href={`/dashboard/invoices/${transaction.matched_invoice_id}`}
                                                            className="text-blue-600 hover:underline text-sm"
                                                        >
                                                            Customer: {transaction.invoice.invoice_number}
                                                        </Link>
                                                    ) : transaction.supplier_invoice ? (
                                                        <Link
                                                            href={`/dashboard/suppliers/invoices/${transaction.matched_supplier_invoice_id}`}
                                                            className="text-green-600 hover:underline text-sm"
                                                        >
                                                            Supplier: {transaction.supplier_invoice.invoice_number}
                                                        </Link>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {isMatched ? (
                                                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                                                            <CheckCircle className="w-3 h-3" />
                                                            Matched
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                                                            <Clock className="w-3 h-3" />
                                                            Unmatched
                                                        </span>
                                                    )}
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
        </div>
    );
}