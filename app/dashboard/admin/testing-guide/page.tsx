'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, XCircle, Clock, FileText, Upload, ArrowRight, AlertCircle } from 'lucide-react';

export default function TestingGuidePage() {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/admin" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Back to Admin
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Testing Guide</h1>
          <p className="text-gray-600">Step-by-step testing instructions for all features</p>
        </div>

        {/* Quick Start */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            Quick Start
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Reset demo data: <Link href="/dashboard/admin/reset-demo-x7k9p2" className="text-blue-600 underline">Go to Reset Page</Link></li>
            <li>Generate test PDFs: <code className="bg-gray-200 px-2 py-1 rounded">npm run generate-test-pdfs-with-data &lt;customer_id&gt;</code></li>
            <li>Follow the flow below for each feature</li>
          </ol>
        </div>

        {/* A/R 3-Way Matching Flow */}
        <div className="bg-white rounded-lg shadow mb-6">
          <button
            onClick={() => toggleSection('ar')}
            className="w-full p-6 text-left flex items-center justify-between hover:bg-gray-50 transition"
          >
            <div>
              <h2 className="text-xl font-semibold mb-1">A/R 3-Way Matching Flow</h2>
              <p className="text-gray-600">Test Purchase Order → Delivery Note → Invoice matching</p>
            </div>
            <ArrowRight className={`w-5 h-5 transform transition ${expandedSection === 'ar' ? 'rotate-90' : ''}`} />
          </button>
          
          {expandedSection === 'ar' && (
            <div className="px-6 pb-6 border-t">
              <div className="mt-6 space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
                    Upload Purchase Order
                  </h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 ml-8">
                    <li>Go to <Link href="/dashboard/invoices" className="text-blue-600 underline">A/R Invoices</Link></li>
                    <li>Click "Upload PO" button in "Pending POs" tab</li>
                    <li>Upload <code className="bg-white px-2 py-1 rounded">PO-2026-001.pdf</code></li>
                    <li>Wait for processing (check toast notifications)</li>
                    <li><strong>Expected:</strong> PO appears in "Pending POs" list with status "Pending"</li>
                  </ol>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
                    Upload Delivery Note
                  </h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 ml-8">
                    <li>Stay in A/R Invoices page</li>
                    <li>Go to "3-Way Match" tab → "Delivery Notes" sub-tab</li>
                    <li>Click "Upload Delivery Note"</li>
                    <li>Upload <code className="bg-white px-2 py-1 rounded">DN-2026-001.pdf</code></li>
                    <li>Wait for processing</li>
                    <li><strong>Expected:</strong> DN appears in list, linked to PO-2026-001</li>
                  </ol>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
                    Create Invoice from PO
                  </h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 ml-8">
                    <li>Go back to "Pending POs" tab</li>
                    <li>Find PO-2026-001 and click "Generate Invoice"</li>
                    <li>Verify form is pre-filled with PO data (line items, amounts)</li>
                    <li>Review and submit</li>
                    <li><strong>Expected:</strong> Invoice created, redirected to invoice detail view</li>
                    <li><strong>Expected:</strong> PO status changes to "Invoiced"</li>
                  </ol>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
                    Run 3-Way Matching
                  </h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 ml-8">
                    <li>Go to "3-Way Match" tab → "Overview" sub-tab</li>
                    <li>Click "Run 3-Way Match" button</li>
                    <li>Wait for processing</li>
                    <li><strong>Expected:</strong> Match appears in "Matches" sub-tab</li>
                    <li><strong>Expected:</strong> Match status: "perfect" (all 3 documents match)</li>
                    <li><strong>Expected:</strong> No anomalies in "Anomalies" sub-tab</li>
                  </ol>
                </div>

                <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                  <h3 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Success Criteria
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-sm text-green-700">
                    <li>All 3 documents (PO, DN, Invoice) are linked</li>
                    <li>Match status shows "perfect"</li>
                    <li>Amounts match across all documents (SAR 21,677.50)</li>
                    <li>Line items match (3 items with same quantities)</li>
                    <li>No anomalies detected</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* File Upload Validation */}
        <div className="bg-white rounded-lg shadow mb-6">
          <button
            onClick={() => toggleSection('validation')}
            className="w-full p-6 text-left flex items-center justify-between hover:bg-gray-50 transition"
          >
            <div>
              <h2 className="text-xl font-semibold mb-1">File Upload Validation</h2>
              <p className="text-gray-600">Test error handling and validation</p>
            </div>
            <ArrowRight className={`w-5 h-5 transform transition ${expandedSection === 'validation' ? 'rotate-90' : ''}`} />
          </button>
          
          {expandedSection === 'validation' && (
            <div className="px-6 pb-6 border-t">
              <div className="mt-6 space-y-4">
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                  <h3 className="font-semibold text-yellow-800 mb-2">Test Cases</h3>
                  <ul className="list-disc list-inside space-y-2 text-sm text-yellow-700">
                    <li><strong>Invalid file type:</strong> Try uploading .txt, .docx - should show error toast</li>
                    <li><strong>File too large:</strong> Upload file &gt; 10MB - should show size error</li>
                    <li><strong>Empty file:</strong> Upload 0-byte file - should show error</li>
                    <li><strong>Network error:</strong> Disconnect internet, try upload - should show connection error</li>
                    <li><strong>Valid file:</strong> Upload PDF/JPG/PNG &lt; 10MB - should work</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* API Status */}
        <div className="bg-white rounded-lg shadow mb-6">
          <button
            onClick={() => toggleSection('api')}
            className="w-full p-6 text-left flex items-center justify-between hover:bg-gray-50 transition"
          >
            <div>
              <h2 className="text-xl font-semibold mb-1">API Endpoints Status</h2>
              <p className="text-gray-600">Check if all services are running</p>
            </div>
            <ArrowRight className={`w-5 h-5 transform transition ${expandedSection === 'api' ? 'rotate-90' : ''}`} />
          </button>
          
          {expandedSection === 'api' && (
            <div className="px-6 pb-6 border-t">
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="font-medium">N8N Server</span>
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    {process.env.NEXT_PUBLIC_N8N_URL ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="font-medium">Wafeq API</span>
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    {process.env.WAFEQ_API_KEY ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="font-medium">Supabase</span>
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    {process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Troubleshooting */}
        <div className="bg-white rounded-lg shadow">
          <button
            onClick={() => toggleSection('troubleshooting')}
            className="w-full p-6 text-left flex items-center justify-between hover:bg-gray-50 transition"
          >
            <div>
              <h2 className="text-xl font-semibold mb-1">Troubleshooting</h2>
              <p className="text-gray-600">Common issues and solutions</p>
            </div>
            <ArrowRight className={`w-5 h-5 transform transition ${expandedSection === 'troubleshooting' ? 'rotate-90' : ''}`} />
          </button>
          
          {expandedSection === 'troubleshooting' && (
            <div className="px-6 pb-6 border-t">
              <div className="mt-6 space-y-4">
                <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                  <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Issue: Duplicate PO/DN/Invoice
                  </h3>
                  <p className="text-sm text-red-700 mb-2"><strong>Solution:</strong> Use Reset Demo Data to clean up, then re-upload</p>
                </div>
                <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                  <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Issue: OCR not matching customer
                  </h3>
                  <p className="text-sm text-red-700 mb-2"><strong>Solution:</strong> Ensure customer name in PDF matches exactly with database. Check company_name field.</p>
                </div>
                <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                  <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Issue: 3-way match not working
                  </h3>
                  <p className="text-sm text-red-700 mb-2"><strong>Solution:</strong> Verify PO number matches in all 3 documents. Check that all documents are linked (po_id, dn_id in invoice).</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
