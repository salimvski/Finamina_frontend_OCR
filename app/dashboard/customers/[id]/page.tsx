'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, User, Mail, Phone, FileText, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import { calculateRiskLevel, getRiskBadgeStyles } from '@/lib/customerRisk';

export default function CustomerDetailPage() {
    const router = useRouter();
    const params = useParams();
    const customerId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [customer, setCustomer] = useState<any>(null);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [stats, setStats] = useState({
        totalInvoices: 0,
        paidInvoices: 0,
        pendingInvoices: 0,
        totalAmount: 0,
        avgDaysToPayment: 0,
        riskLevel: 'low' as 'low' | 'medium' | 'high'
    });

    useEffect(() => {
        loadCustomerData();
    }, [customerId]);

    const loadCustomerData = async () => {
        // Get customer info
        const { data: customerData } = await supabase
            .from('customers')
            .select('*')
            .eq('id', customerId)
            .single();

        if (customerData) {
            setCustomer(customerData);

            // Get all invoices for this customer
            const { data: invoicesData } = await supabase
                .from('invoices')
                .select('*')
                .eq('customer_id', customerId)
                .order('invoice_date', { ascending: false });

            if (invoicesData) {
                setInvoices(invoicesData);

                // Calculate stats
                const total = invoicesData.length;
                const paid = invoicesData.filter(i => i.status === 'paid').length;
                const pending = invoicesData.filter(i => i.status === 'pending').length;
                const totalAmount = invoicesData.reduce((sum, i) => sum + parseFloat(i.amount), 0);

                // Calculate average days to payment
                const paidInvoices = invoicesData.filter(i => i.status === 'paid' && i.paid_at);
                let avgDays = 0;
                
                if (paidInvoices.length > 0) {
                    const totalDays = paidInvoices.reduce((sum, inv) => {
                        const dueDate = new Date(inv.due_date);
                        const paidDate = new Date(inv.paid_at);
                        const days = Math.floor((paidDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
                        return sum + days;
                    }, 0);
                    avgDays = Math.round(totalDays / paidInvoices.length);
                }

                const overdueCount = invoicesData.filter(i => i.status === 'overdue').length;
                const riskLevel = calculateRiskLevel(avgDays, overdueCount);

                setStats({
                    totalInvoices: total,
                    paidInvoices: paid,
                    pendingInvoices: pending,
                    totalAmount,
                    avgDaysToPayment: avgDays,
                    riskLevel
                });
            }
        }

        setLoading(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-4 text-gray-500">Loading customer...</p>
                </div>
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-500">Customer not found</p>
            </div>
        );
    }

    const riskStyles = getRiskBadgeStyles(stats.riskLevel);

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

                {/* Customer Header */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-8">
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-6">
                            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                                <User className="w-8 h-8 text-blue-600" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900 mb-2">{customer.name}</h1>
                                <div className="space-y-2">
                                    {customer.email && (
                                        <div className="flex items-center gap-2 text-gray-600">
                                            <Mail className="w-4 h-4" />
                                            <span className="text-sm">{customer.email}</span>
                                        </div>
                                    )}
                                    {customer.phone && (
                                        <div className="flex items-center gap-2 text-gray-600">
                                            <Phone className="w-4 h-4" />
                                            <span className="text-sm">{customer.phone}</span>
                                        </div>
                                    )}
                                    {customer.vat_number && (
                                        <div className="flex items-center gap-2 text-gray-600">
                                            <FileText className="w-4 h-4" />
                                            <span className="text-sm">VAT: {customer.vat_number}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Risk Badge */}
                        <div className={`px-4 py-2 rounded-lg border-2 ${riskStyles.bg} ${riskStyles.text} ${riskStyles.border}`}>
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5" />
                                <span className="font-bold">{riskStyles.label}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Total Invoices</span>
                            <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{stats.totalInvoices}</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Paid</span>
                            <FileText className="w-5 h-5 text-green-600" />
                        </div>
                        <p className="text-3xl font-bold text-green-700">{stats.paidInvoices}</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Pending</span>
                            <Clock className="w-5 h-5 text-yellow-600" />
                        </div>
                        <p className="text-3xl font-bold text-yellow-700">{stats.pendingInvoices}</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Avg Days Late</span>
                            <TrendingUp className="w-5 h-5 text-orange-600" />
                        </div>
                        <p className="text-3xl font-bold text-orange-700">
                            {stats.avgDaysToPayment > 0 ? `+${stats.avgDaysToPayment}` : stats.avgDaysToPayment}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">days after due date</p>
                    </div>
                </div>

                {/* Invoices List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                    <div className="p-6 border-b border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900">Invoice History</h3>
                    </div>

                    {invoices.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            No invoices for this customer yet.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid Date</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days Late</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {invoices.map((invoice) => {
                                        const daysLate = invoice.paid_at && invoice.due_date
                                            ? Math.floor((new Date(invoice.paid_at).getTime() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24))
                                            : null;

                                        return (
                                            <tr 
                                                key={invoice.id}
                                                onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                                                className="hover:bg-gray-50 cursor-pointer"
                                            >
                                                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                                    {invoice.invoice_number}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                    {new Date(invoice.invoice_date).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                    {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                    {invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString() : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-900 text-right font-medium">
                                                    {parseFloat(invoice.amount).toFixed(2)} {invoice.currency}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {daysLate !== null ? (
                                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                                            daysLate <= 0 
                                                                ? 'bg-green-100 text-green-800'
                                                                : daysLate <= 7
                                                                    ? 'bg-yellow-100 text-yellow-800'
                                                                    : 'bg-red-100 text-red-800'
                                                        }`}>
                                                            {daysLate > 0 ? `+${daysLate}` : daysLate} days
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-3 py-1 inline-flex text-xs font-semibold rounded-full ${
                                                        invoice.status === 'paid'
                                                            ? 'bg-green-100 text-green-800'
                                                            : invoice.status === 'overdue'
                                                                ? 'bg-red-100 text-red-800'
                                                                : 'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                        {invoice.status}
                                                    </span>
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