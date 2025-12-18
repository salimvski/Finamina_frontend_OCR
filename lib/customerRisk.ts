export interface CustomerRisk {
    customerId: string;
    riskLevel: 'low' | 'medium' | 'high';
    avgDaysLate: number;
    totalInvoices: number;
    paidInvoices: number;
    overdueInvoices: number;
}

export function calculateRiskLevel(avgDaysLate: number, overdueCount: number): 'low' | 'medium' | 'high' {
    // High risk: pays >15 days late OR has overdue invoices
    if (avgDaysLate > 15 || overdueCount > 0) {
        return 'high';
    }
    
    // Medium risk: pays 5-15 days late
    if (avgDaysLate >= 5) {
        return 'medium';
    }
    
    // Low risk: pays within 5 days of due date
    return 'low';
}

export function getRiskBadgeStyles(riskLevel: 'low' | 'medium' | 'high') {
    const styles = {
        low: {
            bg: 'bg-green-100',
            text: 'text-green-800',
            border: 'border-green-200',
            label: 'Low Risk'
        },
        medium: {
            bg: 'bg-yellow-100',
            text: 'text-yellow-800',
            border: 'border-yellow-200',
            label: 'Medium Risk'
        },
        high: {
            bg: 'bg-red-100',
            text: 'text-red-800',
            border: 'border-red-200',
            label: 'High Risk'
        }
    };
    
    return styles[riskLevel];
}