'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, TrendingUp, TrendingDown, Calendar, AlertTriangle, DollarSign, Clock, Mail, Zap, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, PieChart, Pie, Cell } from 'recharts';

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
    const [selectedDay, setSelectedDay] = useState(45); // Default to day 45
    
    const [forecast, setForecast] = useState({
        currentCashPosition: 0, // Real current position (AR - AP)
        expectedIn90Days: 0,
        expectedOut90Days: 0,
        
        incomingPayments: [] as Payment[],
        outgoingPayments: [] as Payment[],
        
        criticalIncoming: [] as Payment[], // Due within 7 days AND not overdue
        criticalOutgoing: [] as Payment[],
        
        chartData: [] as Array<{
            date: string;
            day: number;
            balance: number;
            incoming: number;
            outgoing: number;
        }>,
        
        // Cash collection metrics
        totalOutstanding: 0,
        totalCollected: 0,
        collectionRate: 0,
        
        // DSO metrics
        dso: 0
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
        today.setHours(0, 0, 0, 0);
        const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
        const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Get ALL customer invoices (pending + paid) for calculations
        const { data: allCustomerInvoices } = await supabase
            .from('invoices')
            .select('amount, status, invoice_date, paid_at, due_date')
            .eq('company_id', company_id);

        // Calculate current cash position: Total Receivables - Total Payables
        const totalReceivables = (allCustomerInvoices || [])
            .filter(i => i.status === 'pending')
            .reduce((sum, i) => sum + parseFloat(i.amount || '0'), 0);

        const { data: allSupplierInvoices } = await supabase
            .from('supplier_invoices')
            .select('amount, status')
            .eq('company_id', company_id);

        const totalPayables = (allSupplierInvoices || [])
            .filter(i => i.status === 'pending')
            .reduce((sum, i) => sum + parseFloat(i.amount || '0'), 0);

        const currentCashPosition = totalReceivables - totalPayables;

        // Calculate cash collection metrics
        const totalOutstanding = totalReceivables;
        const totalCollected = (allCustomerInvoices || [])
            .filter(i => i.status === 'paid')
            .reduce((sum, i) => sum + parseFloat(i.amount || '0'), 0);
        const totalInvoiced = totalOutstanding + totalCollected;
        const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;

        // Calculate DSO (3 months rolling)
        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        
        const invoicesLast3Months = (allCustomerInvoices || [])
            .filter(i => {
                const invDate = new Date(i.invoice_date);
                return invDate >= threeMonthsAgo;
            });

        const totalRevenue3Months = invoicesLast3Months
            .reduce((sum, i) => sum + parseFloat(i.amount || '0'), 0);

        // Average receivables = (beginning + ending) / 2
        const endingReceivables = totalReceivables;
        const beginningReceivables = endingReceivables; // Simplified - could be improved with historical data
        const avgReceivables = (beginningReceivables + endingReceivables) / 2;

        const dso = totalRevenue3Months > 0 
            ? (avgReceivables / totalRevenue3Months) * 90 
            : 0;

        // Get customer invoices (money coming IN) - only pending and not overdue
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
            .gte('due_date', today.toISOString().split('T')[0]) // Only future due dates
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
        
        // Critical incoming: due within 7 days AND not overdue (already filtered above)
        const criticalIncoming = incomingPayments.filter(p => {
            const dueDate = new Date(p.due_date);
            return dueDate <= sevenDaysFromNow && dueDate >= today;
        });

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
            .gte('due_date', today.toISOString().split('T')[0]) // Only future due dates
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
        const criticalOutgoing = outgoingPayments.filter(p => {
            const dueDate = new Date(p.due_date);
            return dueDate <= sevenDaysFromNow && dueDate >= today;
        });

        // Generate chart data (daily cashflow for 90 days) starting from current position
        const chartData = [];
        let runningBalance = currentCashPosition; // Start from REAL current balance
        
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
            currentCashPosition,
            expectedIn90Days: expectedIn,
            expectedOut90Days: expectedOut,
            incomingPayments,
            outgoingPayments,
            criticalIncoming,
            criticalOutgoing,
            chartData,
            totalOutstanding,
            totalCollected,
            collectionRate,
            dso: Math.round(dso)
        });
    };

    const getDaysUntilDue = (dueDate: string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
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

    // Get cash position for selected day
    const selectedDayData = forecast.chartData.find(d => d.day === selectedDay) || forecast.chartData[0];
    const selectedDayBalance = selectedDayData?.balance || forecast.currentCashPosition;
    const selectedDayChange = selectedDayBalance - forecast.currentCashPosition;

    // Prepare data for circular chart (simplified visualization)
    const circularChartData = [
        { name: 'Incoming', value: forecast.expectedIn90Days, color: '#10b981' },
        { name: 'Outgoing', value: forecast.expectedOut90Days, color: '#ef4444' },
    ];

    const handleSendReminders = async (invoiceIds: string[]) => {
        // TODO: Implement reminder sending via n8n
        alert(`Sending reminders for ${invoiceIds.length} invoices...`);
    };

    const handleDynamicDiscounting = async (invoiceId: string) => {
        // TODO: Implement dynamic discounting
        alert('Dynamic discounting feature coming soon...');
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
                            <h1 className="text-3xl font-bold text-gray-900">Cash Flow Insights</h1>
                            <p className="text-gray-600 mt-1">Dynamic cash position and 90-day projection</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-8 py-8">
                {/* Dynamic Cash Position with Slider */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-8">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Dynamic Cash Position</h2>
                        <p className="text-gray-600">Cash flow projection over 90 days</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
                        {/* Circular Chart */}
                        <div className="lg:col-span-1 flex flex-col items-center">
                            <div className="relative w-64 h-64 mb-4">
                                <PieChart width={256} height={256}>
                                    <Pie
                                        data={circularChartData}
                                        cx={128}
                                        cy={128}
                                        innerRadius={80}
                                        outerRadius={120}
                                        startAngle={90}
                                        endAngle={-270}
                                        dataKey="value"
                                    >
                                        {circularChartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                </PieChart>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <p className="text-xs text-gray-600 mb-1">Cash Position at D+{selectedDay}</p>
                                    <p className={`text-3xl font-bold ${selectedDayBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {selectedDayBalance >= 0 ? '+' : ''}{selectedDayBalance.toLocaleString('en-US')}
                                    </p>
                                    <p className="text-sm text-gray-500">SAR</p>
                                    {selectedDayChange !== 0 && (
                                        <p className={`text-xs mt-1 ${selectedDayChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {selectedDayChange >= 0 ? '+' : ''}{selectedDayChange.toLocaleString('en-US')} vs Today
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Slider */}
                        <div className="lg:col-span-2">
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Projection Horizon: Day {selectedDay} / 90
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="90"
                                    value={selectedDay}
                                    onChange={(e) => setSelectedDay(parseInt(e.target.value))}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                                <div className="flex justify-between text-xs text-gray-500 mt-1">
                                    <span>Today</span>
                                    <span>10</span>
                                    <span>30</span>
                                    <span>60</span>
                                    <span>75</span>
                                    <span>90 days</span>
                                </div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-gray-600">Expected Incoming</p>
                                        <p className="text-lg font-bold text-green-600">
                                            +{forecast.expectedIn90Days.toLocaleString('en-US')} SAR
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600">Expected Outgoing</p>
                                        <p className="text-lg font-bold text-red-600">
                                            -{forecast.expectedOut90Days.toLocaleString('en-US')} SAR
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cash Collection Gauge & DSO */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Cash Collection Gauge */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Cash Collection</h3>
                        <div className="flex items-center justify-center mb-4">
                            <div className="relative w-48 h-48">
                                <svg className="transform -rotate-90" width="192" height="192">
                                    <circle
                                        cx="96"
                                        cy="96"
                                        r="80"
                                        stroke="#e5e7eb"
                                        strokeWidth="16"
                                        fill="none"
                                    />
                                    <circle
                                        cx="96"
                                        cy="96"
                                        r="80"
                                        stroke="#10b981"
                                        strokeWidth="16"
                                        fill="none"
                                        strokeDasharray={`${2 * Math.PI * 80}`}
                                        strokeDashoffset={`${2 * Math.PI * 80 * (1 - forecast.collectionRate / 100)}`}
                                        strokeLinecap="round"
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <p className="text-4xl font-bold text-gray-900">{forecast.collectionRate.toFixed(0)}%</p>
                                    <p className="text-sm text-gray-600">Collection Rate</p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Total Outstanding:</span>
                                <span className="font-semibold">{forecast.totalOutstanding.toLocaleString('en-US')} SAR</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Total Collected:</span>
                                <span className="font-semibold text-green-600">{forecast.totalCollected.toLocaleString('en-US')} SAR</span>
                            </div>
                        </div>
                    </div>

                    {/* DSO */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Days Sales Outstanding (DSO)</h3>
                        <div className="flex items-center justify-center mb-4">
                            <div className="text-center">
                                <p className="text-5xl font-bold text-blue-600 mb-2">{forecast.dso}</p>
                                <p className="text-lg text-gray-600">Days</p>
                            </div>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-4">
                            <p className="text-sm text-gray-700">
                                Calculated on a <strong>3-month rolling basis</strong>. 
                                Lower is better - indicates faster collection of receivables.
                            </p>
                        </div>
                    </div>
                </div>

                {/* 90-Day Cash Flow Chart */}
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
                                            balance: 'Net Balance',
                                            incoming: 'Money In',
                                            outgoing: 'Money Out'
                                        };
                                        const label = labels[name ?? ''] || name || 'Unknown';
                                        return [`${(value ?? 0).toLocaleString()} SAR`, label];
                                    }}
                                    labelFormatter={(label) => `Day ${label}`}
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
                            <span className="text-gray-600">Net Balance</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-0.5 bg-green-500 border-dashed border-t-2 border-green-500"></div>
                            <span className="text-gray-600">Money In</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-0.5 bg-red-500 border-dashed border-t-2 border-red-500"></div>
                            <span className="text-gray-600">Money Out</span>
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
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

                {/* Smart Recommendations with CTAs */}
                <div className="mt-8 bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
                        <span>💡</span> Smart Recommendations
                    </h3>
                    <div className="space-y-4">
                        {forecast.currentCashPosition < 0 && (
                            <div className="bg-white rounded-lg p-4 border border-blue-200">
                                <p className="text-sm text-blue-900 mb-3">
                                    <strong>Negative cash position:</strong> You have a deficit of {Math.abs(forecast.currentCashPosition).toLocaleString('en-US')} SAR. 
                                    Consider taking action to improve cash flow.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {forecast.criticalIncoming.length > 0 && (
                                        <button
                                            onClick={() => handleSendReminders(forecast.criticalIncoming.map(p => p.id))}
                                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-semibold"
                                        >
                                            <Mail className="w-4 h-4" />
                                            Send Reminders ({forecast.criticalIncoming.length})
                                        </button>
                                    )}
                                    <button
                                        onClick={() => router.push('/dashboard')}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-semibold"
                                    >
                                        <Zap className="w-4 h-4" />
                                        Review Pending Receivables
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        {forecast.criticalIncoming.length > 0 && (
                            <div className="bg-white rounded-lg p-4 border border-blue-200">
                                <p className="text-sm text-blue-900 mb-3">
                                    <strong>Follow up with {forecast.criticalIncoming.length} customer{forecast.criticalIncoming.length > 1 ? 's' : ''}</strong> whose payments are due soon - 
                                    this will bring in {forecast.criticalIncoming.reduce((sum, p) => sum + p.amount, 0).toFixed(0)} SAR.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => handleSendReminders(forecast.criticalIncoming.map(p => p.id))}
                                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-semibold"
                                    >
                                        <Send className="w-4 h-4" />
                                        Send Payment Reminders
                                    </button>
                                    <button
                                        onClick={() => handleDynamicDiscounting(forecast.criticalIncoming[0]?.id || '')}
                                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-semibold"
                                    >
                                        <DollarSign className="w-4 h-4" />
                                        Offer Early Payment Discount
                                    </button>
                                </div>
                            </div>
                        )}

                        {forecast.criticalOutgoing.length > 0 && (
                            <div className="bg-white rounded-lg p-4 border border-blue-200">
                                <p className="text-sm text-blue-900 mb-3">
                                    <strong>Priority action needed:</strong> {forecast.criticalOutgoing.length} supplier payment{forecast.criticalOutgoing.length > 1 ? 's' : ''} 
                                    due within 7 days totaling {forecast.criticalOutgoing.reduce((sum, p) => sum + p.amount, 0).toFixed(0)} SAR.
                                </p>
                                <button
                                    onClick={() => router.push('/dashboard/suppliers')}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-semibold"
                                >
                                    <AlertTriangle className="w-4 h-4" />
                                    Review Supplier Payments
                                </button>
                            </div>
                        )}

                        <div className="bg-white rounded-lg p-4 border border-blue-200">
                            <p className="text-sm text-blue-900 mb-3">
                                Review procurement anomalies to prevent overpaying suppliers and improve your cash position.
                            </p>
                            <button
                                onClick={() => router.push('/dashboard/procurement')}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-semibold"
                            >
                                <Zap className="w-4 h-4" />
                                Review Procurement Anomalies
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
