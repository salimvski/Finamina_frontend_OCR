'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Package, TrendingDown, AlertTriangle, CheckCircle, Clock,
    FileText, Upload, Search, Filter, ArrowLeft, Eye, XCircle,
    Loader2, Shield, TrendingUp, DollarSign, X, Plus
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/lib/toast';
import { validateFile } from '@/lib/validation';
import { getErrorMessage, safeApiCall, fetchWithTimeout } from '@/lib/error-handling';

interface UploadModal {
    isOpen: boolean;
    type: 'po' | 'dn' | 'invoice' | null;
    uploading: boolean;
    fileName: string;
    stage: 'idle' | 'uploading' | 'ocr' | 'saving' | 'success' | 'error';
    message: string;
    error?: string;
}

function ProcurementPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [companyId, setCompanyId] = useState('');
    const [activeTab, setActiveTab] = useState<'overview' | 'pos' | 'deliveries' | 'matches' | 'anomalies'>('overview');
    const [matching, setMatching] = useState(false);
    
    // Upload state
    const [uploadModal, setUploadModal] = useState<UploadModal>({
        isOpen: false,
        type: null,
        uploading: false,
        fileName: '',
        stage: 'idle',
        message: ''
    });
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Data states
    const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
    const [suppliersMap, setSuppliersMap] = useState<Record<string, string>>({});
    const [deliveryNotes, setDeliveryNotes] = useState<any[]>([]);
    const [matches, setMatches] = useState<any[]>([]);
    const [anomalies, setAnomalies] = useState<any[]>([]);
    const [stats, setStats] = useState({
        totalPOs: 0,
        pendingPOs: 0,
        totalDNs: 0,
        unmatchedInvoices: 0,
        perfectMatches: 0,
        anomaliesCount: 0,
        totalSpend: 0
    });

    useEffect(() => {
        loadData();
    }, []);

    // Check if we should open upload modal from URL parameter
    useEffect(() => {
        const uploadParam = searchParams.get('upload');
        if ((uploadParam === 'po' || uploadParam === 'dn') && !loading && companyId) {
            setUploadModal({
                isOpen: true,
                type: uploadParam as 'po' | 'dn',
                uploading: false,
                fileName: '',
                stage: 'idle',
                message: ''
            });
            // Clean up URL parameter
            router.replace('/dashboard/procurement', { scroll: false });
        }
    }, [searchParams, loading, companyId, router]);

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
            await Promise.all([
                loadPurchaseOrders(userData.company_id),
                loadSuppliers(userData.company_id),
                loadDeliveryNotes(userData.company_id),
                loadMatches(userData.company_id),
                loadAnomalies(userData.company_id),
            ]);
        }

        setLoading(false);
    };

    const loadPurchaseOrders = async (company_id: string) => {
        const { data, error } = await supabase
            .from('purchase_orders')
            .select('*')
            .eq('company_id', company_id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading purchase orders:', error);
            setPurchaseOrders([]);
            return;
        }
        if (data) setPurchaseOrders(data);
    };

    const loadSuppliers = async (company_id: string) => {
        const { data, error } = await supabase
            .from('suppliers')
            .select('id, name')
            .eq('company_id', company_id);

        if (error) {
            console.error('Error loading suppliers for procurement page:', error);
            setSuppliersMap({});
            return;
        }

        const map: Record<string, string> = {};
        (data || []).forEach((s: any) => {
            if (s.id) {
                map[s.id] = s.name || 'Unknown';
            }
        });
        setSuppliersMap(map);
    };

    const loadDeliveryNotes = async (company_id: string) => {
        const { data } = await supabase
            .from('delivery_notes')
            .select(`
                *,
                supplier:suppliers(name),
                purchase_order:purchase_orders(po_number)
            `)
            .eq('company_id', company_id)
            .order('created_at', { ascending: false });

        if (data) setDeliveryNotes(data);
    };

    const loadMatches = async (company_id: string) => {
        const { data } = await supabase
            .from('three_way_matches')
            .select(`
                *,
                purchase_order:purchase_orders(po_number),
                delivery_note:delivery_notes(dn_number),
                invoice:supplier_invoices(invoice_number)
            `)
            .eq('company_id', company_id)
            .order('created_at', { ascending: false });

        if (data) setMatches(data);
    };

    const loadAnomalies = async (company_id: string) => {
        const { data } = await supabase
            .from('procurement_anomalies')
            .select(`
                *,
                supplier:suppliers(name)
            `)
            .eq('company_id', company_id)
            .eq('status', 'open')
            .order('created_at', { ascending: false });

        if (data) setAnomalies(data);
    };

    const handleRunMatch = async () => {
        if (!companyId) return;

        setMatching(true);
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_N8N_URL}/webhook/run-three-way-match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ company_id: companyId })
            });

            if (response.ok) {
                alert('3-Way matching completed! Check anomalies tab.');
                await loadData();
            } else {
                alert('Matching failed. Check n8n logs.');
            }
        } catch (error) {
            alert('Error running match');
        } finally {
            setMatching(false);
        }
    };

    const openUploadModal = (type: 'po' | 'dn' | 'invoice') => {
        setUploadModal({
            isOpen: true,
            type,
            uploading: false,
            fileName: '',
            stage: 'idle',
            message: ''
        });
    };

    const closeUploadModal = () => {
        setUploadModal({
            isOpen: false,
            type: null,
            uploading: false,
            fileName: '',
            stage: 'idle',
            message: ''
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        
        if (!file || !companyId || !uploadModal.type) {
            if (!file) {
                showToast('Please select a file', 'error');
            }
            return;
        }

        // Validate file before upload
        const fileValidation = validateFile(file);
        if (!fileValidation.isValid) {
            showToast(fileValidation.error || 'Invalid file', 'error');
            if (e.target) {
                e.target.value = '';
            }
            return;
        }

        if (!process.env.NEXT_PUBLIC_N8N_URL) {
            showToast('N8N server URL is not configured', 'error');
            return;
        }

        setUploadModal(prev => ({
            ...prev,
            uploading: true,
            fileName: file.name,
            stage: 'uploading',
            message: 'Uploading file...'
        }));

        const result = await safeApiCall(
            async () => {
                const formData = new FormData();
                formData.append('data', file);
                formData.append('company_id', companyId);

                await new Promise(resolve => setTimeout(resolve, 500));

                setUploadModal(prev => ({
                    ...prev,
                    stage: 'ocr',
                    message: 'Reading document with AI...'
                }));

                let endpoint: string;
                if (uploadModal.type === 'po') {
                    endpoint = 'upload-purchase-order';
                } else if (uploadModal.type === 'dn') {
                    endpoint = 'upload-delivery-note';
                } else {
                    endpoint = 'upload-supplier-invoice';
                }

                const response = await fetchWithTimeout(
                    `${process.env.NEXT_PUBLIC_N8N_URL}/webhook/${endpoint}`,
                    {
                        method: 'POST',
                        body: formData
                    },
                    120000 // 2 minute timeout for file processing
                );

                if (!response.ok) {
                    const errorText = await response.text().catch(() => `Server error ${response.status}`);
                    throw new Error(getErrorMessage({ status: response.status, message: errorText }));
                }

                return { success: true };
            },
            { onError: (error) => {
                setUploadModal(prev => ({
                    ...prev,
                    stage: 'error',
                    message: 'Upload failed',
                    error: error
                }));
                showToast(error, 'error');
            }}
        );

        if (result.success) {
            setUploadModal(prev => ({
                ...prev,
                stage: 'success',
                message:
                    uploadModal.type === 'po'
                        ? 'Purchase Order uploaded successfully!'
                        : uploadModal.type === 'dn'
                        ? 'Delivery Note uploaded successfully!'
                        : 'Supplier Invoice uploaded successfully!'
            }));

            await loadData();

            setTimeout(() => {
                closeUploadModal();
            }, 2000);
        } else {
            setTimeout(() => {
                closeUploadModal();
            }, 5000);
        }
    };

    useEffect(() => {
        // Calculate stats
        const totalPOs = purchaseOrders.length;
        const pendingPOs = purchaseOrders.filter(po => po.status === 'pending').length;
        const totalDNs = deliveryNotes.length;
        const perfectMatches = matches.filter(m => m.match_status === 'perfect').length;
        const anomaliesCount = anomalies.length;
        // Support both legacy `amount` and newer `total_amount` fields
        const totalSpend = purchaseOrders.reduce((sum, po) => {
            const value = po.total_amount ?? po.amount ?? 0;
            const num = typeof value === 'number' ? value : parseFloat(value || '0');
            return sum + (isNaN(num) ? 0 : num);
        }, 0);

        setStats({
            totalPOs,
            pendingPOs,
            totalDNs,
            unmatchedInvoices: 0,
            perfectMatches,
            anomaliesCount,
            totalSpend
        });
    }, [purchaseOrders, deliveryNotes, matches, anomalies]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Upload Modal */}
            {uploadModal.isOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200">
                            <h3 className="text-xl font-bold text-gray-900">
                                Upload{" "}
                                {uploadModal.type === 'po'
                                    ? 'Purchase Order'
                                    : uploadModal.type === 'dn'
                                    ? 'Delivery Note'
                                    : 'Supplier Invoice'}
                            </h3>
                            {!uploadModal.uploading && (
                                <button onClick={closeUploadModal} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-6 h-6" />
                                </button>
                            )}
                        </div>

                        <div className="p-6">
                            {uploadModal.stage === 'idle' && (
                                <div>
                                    <p className="text-gray-600 mb-4">
                                        Select a{" "}
                                        {uploadModal.type === 'po'
                                            ? 'Purchase Order'
                                            : uploadModal.type === 'dn'
                                            ? 'Delivery Note'
                                            : 'Supplier Invoice'}{" "}
                                        document (PDF, JPG, PNG)
                                    </p>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*,.pdf"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                        id="procurement-file-upload"
                                    />
                                    <label
                                        htmlFor="procurement-file-upload"
                                        className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition"
                                    >
                                        <Upload className="w-5 h-5" />
                                        Choose File
                                    </label>
                                </div>
                            )}

                            {uploadModal.stage !== 'idle' && (
                                <div className={`p-4 rounded-lg border ${
                                    uploadModal.stage === 'success' ? 'bg-green-50 border-green-200' :
                                    uploadModal.stage === 'error' ? 'bg-red-50 border-red-200' :
                                    'bg-blue-50 border-blue-200'
                                }`}>
                                    <div className="flex items-start gap-3">
                                        {uploadModal.stage === 'success' && <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />}
                                        {uploadModal.stage === 'error' && <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
                                        {['uploading', 'ocr', 'saving'].includes(uploadModal.stage) && (
                                            <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0 mt-0.5" />
                                        )}

                                        <div className="flex-1">
                                            <p className={`font-medium ${
                                                uploadModal.stage === 'success' ? 'text-green-900' :
                                                uploadModal.stage === 'error' ? 'text-red-900' :
                                                'text-blue-900'
                                            }`}>
                                                {uploadModal.fileName}
                                            </p>
                                            <p className={`text-sm ${
                                                uploadModal.stage === 'success' ? 'text-green-700' :
                                                uploadModal.stage === 'error' ? 'text-red-700' :
                                                'text-blue-700'
                                            }`}>
                                                {uploadModal.message}
                                            </p>
                                            {uploadModal.error && (
                                                <p className="text-sm text-red-600 mt-2">{uploadModal.error}</p>
                                            )}

                                            {['uploading', 'ocr', 'saving'].includes(uploadModal.stage) && (
                                                <div className="flex gap-2 mt-3">
                                                    <div className={`h-1 flex-1 rounded ${uploadModal.stage === 'uploading' ? 'bg-blue-600' : 'bg-blue-200'}`} />
                                                    <div className={`h-1 flex-1 rounded ${uploadModal.stage === 'ocr' ? 'bg-blue-600' : uploadModal.stage === 'saving' ? 'bg-blue-200' : 'bg-gray-200'}`} />
                                                    <div className={`h-1 flex-1 rounded ${uploadModal.stage === 'saving' ? 'bg-blue-600' : 'bg-gray-200'}`} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href="/dashboard" className="p-2 hover:bg-gray-100 rounded-lg">
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </Link>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Procurement Management</h1>
                                <p className="text-gray-600 mt-1">
                                    Upload POs, Delivery Notes and Supplier Invoices for 3-Way Matching
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <Link
                                href="/dashboard/procurement/create-po"
                                className="px-6 py-3 bg-white text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-2"
                            >
                                <Plus className="w-5 h-5" />
                                New PO
                            </Link>
                            <button
                                onClick={() => openUploadModal('po')}
                                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                            >
                                <Upload className="w-5 h-5" />
                                Upload PO
                            </button>
                            <button
                                onClick={() => openUploadModal('dn')}
                                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                            >
                                <Package className="w-5 h-5" />
                                Upload DN
                            </button>
                            <button
                                onClick={() => openUploadModal('invoice')}
                                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                            >
                                <FileText className="w-5 h-5" />
                                Upload Invoice
                            </button>
                            <button
                                onClick={handleRunMatch}
                                disabled={matching}
                                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 disabled:bg-gray-400"
                            >
                                {matching ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Matching...
                                    </>
                                ) : (
                                    <>
                                        <Shield className="w-5 h-5" />
                                        Run 3-Way Match
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-8 py-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-6 gap-6 mb-8">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <Package className="w-10 h-10 text-blue-500 mb-3" />
                        <p className="text-2xl font-bold text-gray-900">{stats.totalPOs}</p>
                        <p className="text-sm text-gray-600">Purchase Orders</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <Clock className="w-10 h-10 text-orange-500 mb-3" />
                        <p className="text-2xl font-bold text-orange-600">{stats.pendingPOs}</p>
                        <p className="text-sm text-gray-600">Pending POs</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <FileText className="w-10 h-10 text-purple-500 mb-3" />
                        <p className="text-2xl font-bold text-gray-900">{stats.totalDNs}</p>
                        <p className="text-sm text-gray-600">Delivery Notes</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <CheckCircle className="w-10 h-10 text-green-500 mb-3" />
                        <p className="text-2xl font-bold text-green-600">{stats.perfectMatches}</p>
                        <p className="text-sm text-gray-600">Perfect Matches</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <AlertTriangle className="w-10 h-10 text-red-500 mb-3" />
                        <p className="text-2xl font-bold text-red-600">{stats.anomaliesCount}</p>
                        <p className="text-sm text-gray-600">Anomalies</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <DollarSign className="w-10 h-10 text-gray-500 mb-3" />
                        <p className="text-2xl font-bold text-gray-900">{stats.totalSpend.toFixed(0)}</p>
                        <p className="text-sm text-gray-600">Total Spend</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
                    <div className="border-b border-gray-200">
                        <div className="flex gap-4 px-6">
                            {['overview', 'pos', 'deliveries', 'matches', 'anomalies'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab as any)}
                                    className={`py-4 px-4 border-b-2 font-medium transition ${
                                        activeTab === tab
                                            ? 'border-blue-600 text-blue-600'
                                            : 'border-transparent text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    {tab === 'pos' ? 'Purchase Orders' : 
                                     tab === 'deliveries' ? 'Delivery Notes' :
                                     tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-6">
                        {/* Overview Tab */}
                        {activeTab === 'overview' && (
                            <div className="space-y-6">
                                {/* AI Recommendations */}
                                <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6 border border-purple-200">
                                    <div className="flex items-start gap-4">
                                        <Shield className="w-8 h-8 text-purple-600 flex-shrink-0" />
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900 mb-2">AI Recommendations</h3>
                                            <div className="space-y-2">
                                                {anomalies.length > 0 ? (
                                                    <>
                                                        <p className="text-sm text-gray-700">
                                                            ⛔ <strong>Alert:</strong> {anomalies.length} anomalies detected - Review required
                                                        </p>
                                                        <p className="text-sm text-gray-700">
                                                            💡 Click "Anomalies" tab to see details
                                                        </p>
                                                    </>
                                                ) : (
                                                    <p className="text-sm text-gray-700">
                                                        ✅ <strong>All Clear:</strong> No anomalies detected. Your procurement is running smoothly!
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Recent Activity */}
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h3>
                                    {matches.length === 0 ? (
                                        <div className="text-center py-8">
                                            <p className="text-gray-500">No matching activity yet</p>
                                            <p className="text-sm text-gray-400 mt-1">Upload documents and run 3-way match to see results</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {matches.slice(0, 5).map((match) => (
                                                <div key={match.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                                    <div className="flex items-center gap-3">
                                                        {match.match_status === 'perfect' ? (
                                                            <CheckCircle className="w-5 h-5 text-green-600" />
                                                        ) : (
                                                            <AlertTriangle className="w-5 h-5 text-orange-600" />
                                                        )}
                                                        <div>
                                                            <p className="text-sm font-medium text-gray-900">
                                                                {match.match_type === '3-way' ? '3-Way Match' : '2-Way Match'}: 
                                                                PO {match.purchase_order?.po_number} → Invoice {match.invoice?.invoice_number}
                                                            </p>
                                                            <p className="text-xs text-gray-600">
                                                                Variance: {match.variance_percentage?.toFixed(2)}%
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                                        match.match_status === 'perfect'
                                                            ? 'bg-green-100 text-green-800'
                                                            : match.match_status === 'acceptable'
                                                            ? 'bg-yellow-100 text-yellow-800'
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {match.match_status.toUpperCase()}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Purchase Orders Tab */}
                        {activeTab === 'pos' && (
                            <div>
                                {purchaseOrders.length === 0 ? (
                                    <div className="text-center py-12">
                                        <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                        <p className="text-xl text-gray-600 mb-2">No Purchase Orders</p>
                                        <p className="text-gray-500 mb-4">Upload your first PO to get started</p>
                                        <button
                                            onClick={() => openUploadModal('po')}
                                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                        >
                                            Upload Purchase Order
                                        </button>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">PO Number</th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Supplier</th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                                                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                                                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {purchaseOrders.map((po) => (
                                                    <tr key={po.id} className="hover:bg-gray-50">
                                                        <td className="px-6 py-4 text-sm font-medium text-blue-600">
                                                            {po.po_number}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-gray-900">
                                                            {po.supplier_id && suppliersMap[po.supplier_id]
                                                                ? suppliersMap[po.supplier_id]
                                                                : 'Unknown'}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-gray-600">
                                                            {new Date(po.po_date).toLocaleDateString()}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">
                                                            {(() => {
                                                                const value = po.total_amount ?? po.amount ?? 0;
                                                                const num = typeof value === 'number' ? value : parseFloat(value || '0');
                                                                return `${(isNaN(num) ? 0 : num).toFixed(2)} ${po.currency}`;
                                                            })()}
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                                                po.status === 'pending' ? 'bg-orange-100 text-orange-800' :
                                                                po.status === 'delivered' ? 'bg-green-100 text-green-800' :
                                                                po.status === 'partial_delivered' ? 'bg-yellow-100 text-yellow-800' :
                                                                'bg-gray-100 text-gray-800'
                                                            }`}>
                                                                {po.status.replace('_', ' ').toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <Link
                                                                href={`/dashboard/procurement/po/${po.id}`}
                                                                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-full"
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                                View
                                                            </Link>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Delivery Notes Tab */}
                        {activeTab === 'deliveries' && (
                            <div>
                                {deliveryNotes.length === 0 ? (
                                    <div className="text-center py-12">
                                        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                        <p className="text-xl text-gray-600 mb-2">No Delivery Notes</p>
                                        <p className="text-gray-500 mb-4">Upload delivery receipts to track what you received</p>
                                        <button
                                            onClick={() => openUploadModal('dn')}
                                            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
                                        >
                                            Upload Delivery Note
                                        </button>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">DN Number</th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">PO Reference</th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Supplier</th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                                                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {deliveryNotes.map((dn) => (
                                                    <tr key={dn.id} className="hover:bg-gray-50">
                                                        <td className="px-6 py-4 text-sm font-medium text-blue-600">
                                                            {dn.dn_number}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-gray-600">
                                                            {dn.purchase_order?.po_number || 'N/A'}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-gray-900">
                                                            {dn.supplier?.name || 'Unknown'}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-gray-600">
                                                            {new Date(dn.delivery_date).toLocaleDateString()}
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                                                dn.status === 'received' ? 'bg-green-100 text-green-800' :
                                                                'bg-orange-100 text-orange-800'
                                                            }`}>
                                                                {dn.status.toUpperCase()}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Matches Tab */}
                        {activeTab === 'matches' && (
                            <div>
                                {matches.length === 0 ? (
                                    <div className="text-center py-12">
                                        <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                        <p className="text-xl text-gray-600 mb-2">No Matches Yet</p>
                                        <p className="text-gray-500 mb-4">Upload documents and click "Run 3-Way Match"</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {matches.map((match) => (
                                            <div key={match.id} className={`p-4 rounded-lg border-l-4 ${
                                                match.match_status === 'perfect' ? 'bg-green-50 border-green-500' :
                                                match.match_status === 'acceptable' ? 'bg-yellow-50 border-yellow-500' :
                                                'bg-red-50 border-red-500'
                                            }`}>
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <p className="font-semibold text-gray-900">
                                                            {match.match_type === '3-way' ? '3-Way Match' : '2-Way Match'}
                                                        </p>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            PO: {match.purchase_order?.po_number} | 
                                                            {match.delivery_note && ` DN: ${match.delivery_note.dn_number} |`}
                                                            Invoice: {match.invoice?.invoice_number}
                                                        </p>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            Variance: {match.variance_percentage?.toFixed(2)}% | 
                                                            Amount Diff: {match.amount_variance?.toFixed(2)} SAR
                                                        </p>
                                                    </div>
                                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                                        match.match_status === 'perfect' ? 'bg-green-100 text-green-800' :
                                                        match.match_status === 'acceptable' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-red-100 text-red-800'
                                                    }`}>
                                                        {match.match_status.toUpperCase()}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Anomalies Tab */}
                        {activeTab === 'anomalies' && (
                            <div className="space-y-4">
                                {anomalies.length === 0 ? (
                                    <div className="text-center py-12">
                                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                                        <p className="text-xl text-gray-600">No anomalies detected!</p>
                                        <p className="text-gray-500">Your procurement process is running smoothly</p>
                                    </div>
                                ) : (
                                    anomalies.map((anomaly) => (
                                        <div key={anomaly.id} className={`p-4 rounded-lg border-l-4 ${
                                            anomaly.severity === 'critical' ? 'bg-red-50 border-red-500' :
                                            anomaly.severity === 'high' ? 'bg-orange-50 border-orange-500' :
                                            'bg-yellow-50 border-yellow-500'
                                        }`}>
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-start gap-3">
                                                    <AlertTriangle className={`w-5 h-5 mt-0.5 ${
                                                        anomaly.severity === 'critical' ? 'text-red-600' :
                                                        anomaly.severity === 'high' ? 'text-orange-600' :
                                                        'text-yellow-600'
                                                    }`} />
                                                    <div>
                                                        <p className="font-semibold text-gray-900">{anomaly.description}</p>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            Supplier: {anomaly.supplier?.name} | 
                                                            Expected: {anomaly.expected_value} | 
                                                            Detected: {anomaly.detected_value}
                                                            {anomaly.variance_percentage && ` | Variance: ${anomaly.variance_percentage}%`}
                                                        </p>
                                                        <p className="text-xs text-gray-500 mt-1">
                                                            {new Date(anomaly.created_at).toLocaleString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                                    anomaly.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                                    anomaly.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                                                    'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                    {anomaly.severity.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ProcurementPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <ProcurementPageContent />
    </Suspense>
  );
}