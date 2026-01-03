'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, TrendingUp, TrendingDown, Calendar, AlertTriangle, DollarSign, Clock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface Payment {
    id: string;
    type: 'customer' | 'supplier';
    invoice_number: string;
    party_name: string;
    amount: number;
    due_date: string;
    status: string;
}

export default function CashflowForecast() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [companyId, setCompanyId] = useState('');
    
    const [forecast, setForecast] = useState({
        currentBalance: 0,
        expectedIn90Days: 0,
        expectedOut90Days: 0,
        netPosition90Days: 0,
        
        incomingPayments: [] as Payment[],
        outgoingPayments: [] as Payment[],
        
        criticalIncoming: [] as Payment[], // Due within 7 days
        criticalOutgoing: [] as Payment[],
        
        chartData: [] as Array<{
            date: string;
            day: number;
            balance: number;
            incoming: number;
            outgoing: number;
        }>
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
            .select('company_id')
            .eq('auth_user_id', user.id)
            .single();

        if (userData) {
            setCompanyId(userData.company_id);
            await loadForecast(userData.company_id);
        }

        setLoading(false);
    };

    const loadForecast = async (company_id: string) => {
        const today = new Date();
        const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
        const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Get customer invoices (money coming IN)
        const { data: customerInvoices } = await supabase
            .from('invoices')
            .select(`
                id,
                invoice_number,
                amount,
                due_date,
                status,
                customer:customers(name)
            `)
            .eq('company_id', company_id)
            .eq('status', 'pending')
            .lte('due_date', ninetyDaysFromNow.toISOString())
            .order('due_date', { ascending: true });

        const incomingPayments: Payment[] = (customerInvoices || []).map(inv => ({
            id: inv.id,
            type: 'customer',
            invoice_number: inv.invoice_number,
            party_name: inv.customer?.[0]?.name || 'Unknown Customer',
            amount: parseFloat(inv.amount),
            due_date: inv.due_date,
            status: inv.status
        }));

        const expectedIn = incomingPayments.reduce((sum, p) => sum + p.amount, 0);
        const criticalIncoming = incomingPayments.filter(p => new Date(p.due_date) <= sevenDaysFromNow);

        // Get supplier invoices (money going OUT)
        const { data: supplierInvoices } = await supabase
            .from('supplier_invoices')
            .select(`
                id,
                invoice_number,
                amount,
                due_date,
                status,
                supplier:suppliers(name)
            `)
            .eq('company_id', company_id)
            .eq('status', 'pending')
            .lte('due_date', ninetyDaysFromNow.toISOString())
            .order('due_date', { ascending: true });

        const outgoingPayments: Payment[] = (supplierInvoices || []).map(inv => ({
            id: inv.id,
            type: 'supplier',
            invoice_number: inv.invoice_number,
            party_name: inv.supplier?.[0]?.name || 'Unknown Supplier',
            amount: parseFloat(inv.amount),
            due_date: inv.due_date,
            status: inv.status
        }));

        const expectedOut = outgoingPayments.reduce((sum, p) => sum + p.amount, 0);
        const criticalOutgoing = outgoingPayments.filter(p => new Date(p.due_date) <= sevenDaysFromNow);

        // Generate chart data (daily cashflow for 90 days)
        const chartData = [];
        let runningBalance = 0; // Start from current balance (you can replace with real balance later)
        
        for (let i = 0; i <= 90; i++) {
            const currentDate = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
            const dateStr = currentDate.toISOString().split('T')[0];
            
            // Calculate incoming for this day
            const dayIncoming = incomingPayments
                .filter(p => p.due_date.split('T')[0] === dateStr)
                .reduce((sum, p) => sum + p.amount, 0);
            
            // Calculate outgoing for this day
            const dayOutgoing = outgoingPayments
                .filter(p => p.due_date.split('T')[0] === dateStr)
                .reduce((sum, p) => sum + p.amount, 0);
            
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

        setForecast({
            currentBalance: 0,
            expectedIn90Days: expectedIn,
            expectedOut90Days: expectedOut,
            netPosition90Days: expectedIn - expectedOut,
            incomingPayments,
            outgoingPayments,
            criticalIncoming,
            criticalOutgoing,
            chartData
        });
    };

    const getDaysUntilDue = (dueDate: string) => {
        const today = new Date();
        const due = new Date(dueDate);
        const diff = due.getTime() - today.getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    const getPriorityLevel = (daysUntilDue: number) => {
        if (daysUntilDue < 0) return { label: 'OVERDUE', color: 'red' };
        if (daysUntilDue <= 7) return { label: 'CRITICAL', color: 'orange' };
        if (daysUntilDue <= 30) return { label: 'URGENT', color: 'yellow' };
        return { label: 'NORMAL', color: 'gray' };
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading forecast...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-8 py-6">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition">
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">90-Day Cashflow Forecast</h1>
                            <p className="text-gray-600 mt-1">Complete view of incoming and outgoing payments</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-8 py-8">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <DollarSign className="w-6 h-6 text-blue-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">Current Balance</p>
                        </div>
                        <p className="text-3xl font-bold text-gray-900 mb-1">
                            {forecast.currentBalance.toFixed(0)}
                        </p>
                        <p className="text-sm text-gray-500">SAR</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border-2 border-green-200 p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <TrendingUp className="w-6 h-6 text-green-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">Expected In (90d)</p>
                        </div>
                        <p className="text-3xl font-bold text-green-600 mb-1">
                            +{forecast.expectedIn90Days.toFixed(0)}
                        </p>
                        <p className="text-sm text-gray-500">{forecast.incomingPayments.length} customer invoices</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border-2 border-red-200 p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-red-100 rounded-lg">
                                <TrendingDown className="w-6 h-6 text-red-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">Expected Out (90d)</p>
                        </div>
                        <p className="text-3xl font-bold text-red-600 mb-1">
                            -{forecast.expectedOut90Days.toFixed(0)}
                        </p>
                        <p className="text-sm text-gray-500">{forecast.outgoingPayments.length} supplier invoices</p>
                    </div>

                    <div className={`bg-white rounded-xl shadow-sm border-2 ${
                        forecast.netPosition90Days >= 0 ? 'border-blue-200' : 'border-orange-200'
                    } p-6`}>
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`p-2 ${
                                forecast.netPosition90Days >= 0 ? 'bg-blue-100' : 'bg-orange-100'
                            } rounded-lg`}>
                                <Calendar className={`w-6 h-6 ${
                                    forecast.netPosition90Days >= 0 ? 'text-blue-600' : 'text-orange-600'
                                }`} />
                            </div>
                            <p className="text-sm font-medium text-gray-600">Net Position (90d)</p>
                        </div>
                        <p className={`text-3xl font-bold mb-1 ${
                            forecast.netPosition90Days >= 0 ? 'text-blue-600' : 'text-orange-600'
                        }`}>
                            {forecast.netPosition90Days >= 0 ? '+' : ''}{forecast.netPosition90Days.toFixed(0)}
                        </p>
                        <p className="text-sm text-gray-500">
                            {forecast.netPosition90Days >= 0 ? '✓ Positive flow' : '⚠ Deficit expected'}
                        </p>
                    </div>
                </div>

                {/* Cashflow Chart */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">90-Day Cash Flow Projection</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={forecast.chartData}>
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
                    </div>
                    <div className="mt-4 flex items-center justify-center gap-8 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-0.5 bg-blue-500"></div>
                            <span className="text-gray-600">Net Balance (solid line)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-0.5 bg-green-500 border-dashed border-t-2 border-green-500"></div>
                            <span className="text-gray-600">Money In (dashed)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-0.5 bg-red-500 border-dashed border-t-2 border-red-500"></div>
                            <span className="text-gray-600">Money Out (dashed)</span>
                        </div>
                    </div>
                </div>

                {/* Critical Alerts */}
                {(forecast.criticalIncoming.length > 0 || forecast.criticalOutgoing.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* Critical Incoming */}
                        {forecast.criticalIncoming.length > 0 && (
                            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
                                <div className="flex items-start gap-3 mb-4">
                                    <Clock className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                                    <div>
                                        <h3 className="text-lg font-bold text-green-900">
                                            💰 {forecast.criticalIncoming.length} Payment{forecast.criticalIncoming.length > 1 ? 's' : ''} Due Within 7 Days
                                        </h3>
                                        <p className="text-sm text-green-700 mt-1">
                                            Expected to receive: {forecast.criticalIncoming.reduce((sum, p) => sum + p.amount, 0).toFixed(0)} SAR
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {forecast.criticalIncoming.slice(0, 3).map(payment => (
                                        <div key={payment.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-green-200">
                                            <div>
                                                <p className="font-semibold text-sm text-gray-900">{payment.party_name}</p>
                                                <p className="text-xs text-gray-600">{payment.invoice_number}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-green-600 text-sm">{payment.amount.toFixed(0)} SAR</p>
                                                <p className="text-xs text-gray-600">{getDaysUntilDue(payment.due_date)} days</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Critical Outgoing */}
                        {forecast.criticalOutgoing.length > 0 && (
                            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
                                <div className="flex items-start gap-3 mb-4">
                                    <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                                    <div>
                                        <h3 className="text-lg font-bold text-red-900">
                                            ⚠️ {forecast.criticalOutgoing.length} Payment{forecast.criticalOutgoing.length > 1 ? 's' : ''} Due Within 7 Days
                                        </h3>
                                        <p className="text-sm text-red-700 mt-1">
                                            You need: {forecast.criticalOutgoing.reduce((sum, p) => sum + p.amount, 0).toFixed(0)} SAR ready
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {forecast.criticalOutgoing.slice(0, 3).map(payment => (
                                        <div key={payment.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-200">
                                            <div>
                                                <p className="font-semibold text-sm text-gray-900">{payment.party_name}</p>
                                                <p className="text-xs text-gray-600">{payment.invoice_number}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-red-600 text-sm">{payment.amount.toFixed(0)} SAR</p>
                                                <p className="text-xs text-gray-600">{getDaysUntilDue(payment.due_date)} days</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Payment Schedule Tables */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Incoming Payments (A/R) */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                        <div className="px-6 py-4 border-b border-gray-200 bg-green-50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <TrendingUp className="w-6 h-6 text-green-600" />
                                    <h2 className="text-lg font-bold text-gray-900">Incoming Payments</h2>
                                </div>
                                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                                    +{forecast.expectedIn90Days.toFixed(0)} SAR
                                </span>
                            </div>
                        </div>

                        <div className="overflow-x-auto max-h-96">
                            {forecast.incomingPayments.length === 0 ? (
                                <div className="p-8 text-center">
                                    <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-600">No incoming payments in next 90 days</p>
                                </div>
                            ) : (
                                <table className="w-full">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Customer</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Due</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {forecast.incomingPayments.map(payment => {
                                            const days = getDaysUntilDue(payment.due_date);
                                            const priority = getPriorityLevel(days);
                                            return (
                                                <tr key={payment.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm font-medium text-gray-900">{payment.party_name}</p>
                                                        <p className="text-xs text-gray-600">{payment.invoice_number}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <p className="text-sm font-bold text-green-600">{payment.amount.toFixed(0)} SAR</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                                            priority.color === 'red' ? 'bg-red-100 text-red-800' :
                                                            priority.color === 'orange' ? 'bg-orange-100 text-orange-800' :
                                                            priority.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                                                            'bg-gray-100 text-gray-800'
                                                        }`}>
                                                            {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* Outgoing Payments (A/P) */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                        <div className="px-6 py-4 border-b border-gray-200 bg-red-50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <TrendingDown className="w-6 h-6 text-red-600" />
                                    <h2 className="text-lg font-bold text-gray-900">Outgoing Payments</h2>
                                </div>
                                <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">
                                    -{forecast.expectedOut90Days.toFixed(0)} SAR
                                </span>
                            </div>
                        </div>

                        <div className="overflow-x-auto max-h-96">
                            {forecast.outgoingPayments.length === 0 ? (
                                <div className="p-8 text-center">
                                    <TrendingDown className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-600">No outgoing payments in next 90 days</p>
                                </div>
                            ) : (
                                <table className="w-full">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Supplier</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Due</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {forecast.outgoingPayments.map(payment => {
                                            const days = getDaysUntilDue(payment.due_date);
                                            const priority = getPriorityLevel(days);
                                            return (
                                                <tr key={payment.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm font-medium text-gray-900">{payment.party_name}</p>
                                                        <p className="text-xs text-gray-600">{payment.invoice_number}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <p className="text-sm font-bold text-red-600">{payment.amount.toFixed(0)} SAR</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                                            priority.color === 'red' ? 'bg-red-100 text-red-800' :
                                                            priority.color === 'orange' ? 'bg-orange-100 text-orange-800' :
                                                            priority.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                                                            'bg-gray-100 text-gray-800'
                                                        }`}>
                                                            {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>

                {/* Recommendations */}
                <div className="mt-8 bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-blue-900 mb-3 flex items-center gap-2">
                        <span>💡</span> Smart Recommendations
                    </h3>
                    <ul className="space-y-2 text-sm text-blue-800">
                        {forecast.netPosition90Days < 0 && (
                            <li className="flex items-start gap-2">
                                <span className="text-blue-600 mt-0.5">•</span>
                                <span>You have a negative cash position of {Math.abs(forecast.netPosition90Days).toFixed(0)} SAR in the next 90 days. Consider securing a line of credit or delaying non-critical supplier payments.</span>
                            </li>
                        )}
                        {forecast.criticalOutgoing.length > 0 && (
                            <li className="flex items-start gap-2">
                                <span className="text-blue-600 mt-0.5">•</span>
                                <span>Priority action needed: {forecast.criticalOutgoing.length} supplier payment{forecast.criticalOutgoing.length > 1 ? 's' : ''} due within 7 days totaling {forecast.criticalOutgoing.reduce((sum, p) => sum + p.amount, 0).toFixed(0)} SAR.</span>
                            </li>
                        )}
                        {forecast.criticalIncoming.length > 0 && (
                            <li className="flex items-start gap-2">
                                <span className="text-blue-600 mt-0.5">•</span>
                                <span>Follow up with {forecast.criticalIncoming.length} customer{forecast.criticalIncoming.length > 1 ? 's' : ''} whose payments are due soon - this will bring in {forecast.criticalIncoming.reduce((sum, p) => sum + p.amount, 0).toFixed(0)} SAR.</span>
                            </li>
                        )}
                        <li className="flex items-start gap-2">
                            <span className="text-blue-600 mt-0.5">•</span>
                            <span>Review procurement anomalies to prevent overpaying suppliers and improve your cash position.</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}