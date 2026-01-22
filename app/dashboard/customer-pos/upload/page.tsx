'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { validateFile } from '@/lib/validation';
import { safeApiCall } from '@/lib/error-handling';
import { ArrowLeft, Upload, FileText, Loader2, CheckCircle, X } from 'lucide-react';
import Link from 'next/link';

interface CustomerPO {
  id: string;
  po_number: string;
  amount: string;
  currency: string;
  status: string;
}

export default function UploadCustomerPOPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedPO, setUploadedPO] = useState<CustomerPO | null>(null);

  useEffect(() => {
    loadCompanyId();
  }, []);

  const loadCompanyId = async () => {
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
    }
    setLoading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateFile(file);
      if (!validation.isValid) {
        showToast(validation.error || 'Invalid file', 'error');
        return;
      }
      setSelectedFile(file);
      setUploadedPO(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showToast('Please select a file', 'error');
      return;
    }

    if (!companyId) {
      showToast('Company ID not found. Please refresh the page.', 'error');
      return;
    }

    setUploading(true);

    const result = await safeApiCall(
      async () => {
        const formData = new FormData();
        formData.append('data', selectedFile);
        formData.append('company_id', companyId);

        const response = await fetch('/upload-customer-po', {
          method: 'POST',
          body: formData
        });

        const responseText = await response.text();
        console.log('Upload Customer PO: API response status:', response.status);
        console.log('Upload Customer PO: API response body:', responseText.substring(0, 500));

        if (!response.ok) {
          let errorMessage = `Upload failed with status ${response.status}`;
          try {
            const errorJson = JSON.parse(responseText);
            errorMessage = errorJson.error || errorJson.message || responseText || errorMessage;
          } catch {
            errorMessage = responseText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        let responseData: any = { success: true };
        try {
          responseData = JSON.parse(responseText);
        } catch {
          if (responseText.toLowerCase().includes('error') || 
              responseText.toLowerCase().includes('failed') ||
              responseText.toLowerCase().includes('duplicate')) {
            throw new Error(responseText || 'Upload failed - API returned an error');
          }
          responseData = { success: true };
        }

        if (responseData.error || !responseData.success) {
          throw new Error(responseData.error || responseData.message || 'Upload failed');
        }

        return responseData.data || responseData;
      },
      { onError: (error) => showToast(error, 'error') }
    );

    if (result.success && result.data) {
      setUploadedPO(result.data);
      showToast('Customer PO uploaded successfully!', 'success');
      setSelectedFile(null);
      // Reset file input
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } else {
      showToast(result.error || 'Failed to upload customer PO', 'error');
    }

    setUploading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/dashboard/customer-pos"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Customer POs
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Upload Customer Purchase Order</h1>
          <p className="text-gray-600 mt-2">Upload a PDF or image of a customer purchase order</p>
        </div>

        {/* Upload Form */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="space-y-6">
            {/* File Upload Area */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select File <span className="text-red-500">*</span>
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition">
                <input
                  id="file-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <label
                  htmlFor="file-input"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <Upload className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-sm text-gray-600 mb-2">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">
                    PDF, JPG, PNG (max 10MB)
                  </p>
                </label>
              </div>
              {selectedFile && (
                <div className="mt-4 flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      const fileInput = document.getElementById('file-input') as HTMLInputElement;
                      if (fileInput) fileInput.value = '';
                    }}
                    className="p-1 text-gray-400 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Upload Button */}
            <div className="flex gap-4">
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Upload Customer PO
                  </>
                )}
              </button>
              <Link
                href="/dashboard/customer-pos"
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-semibold"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {uploadedPO && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-900 mb-2">
                  Customer PO Uploaded Successfully!
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">PO Number:</span>
                    <span className="font-medium text-gray-900">{uploadedPO.po_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-medium text-gray-900">
                      {uploadedPO.currency} {parseFloat(uploadedPO.amount || '0').toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className="font-medium text-gray-900 capitalize">{uploadedPO.status}</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <Link
                    href="/dashboard/customer-pos"
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium"
                  >
                    View All Customer POs
                  </Link>
                  <Link
                    href={`/dashboard/invoices/create?customer_po_id=${uploadedPO.id}`}
                    className="px-4 py-2 border border-green-600 text-green-700 rounded-lg hover:bg-green-50 transition text-sm font-medium"
                  >
                    Create Invoice from PO
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
