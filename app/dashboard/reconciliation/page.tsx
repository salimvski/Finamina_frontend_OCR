'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle, ExternalLink, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ReconciliationMatch {
  id: string;
  match_type: string;
  matched_at: string;
  invoice_id: string;
  invoice: {
    invoice_number: string;
    amount: number;
    customer: {
      name: string;
    };
  };
  bank_transaction: {
    lean_transaction_id: string;
    transaction_date: string;
    amount: number;
    description: string;
  };
}

export default function ReconciliationPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string>('');

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (companyId) {
      fetchMatches();
    }
  }, [companyId]);

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

  const fetchMatches = async () => {
    const { data, error } = await supabase
      .from('reconciliation_matches')
      .select(`
        *,
        invoice:invoices!inner(
          invoice_number,
          amount,
          company_id,
          customer:customers(name)
        ),
        bank_transaction:bank_transactions(
          lean_transaction_id,
          transaction_date,
          amount,
          description
        )
      `)
      .eq('invoice.company_id', companyId)
      .order('matched_at', { ascending: false });

    if (!error && data) {
      setMatches(data);
    }
    setLoading(false);
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
            className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition"
          >
            Bank Transactions
          </Link>
          <Link
            href="/dashboard/reconciliation"
            className="px-4 py-3 font-medium text-blue-600 border-b-2 border-blue-600"
          >
            Reconciliation History
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Reconciliation History</h1>
          <p className="text-gray-600">All automatically matched invoices and bank transactions</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Matches</p>
                <p className="text-2xl font-bold text-gray-900">{matches.length}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Auto-Matched</p>
                <p className="text-2xl font-bold text-blue-600">
                  {matches.filter(m => m.match_type === 'AUTO_EXACT_MATCH').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Amount</p>
                <p className="text-2xl font-bold text-gray-900">
                  {matches.reduce((sum, m) => sum + (m.invoice?.amount || 0), 0).toFixed(2)} SAR
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Matches List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading reconciliation history...</div>
          ) : matches.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 mb-4">No reconciliation matches yet.</p>
              <p className="text-sm text-gray-400">
                Run the workflow to start matching invoices with transactions.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {matches.map((match) => (
                <div key={match.id} className="p-6 hover:bg-gray-50 transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Match Type Badge */}
                      <div className="flex items-center gap-3 mb-4">
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                          <CheckCircle className="w-4 h-4" />
                          {match.match_type.replace('_', ' ')}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(match.matched_at).toLocaleString()}
                        </span>
                      </div>

                      {/* Invoice & Transaction Info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Invoice */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                            INVOICE
                          </div>
                          <Link
                            href={`/dashboard/invoices/${match.invoice_id}`}
                            className="text-lg font-bold text-blue-600 hover:text-blue-800 flex items-center gap-2"
                          >
                            {match.invoice?.invoice_number}
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                          <div className="text-sm text-gray-600">
                            Customer: {match.invoice?.customer?.name || 'Unknown'}
                          </div>
                          <div className="text-lg font-semibold text-gray-900">
                            {match.invoice?.amount.toFixed(2)} SAR
                          </div>
                        </div>

                        {/* Bank Transaction */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                            BANK TRANSACTION
                          </div>
                          <div className="text-sm font-mono text-gray-600">
                            ID: {match.bank_transaction?.lean_transaction_id.slice(0, 18)}...
                          </div>
                          <div className="text-sm text-gray-600">
                            Date: {new Date(match.bank_transaction?.transaction_date).toLocaleDateString()}
                          </div>
                          <div className="text-sm text-gray-600">
                            {match.bank_transaction?.description}
                          </div>
                          <div className="text-lg font-semibold text-green-600">
                            +{match.bank_transaction?.amount.toFixed(2)} SAR
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}