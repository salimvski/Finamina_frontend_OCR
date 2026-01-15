'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;

  // Redirect to edit page instead of showing detail page
  useEffect(() => {
    router.replace(`/dashboard/invoices/${invoiceId}/edit`);
  }, [invoiceId, router]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to edit page...</p>
      </div>
    </div>
  );
}
