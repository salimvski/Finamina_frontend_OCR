'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowDownCircle, ArrowUpCircle, CheckCircle, Clock, ExternalLink, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface BankTransaction {
  id: string;
  lean_transaction_id: string;
  transaction_date: string;
  amount: number;
  type: string;
  credit_debit_indicator: string;
  description: string;
  merchant_name: string;
  is_reconciled: boolean;
  matched_invoice_id: string | null;
  created_at: string;
  invoice?: {
    invoice_number: string;
  };
}

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'reconciled' | 'unreconciled'>('all');
  const [companyId, setCompanyId] = useState<string>('');

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (companyId) {
      fetchTransactions();
    }
  }, [filter, companyId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }

    const { data: userData } = await supabase
      .from('users')
      .select('company_id')
      .eq('auth_user_id', session.user.id)
      .single();

    if (userData) {
      setCompanyId(userData.company_id);
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    
    let query = supabase
      .from('bank_transactions')
      .select(`
        *,
        invoice:invoices(invoice_number),
        bank_account:bank_accounts!inner(company_id)
      `)
      .eq('bank_account.company_id', companyId)
      .order('transaction_date', { ascending: false });

    if (filter === 'reconciled') {
      query = query.eq('is_reconciled', true);
    } else if (filter === 'unreconciled') {
      query = query.eq('is_reconciled', false);
    }

    const { data, error } = await query;

    if (!error && data) {
      setTransactions(data);
    }
    setLoading(false);
  };

  const stats = {
    total: transactions.length,
    reconciled: transactions.filter(t => t.is_reconciled).length,
    unreconciled: transactions.filter(t => !t.is_reconciled).length,
    totalAmount: transactions.reduce((sum, t) => 
      t.credit_debit_indicator === 'CREDIT' ? sum + t.amount : sum - t.amount, 0
    )
  };

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
          <Link
            href="/dashboard"
            className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition"
          >
            Invoices
          </Link>
          <Link
            href="/dashboard/transactions"
            className="px-4 py-3 font-medium text-blue-600 border-b-2 border-blue-600"
          >
            Bank Transactions
          </Link>
          <Link
            href="/dashboard/reconciliation"
            className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition"
          >
            Reconciliation History
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Bank Transactions</h1>
          <p className="text-gray-600">View all transactions fetched from your bank via Lean API</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Transactions</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Reconciled</p>
                <p className="text-2xl font-bold text-green-600">{stats.reconciled}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Unreconciled</p>
                <p className="text-2xl font-bold text-orange-600">{stats.unreconciled}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Net Amount</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.totalAmount.toFixed(2)} SAR
                </p>
              </div>
            </div>
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
              All Transactions
            </button>
            <button
              onClick={() => setFilter('reconciled')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filter === 'reconciled'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Reconciled
            </button>
            <button
              onClick={() => setFilter('unreconciled')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filter === 'unreconciled'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Unreconciled
            </button>
          </div>
        </div>

        {/* Transactions List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 mb-4">No transactions found.</p>
              <p className="text-sm text-gray-400">
                Run the reconciliation workflow in n8n to fetch transactions from Lean API.
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
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Matched Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {new Date(transaction.transaction_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {transaction.credit_debit_indicator === 'CREDIT' ? (
                            <>
                              <ArrowDownCircle className="w-5 h-5 text-green-600" />
                              <span className="text-sm font-medium text-green-600">CREDIT</span>
                            </>
                          ) : (
                            <>
                              <ArrowUpCircle className="w-5 h-5 text-red-600" />
                              <span className="text-sm font-medium text-red-600">DEBIT</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{transaction.description}</div>
                        {transaction.merchant_name && (
                          <div className="text-xs text-gray-500 mt-1">{transaction.merchant_name}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-semibold ${
                          transaction.credit_debit_indicator === 'CREDIT'
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}>
                          {transaction.credit_debit_indicator === 'CREDIT' ? '+' : '-'}
                          {transaction.amount.toFixed(2)} SAR
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {transaction.is_reconciled ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                            <CheckCircle className="w-4 h-4" />
                            Reconciled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
                            <Clock className="w-4 h-4" />
                            Unreconciled
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {transaction.matched_invoice_id && transaction.invoice ? (
                          <Link
                            href={`/dashboard/invoices/${transaction.matched_invoice_id}`}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            {transaction.invoice.invoice_number}
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
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