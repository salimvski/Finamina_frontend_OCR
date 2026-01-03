'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowDownCircle, ArrowUpCircle, CheckCircle, Clock, ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Get current user and company
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
      setCompanyName(userData.companies[0]?.name ?? "");

      // Get bank accounts for this company
      const { data: accounts } = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('company_id', userData.company_id);

      if (accounts && accounts.length > 0) {
        const accountIds = accounts.map(a => a.id);

        // Get all transactions for these accounts
        const { data: txData } = await supabase
          .from('bank_transactions')
          .select(`
            *,
            invoice:invoices(invoice_number)
          `)
          .in('bank_account_id', accountIds)
          .order('transaction_date', { ascending: false });

        if (txData) {
          setTransactions(txData);
        }
      }
    }

    setLoading(false);
  };

  const stats = {
    total: transactions.length,
    reconciled: transactions.filter(t => t.is_reconciled).length,
    unreconciled: transactions.filter(t => !t.is_reconciled).length,
    credit: transactions.filter(t => t.credit_debit_indicator === 'CREDIT').length,
    debit: transactions.filter(t => t.credit_debit_indicator === 'DEBIT').length,
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

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Bank Transactions</h1>
          <p className="text-gray-600">{companyName} - Transactions from Lean API</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Total</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Credit (In)</p>
              <p className="text-3xl font-bold text-green-600">{stats.credit}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Debit (Out)</p>
              <p className="text-3xl font-bold text-red-600">{stats.debit}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Reconciled</p>
              <p className="text-3xl font-bold text-green-600">{stats.reconciled}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Unreconciled</p>
              <p className="text-3xl font-bold text-orange-600">{stats.unreconciled}</p>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-500">Loading transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Transactions Yet</h3>
              <p className="text-gray-500 mb-4">
                Run the reconciliation workflow in n8n to fetch transactions from Lean API.
              </p>
              <div className="text-sm text-gray-400 bg-gray-50 p-4 rounded-lg inline-block">
                <p className="font-mono">Company: {companyName}</p>
                <p className="font-mono">ID: {companyId}</p>
              </div>
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
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {new Date(tx.transaction_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        {tx.credit_debit_indicator === 'CREDIT' ? (
                          <div className="flex items-center gap-2">
                            <ArrowDownCircle className="w-5 h-5 text-green-600" />
                            <span className="text-sm font-medium text-green-600">CREDIT</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <ArrowUpCircle className="w-5 h-5 text-red-600" />
                            <span className="text-sm font-medium text-red-600">DEBIT</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <div className="text-sm text-gray-900 truncate">{tx.description || 'No description'}</div>
                        {tx.merchant_name && (
                          <div className="text-xs text-gray-500 truncate">{tx.merchant_name}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-semibold ${tx.credit_debit_indicator === 'CREDIT' ? 'text-green-600' : 'text-red-600'
                          }`}>
                          {tx.credit_debit_indicator === 'CREDIT' ? '+' : '-'}
                          {parseFloat(tx.amount).toFixed(2)} SAR
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {tx.is_reconciled ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                            <CheckCircle className="w-4 h-4" />
                            Matched
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                            <Clock className="w-4 h-4" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {tx.matched_invoice_id && tx.invoice ? (
                          <Link
                            href={`/dashboard/invoices/${tx.matched_invoice_id}`}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            {tx.invoice.invoice_number}
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