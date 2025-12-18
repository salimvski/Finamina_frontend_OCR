'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, TrendingUp, TrendingDown, AlertCircle, DollarSign, Calendar, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function CashflowPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [companyId, setCompanyId] = useState<string>('');
    const [companyName, setCompanyName] = useState<string>('');
    const [currentBalance, setCurrentBalance] = useState<number>(0);
    const [forecastData, setForecastData] = useState<any>(null);

    useEffect(() => {
        loadData();
    }, []);

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

            await calculateForecast(userData.company_id);
        }

        setLoading(false);
    };

    const calculateForecast = async (companyId: string) => {
        // Get current bank balance
        const { data: bankAccount } = await supabase
            .from('bank_accounts')
            .select('current_balance')
            .eq('company_id', companyId)
            .single();

        const balance = bankAccount?.current_balance || 0;
        setCurrentBalance(balance);

        // Get pending CUSTOMER invoices (money IN)
        const { data: customerInvoices } = await supabase
            .from('invoices')
            .select('id, invoice_number, amount, due_date, customer_id, customers(name)')
            .eq('company_id', companyId)
            .eq('status', 'pending')
            .order('due_date', { ascending: true });

        // Get pending SUPPLIER invoices (money OUT)
        const { data: supplierInvoices } = await supabase
            .from('supplier_invoices')
            .select('id, invoice_number, amount, due_date, supplier_id, suppliers(name)')
            .eq('company_id', companyId)
            .eq('status', 'pending')
            .order('due_date', { ascending: true });

        // Get customer payment history
        const { data: paidInvoices } = await supabase
            .from('invoices')
            .select('customer_id, invoice_date, paid_at')
            .eq('company_id', companyId)
            .eq('status', 'paid')
            .not('paid_at', 'is', null);

        // Calculate average days late per customer
        const customerStats: any = {};
        if (paidInvoices) {
            paidInvoices.forEach(inv => {
                const issueDate = new Date(inv.invoice_date);
                const paidDate = new Date(inv.paid_at);
                const daysLate = Math.floor((paidDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));

                if (!customerStats[inv.customer_id]) {
                    customerStats[inv.customer_id] = { total: 0, count: 0 };
                }
                customerStats[inv.customer_id].total += daysLate;
                customerStats[inv.customer_id].count += 1;
            });
        }

        // Build forecast arrays (next 30 days)
        const today = new Date();
        const forecast: any = {
            dates: [],
            inflow: [],        // Money coming IN (optimistic)
            outflow: [],       // Money going OUT (suppliers)
            netExpected: [],   // Net position (optimistic)
            netRealistic: []   // Net position (realistic - customers pay late)
        };

        let inflowBalance = balance;
        let outflowBalance = balance;
        let netExpectedBalance = balance;
        let netRealisticBalance = balance;

        // Generate 30 days
        for (let i = 0; i <= 30; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() + i);
            forecast.dates.push(date.toISOString().split('T')[0]);

            let dailyInflowExpected = 0;
            let dailyInflowRealistic = 0;
            let dailyOutflow = 0;

            // Calculate INFLOW (customer payments)
            if (customerInvoices && customerInvoices.length > 0) {
                customerInvoices.forEach(inv => {
                    const dueDate = new Date(inv.due_date);
                    const daysDiff = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const dueDaysDiff = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                    // Expected: payment on due date
                    if (dueDaysDiff === i) {
                        dailyInflowExpected += parseFloat(inv.amount) || 0;
                    }

                    // Realistic: adjust by customer's late payment history
                    const customerId = inv.customer_id;
                    const avgDaysLate = customerStats[customerId]
                        ? Math.floor(customerStats[customerId].total / customerStats[customerId].count)
                        : 15;

                    const realisticDays = dueDaysDiff + avgDaysLate;
                    if (realisticDays === i) {
                        dailyInflowRealistic += parseFloat(inv.amount) || 0;
                    }
                });
            }

            // Calculate OUTFLOW (supplier payments)
            if (supplierInvoices && supplierInvoices.length > 0) {
                supplierInvoices.forEach(inv => {
                    const dueDate = new Date(inv.due_date);
                    const dueDaysDiff = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                    // Assume we pay suppliers on due date
                    if (dueDaysDiff === i) {
                        dailyOutflow += parseFloat(inv.amount) || 0;
                    }
                });
            }

            // Update balances
            inflowBalance += dailyInflowExpected;
            outflowBalance -= dailyOutflow;
            netExpectedBalance += dailyInflowExpected - dailyOutflow;
            netRealisticBalance += dailyInflowRealistic - dailyOutflow;

            forecast.inflow.push(Math.round(inflowBalance));
            forecast.outflow.push(Math.round(outflowBalance));
            forecast.netExpected.push(Math.round(netExpectedBalance));
            forecast.netRealistic.push(Math.round(netRealisticBalance));
        }

        // Calculate summary stats with proper null handling
        const totalCustomerInvoices = customerInvoices?.reduce((sum, inv) => {
            const amount = parseFloat(inv.amount);
            return sum + (isNaN(amount) ? 0 : amount);
        }, 0) || 0;

        const totalSupplierInvoices = supplierInvoices?.reduce((sum, inv) => {
            const amount = parseFloat(inv.amount);
            return sum + (isNaN(amount) ? 0 : amount);
        }, 0) || 0;

        const netExpected30 = forecast.netExpected[30] || balance;
        const netRealistic30 = forecast.netRealistic[30] || balance;
        const gap = (netExpected30 || 0) - (netRealistic30 || 0);

        setForecastData({
            ...forecast,
            summary: {
                currentBalance: balance || 0,
                totalInflow: totalCustomerInvoices || 0,
                totalOutflow: totalSupplierInvoices || 0,
                netExpected30: netExpected30 || 0,
                netRealistic30: netRealistic30 || 0,
                gap: gap || 0,
                customerInvoicesCount: customerInvoices?.length || 0,
                supplierInvoicesCount: supplierInvoices?.length || 0
            }
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-4 text-gray-500">Loading forecast...</p>
                </div>
            </div>
        );
    }

    if (!forecastData || !forecastData.summary) {
        return (
            <div className="min-h-screen bg-gray-50 p-8">
                <div className="max-w-7xl mx-auto">
                    <Link href="/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
                        <ArrowLeft className="w-5 h-5" />
                        Back to Dashboard
                    </Link>
                    <div className="text-center py-12">
                        <p className="text-gray-500">Loading forecast data...</p>
                    </div>
                </div>
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
                        Invoices
                    </Link>
                    <Link href="/dashboard/transactions" className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition">
                        Bank Transactions
                    </Link>
                    <Link href="/dashboard/reconciliation" className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition">
                        Reconciliation History
                    </Link>
                    <button className="px-4 py-3 font-medium text-blue-600 border-b-2 border-blue-600">
                        Cashflow Forecast
                    </button>
                    <Link href="/dashboard/suppliers" className="px-4 py-3 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition">
                        Supplier Invoices
                    </Link>
                </div>

                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">30-Day Cashflow Forecast</h1>
                    <p className="text-gray-600">{companyName} - Complete cash position (in + out)</p>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Current Balance</span>
                            <DollarSign className="w-5 h-5 text-blue-600" />
                        </div>
                        <p className="text-2xl font-bold text-gray-900">
                            {(forecastData.summary.currentBalance || 0).toLocaleString()} SAR
                        </p>
                    </div>

                    <div className="bg-green-50 p-6 rounded-xl shadow-sm border border-green-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Expected IN</span>
                            <ArrowDownCircle className="w-5 h-5 text-green-600" />
                        </div>
                        <p className="text-2xl font-bold text-green-700">
                            +{(forecastData.summary.totalInflow || 0).toLocaleString()} SAR
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                            {forecastData.summary.customerInvoicesCount} customer invoices
                        </p>
                    </div>

                    <div className="bg-red-50 p-6 rounded-xl shadow-sm border border-red-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Expected OUT</span>
                            <ArrowUpCircle className="w-5 h-5 text-red-600" />
                        </div>
                        <p className="text-2xl font-bold text-red-700">
                            -{(forecastData.summary.totalOutflow || 0).toLocaleString()} SAR
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                            {forecastData.summary.supplierInvoicesCount} supplier invoices
                        </p>
                    </div>

                    <div className="bg-blue-50 p-6 rounded-xl shadow-sm border border-blue-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Net (Optimistic)</span>
                            <TrendingUp className="w-5 h-5 text-blue-600" />
                        </div>
                        <p className="text-2xl font-bold text-blue-700">
                            {(forecastData.summary.netExpected30 || 0).toLocaleString()} SAR
                        </p>
                        <p className="text-xs text-gray-600 mt-1">If paid on time</p>
                    </div>

                    <div className={`p-6 rounded-xl shadow-sm border ${(forecastData.summary.netRealistic30 || 0) < (forecastData.summary.currentBalance || 0)
                            ? 'bg-orange-50 border-orange-200'
                            : 'bg-green-50 border-green-200'
                        }`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Net (Realistic)</span>
                            <Calendar className="w-5 h-5 text-orange-600" />
                        </div>
                        <p className={`text-2xl font-bold ${(forecastData.summary.netRealistic30 || 0) < (forecastData.summary.currentBalance || 0)
                                ? 'text-orange-700'
                                : 'text-green-700'
                            }`}>
                            {(forecastData.summary.netRealistic30 || 0).toLocaleString()} SAR
                        </p>
                        <p className="text-xs text-gray-600 mt-1">Based on history</p>
                    </div>
                </div>

                {/* Alert if net position is negative or declining */}
                {((forecastData.summary.netRealistic30 || 0) < (forecastData.summary.currentBalance || 0) * 0.5) && (
                    <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 mb-8">
                        <div className="flex items-start gap-4">
                            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                            <div>
                                <h4 className="text-lg font-bold text-red-900 mb-2">⚠️ Critical Cash Flow Warning</h4>
                                <p className="text-red-800 mb-4">
                                    Your realistic cash position will drop by{' '}
                                    <strong>
                                        {forecastData.summary.currentBalance > 0
                                            ? `${Math.round((((forecastData.summary.currentBalance) - (forecastData.summary.netRealistic30)) / forecastData.summary.currentBalance) * 100)}%`
                                            : `${Math.abs(forecastData.summary.netRealistic30).toLocaleString()} SAR`
                                        }%
                                    </strong>{' '}
                                    in 30 days due to late customer payments and supplier obligations.
                                </p>
                                <div className="bg-white rounded-lg p-4 border border-red-200">
                                    <p className="font-semibold text-gray-900 mb-2">💡 Recommended Actions:</p>
                                    <ul className="space-y-2 text-sm text-gray-700">
                                        <li>• Chase high-risk customers immediately</li>
                                        <li>• Negotiate extended payment terms with suppliers</li>
                                        <li>• Consider securing a line of credit for cash buffer</li>
                                        <li>• Delay non-critical supplier payments where possible</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Forecast Chart */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-gray-900">Complete Cash Flow Forecast (30 Days)</h3>
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-green-500 rounded"></div>
                                <span className="text-sm text-gray-600">Money IN (optimistic)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-red-500 rounded"></div>
                                <span className="text-sm text-gray-600">Money OUT (suppliers)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                                <span className="text-sm text-gray-600">Net (optimistic)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-orange-500 rounded"></div>
                                <span className="text-sm text-gray-600">Net (realistic)</span>
                            </div>
                        </div>
                    </div>

                    <ResponsiveContainer width="100%" height={400}>
                        <LineChart
                            data={forecastData.dates.map((date: string, index: number) => ({
                                date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                                inflow: forecastData.inflow[index],
                                outflow: forecastData.outflow[index],
                                netExpected: forecastData.netExpected[index],
                                netRealistic: forecastData.netRealistic[index]
                            }))}
                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 12 }}
                                interval={4}
                            />
                            <YAxis
                                tick={{ fontSize: 12 }}
                                tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
                            />
                            <Tooltip
                                formatter={(value: any) => `${parseFloat(value).toLocaleString()} SAR`}
                                contentStyle={{
                                    backgroundColor: 'white',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    padding: '12px'
                                }}
                            />
                            <Legend
                                wrapperStyle={{ paddingTop: '20px' }}
                                formatter={(value) => {
                                    const labels: any = {
                                        inflow: 'Money IN (optimistic)',
                                        outflow: 'Money OUT (suppliers)',
                                        netExpected: 'Net Position (optimistic)',
                                        netRealistic: 'Net Position (realistic)'
                                    };
                                    return labels[value] || value;
                                }}
                            />
                            <Line
                                type="monotone"
                                dataKey="inflow"
                                stroke="#10b981"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                dot={false}
                            />
                            <Line
                                type="monotone"
                                dataKey="outflow"
                                stroke="#ef4444"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                dot={false}
                            />
                            <Line
                                type="monotone"
                                dataKey="netExpected"
                                stroke="#3b82f6"
                                strokeWidth={3}
                                dot={{ fill: '#3b82f6', r: 4 }}
                                activeDot={{ r: 6 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="netRealistic"
                                stroke="#f59e0b"
                                strokeWidth={3}
                                dot={{ fill: '#f59e0b', r: 4 }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}