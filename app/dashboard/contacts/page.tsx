'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
    Plus, Search, Edit, Trash2, ArrowLeft, User, Mail, Phone, 
    Building, FileText, Loader2, RefreshCw, CheckCircle, XCircle, ChevronUp, ChevronDown
} from 'lucide-react';
import Link from 'next/link';

interface Contact {
    id: string;
    name?: string; // Legacy field, use company_name
    company_name: string; // Required - Wafeq field
    email?: string;
    phone?: string;
    tax_registration_number?: string; // Wafeq field (was vat_number)
    vat_number?: string; // Legacy field
    // Address fields - Wafeq structure
    city?: string;
    street_address?: string;
    building_number?: string;
    district?: string;
    address_additional_number?: string;
    postal_code?: string;
    country?: string;
    // Invoicing information
    contact_code?: string;
    relationship?: 'customer' | 'supplier' | 'both';
    payment_terms?: string;
    contact_id_type?: string;
    id_number?: string;
    // Contact defaults - Selling
    default_revenue_account?: string;
    default_revenue_cost_center?: string;
    default_revenue_tax_rate?: string;
    // Contact defaults - Purchasing
    default_expense_account?: string;
    default_expense_cost_center?: string;
    default_expense_tax_rate?: string;
    // Wafeq sync
    wafeq_id?: string;
    wafeq_synced_at?: string;
    wafeq_created_at?: string;
    company_id: string;
    created_at: string;
    updated_at: string;
}

export default function ContactsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [companyId, setCompanyId] = useState('');
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'customer' | 'supplier' | 'both'>('all');
    const [submitting, setSubmitting] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [deletingContact, setDeletingContact] = useState<string | null>(null);
    // Collapsible sections state
    const [expandedSections, setExpandedSections] = useState({
        address: false,
        invoicing: false,
        sellingDefaults: false,
        purchasingDefaults: false
    });

    const [formData, setFormData] = useState({
        // Business and VAT Treatment (Required)
        company_name: '', // Required
        country: 'Saudi Arabia',
        tax_registration_number: '',
        // Address (Optional)
        city: '',
        street_address: '',
        building_number: '',
        district: '',
        address_additional_number: '',
        postal_code: '',
        // Invoicing Information (Optional)
        contact_code: '',
        email: '',
        phone: '',
        relationship: 'customer' as 'customer' | 'supplier' | 'both',
        payment_terms: '',
        contact_id_type: '',
        id_number: '',
        // Contact Defaults - Selling (Optional)
        default_revenue_account: '',
        default_revenue_cost_center: '',
        default_revenue_tax_rate: '',
        // Contact Defaults - Purchasing (Optional)
        default_expense_account: '',
        default_expense_cost_center: '',
        default_expense_tax_rate: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        filterContacts();
    }, [contacts, searchTerm, typeFilter]);

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
            await loadContacts(userData.company_id);
        }

        setLoading(false);
    };

    const loadContacts = async (company_id: string) => {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('company_id', company_id)
            .order('name', { ascending: true });

        if (data) {
            // Map customers to contacts format - using Wafeq structure
            const mappedContacts: Contact[] = data.map((customer: any) => ({
                id: customer.id,
                name: customer.name || customer.company_name, // Legacy support
                company_name: customer.company_name || customer.name || '',
                email: customer.email,
                phone: customer.phone,
                tax_registration_number: customer.tax_registration_number || customer.vat_number,
                vat_number: customer.vat_number || customer.tax_registration_number, // Legacy
                // Address
                city: customer.city,
                street_address: customer.street_address,
                building_number: customer.building_number,
                district: customer.district,
                address_additional_number: customer.address_additional_number,
                postal_code: customer.postal_code,
                country: customer.country || 'Saudi Arabia',
                // Invoicing
                contact_code: customer.contact_code,
                relationship: customer.relationship || customer.contact_type || 'customer',
                payment_terms: customer.payment_terms,
                contact_id_type: customer.contact_id_type,
                id_number: customer.id_number,
                // Defaults
                default_revenue_account: customer.default_revenue_account,
                default_revenue_cost_center: customer.default_revenue_cost_center,
                default_revenue_tax_rate: customer.default_revenue_tax_rate,
                default_expense_account: customer.default_expense_account,
                default_expense_cost_center: customer.default_expense_cost_center,
                default_expense_tax_rate: customer.default_expense_tax_rate,
                // Wafeq sync
                wafeq_id: customer.wafeq_id,
                wafeq_synced_at: customer.wafeq_synced_at,
                wafeq_created_at: customer.wafeq_created_at,
                company_id: customer.company_id,
                created_at: customer.created_at,
                updated_at: customer.updated_at
            }));
            setContacts(mappedContacts);
        } else if (error) {
            console.error('Error loading contacts:', error);
        }
    };

    const filterContacts = () => {
        let filtered = [...contacts];

        // Search filter
        if (searchTerm) {
            filtered = filtered.filter(contact =>
                (contact.company_name || contact.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                contact.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                contact.phone?.includes(searchTerm) ||
                contact.tax_registration_number?.includes(searchTerm) ||
                contact.vat_number?.includes(searchTerm) ||
                contact.contact_code?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Type filter (using relationship field)
        if (typeFilter !== 'all') {
            filtered = filtered.filter(contact => contact.relationship === typeFilter);
        }

        setFilteredContacts(filtered);
    };

    const handleCreate = () => {
        setEditingContact(null);
        setFormData({
            company_name: '',
            country: 'Saudi Arabia',
            tax_registration_number: '',
            city: '',
            street_address: '',
            building_number: '',
            district: '',
            address_additional_number: '',
            postal_code: '',
            contact_code: '',
            email: '',
            phone: '',
            relationship: 'customer',
            payment_terms: '',
            contact_id_type: '',
            id_number: '',
            default_revenue_account: '',
            default_revenue_cost_center: '',
            default_revenue_tax_rate: '',
            default_expense_account: '',
            default_expense_cost_center: '',
            default_expense_tax_rate: ''
        });
        setExpandedSections({
            address: false,
            invoicing: false,
            sellingDefaults: false,
            purchasingDefaults: false
        });
        setShowCreateModal(true);
    };

    const handleEdit = (contact: Contact) => {
        setEditingContact(contact);
        setFormData({
            company_name: contact.company_name || contact.name || '',
            country: contact.country || 'Saudi Arabia',
            tax_registration_number: contact.tax_registration_number || contact.vat_number || '',
            city: contact.city || '',
            street_address: contact.street_address || '',
            building_number: contact.building_number || '',
            district: contact.district || '',
            address_additional_number: contact.address_additional_number || '',
            postal_code: contact.postal_code || '',
            contact_code: contact.contact_code || '',
            email: contact.email || '',
            phone: contact.phone || '',
            relationship: contact.relationship || 'customer',
            payment_terms: contact.payment_terms || '',
            contact_id_type: contact.contact_id_type || '',
            id_number: contact.id_number || '',
            default_revenue_account: contact.default_revenue_account || '',
            default_revenue_cost_center: contact.default_revenue_cost_center || '',
            default_revenue_tax_rate: contact.default_revenue_tax_rate || '',
            default_expense_account: contact.default_expense_account || '',
            default_expense_cost_center: contact.default_expense_cost_center || '',
            default_expense_tax_rate: contact.default_expense_tax_rate || ''
        });
        // Auto-expand sections that have data
        setExpandedSections({
            address: !!(contact.city || contact.street_address || contact.building_number || contact.district),
            invoicing: !!(contact.email || contact.phone || contact.contact_code || contact.relationship),
            sellingDefaults: !!(contact.default_revenue_account || contact.default_revenue_cost_center || contact.default_revenue_tax_rate),
            purchasingDefaults: !!(contact.default_expense_account || contact.default_expense_cost_center || contact.default_expense_tax_rate)
        });
        setShowCreateModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        
        // Validation
        if (!formData.company_name.trim()) {
            alert('Please enter a company name');
            setSubmitting(false);
            return;
        }

        if (!formData.email.trim()) {
            alert('Please enter an email address (required for sending reminders)');
            setSubmitting(false);
            return;
        }

        if (!formData.phone.trim()) {
            alert('Please enter a phone number (required for sending reminders)');
            setSubmitting(false);
            return;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email.trim())) {
            alert('Please enter a valid email address');
            setSubmitting(false);
            return;
        }

        try {
            // Prepare Wafeq payload
            const wafeqPayload = {
                company_name: formData.company_name.trim(),
                country: formData.country.trim() || 'Saudi Arabia',
                tax_registration_number: formData.tax_registration_number.trim() || null,
                city: formData.city.trim() || null,
                street_address: formData.street_address.trim() || null,
                building_number: formData.building_number.trim() || null,
                district: formData.district.trim() || null,
                address_additional_number: formData.address_additional_number.trim() || null,
                postal_code: formData.postal_code.trim() || null,
                contact_code: formData.contact_code.trim() || null,
                email: formData.email.trim() || null,
                phone: formData.phone.trim() || null,
                relationship: formData.relationship,
                payment_terms: formData.payment_terms.trim() || null,
                contact_id_type: formData.contact_id_type.trim() || null,
                id_number: formData.id_number.trim() || null,
                default_revenue_account: formData.default_revenue_account.trim() || null,
                default_revenue_cost_center: formData.default_revenue_cost_center.trim() || null,
                default_revenue_tax_rate: formData.default_revenue_tax_rate.trim() || null,
                default_expense_account: formData.default_expense_account.trim() || null,
                default_expense_cost_center: formData.default_expense_cost_center.trim() || null,
                default_expense_tax_rate: formData.default_expense_tax_rate.trim() || null
            };

            if (editingContact && editingContact.wafeq_id) {
                // UPDATE: Update in Wafeq first via our API route, then update Supabase
                const updateResponse = await fetch(`/api/wafeq/contacts/${editingContact.wafeq_id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(wafeqPayload)
                });

                if (!updateResponse.ok) {
                    const errorData = await updateResponse.json();
                    throw new Error(errorData.error || 'Wafeq update failed');
                }

                const updateResult = await updateResponse.json();
                const fetchedContact = updateResult.contact || wafeqPayload;
                const wafeqId = updateResult.wafeq_id || editingContact.wafeq_id;

                // Map Wafeq response (uses 'name') to our format (uses 'company_name')
                const companyName = fetchedContact.name || fetchedContact.company_name || formData.company_name;
                // Handle relationship - Wafeq returns array, we store as string
                const relationshipValue = Array.isArray(fetchedContact.relationship) 
                    ? (fetchedContact.relationship.length > 1 ? 'both' : fetchedContact.relationship[0])
                    : (fetchedContact.relationship || formData.relationship);

                // Update Supabase with data from Wafeq
                const { error } = await supabase
                    .from('customers')
                    .update({
                        company_name: companyName,
                        name: companyName, // Legacy field
                        country: fetchedContact.country || formData.country,
                        tax_registration_number: fetchedContact.tax_registration_number || formData.tax_registration_number,
                        vat_number: fetchedContact.tax_registration_number || formData.tax_registration_number, // Legacy
                        city: fetchedContact.address?.city || fetchedContact.city || formData.city,
                        street_address: fetchedContact.address?.street_address || fetchedContact.street_address || formData.street_address,
                        building_number: fetchedContact.address?.building_number || fetchedContact.building_number || formData.building_number,
                        district: fetchedContact.address?.district || fetchedContact.district || formData.district,
                        address_additional_number: fetchedContact.address?.address_additional_number || fetchedContact.address_additional_number || formData.address_additional_number,
                        postal_code: fetchedContact.address?.postal_code || fetchedContact.postal_code || formData.postal_code,
                        contact_code: fetchedContact.code || fetchedContact.contact_code || formData.contact_code,
                        email: fetchedContact.email || formData.email,
                        phone: fetchedContact.phone || formData.phone,
                        relationship: relationshipValue,
                        payment_terms: fetchedContact.payment_terms || formData.payment_terms,
                        contact_id_type: fetchedContact.contact_id_type || formData.contact_id_type,
                        id_number: fetchedContact.id_number || formData.id_number,
                        default_revenue_account: fetchedContact.selling_defaults?.default_revenue_account || fetchedContact.default_revenue_account || formData.default_revenue_account,
                        default_revenue_cost_center: fetchedContact.selling_defaults?.default_revenue_cost_center || fetchedContact.default_revenue_cost_center || formData.default_revenue_cost_center,
                        default_revenue_tax_rate: fetchedContact.selling_defaults?.default_revenue_tax_rate || fetchedContact.default_revenue_tax_rate || formData.default_revenue_tax_rate,
                        default_expense_account: fetchedContact.purchasing_defaults?.default_expense_account || fetchedContact.default_expense_account || formData.default_expense_account,
                        default_expense_cost_center: fetchedContact.purchasing_defaults?.default_expense_cost_center || fetchedContact.default_expense_cost_center || formData.default_expense_cost_center,
                        default_expense_tax_rate: fetchedContact.purchasing_defaults?.default_expense_tax_rate || fetchedContact.default_expense_tax_rate || formData.default_expense_tax_rate,
                        wafeq_id: wafeqId,
                        wafeq_synced_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', editingContact.id);

                if (error) throw error;
            } else {
                // CREATE: Create in Wafeq first via our API route, then save to Supabase
                const createResponse = await fetch('/api/wafeq/contacts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(wafeqPayload)
                });

                if (!createResponse.ok) {
                    const errorData = await createResponse.json();
                    throw new Error(errorData.error || 'Wafeq creation failed');
                }

                const createResult = await createResponse.json();
                const fetchedContact = createResult.contact || wafeqPayload;
                const wafeqId = createResult.wafeq_id;

                if (!wafeqId) {
                    throw new Error('Wafeq did not return a contact ID');
                }

                // Map Wafeq response (uses 'name') to our format (uses 'company_name')
                const companyName = fetchedContact.name || fetchedContact.company_name || formData.company_name;
                // Handle relationship - Wafeq returns array, we store as string
                const relationshipValue = Array.isArray(fetchedContact.relationship) 
                    ? (fetchedContact.relationship.length > 1 ? 'both' : fetchedContact.relationship[0])
                    : (fetchedContact.relationship || formData.relationship || 'customer');

                // Save to Supabase with data from Wafeq
                const { data, error } = await supabase
                    .from('customers')
                    .insert({
                        company_id: companyId,
                        company_name: companyName,
                        name: companyName, // Legacy field
                        country: fetchedContact.country || formData.country || 'Saudi Arabia',
                        tax_registration_number: fetchedContact.tax_registration_number || formData.tax_registration_number,
                        vat_number: fetchedContact.tax_registration_number || formData.tax_registration_number, // Legacy
                        city: fetchedContact.address?.city || fetchedContact.city || formData.city,
                        street_address: fetchedContact.address?.street_address || fetchedContact.street_address || formData.street_address,
                        building_number: fetchedContact.address?.building_number || fetchedContact.building_number || formData.building_number,
                        district: fetchedContact.address?.district || fetchedContact.district || formData.district,
                        address_additional_number: fetchedContact.address?.address_additional_number || fetchedContact.address_additional_number || formData.address_additional_number,
                        postal_code: fetchedContact.address?.postal_code || fetchedContact.postal_code || formData.postal_code,
                        contact_code: fetchedContact.code || fetchedContact.contact_code || formData.contact_code,
                        email: fetchedContact.email || formData.email,
                        phone: fetchedContact.phone || formData.phone,
                        relationship: relationshipValue,
                        payment_terms: fetchedContact.payment_terms || formData.payment_terms,
                        contact_id_type: fetchedContact.contact_id_type || formData.contact_id_type,
                        id_number: fetchedContact.id_number || formData.id_number,
                        default_revenue_account: fetchedContact.selling_defaults?.default_revenue_account || fetchedContact.default_revenue_account || formData.default_revenue_account,
                        default_revenue_cost_center: fetchedContact.selling_defaults?.default_revenue_cost_center || fetchedContact.default_revenue_cost_center || formData.default_revenue_cost_center,
                        default_revenue_tax_rate: fetchedContact.selling_defaults?.default_revenue_tax_rate || fetchedContact.default_revenue_tax_rate || formData.default_revenue_tax_rate,
                        default_expense_account: fetchedContact.purchasing_defaults?.default_expense_account || fetchedContact.default_expense_account || formData.default_expense_account,
                        default_expense_cost_center: fetchedContact.purchasing_defaults?.default_expense_cost_center || fetchedContact.default_expense_cost_center || formData.default_expense_cost_center,
                        default_expense_tax_rate: fetchedContact.purchasing_defaults?.default_expense_tax_rate || fetchedContact.default_expense_tax_rate || formData.default_expense_tax_rate,
                        wafeq_id: wafeqId,
                        wafeq_synced_at: new Date().toISOString(),
                        wafeq_created_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (error) throw error;
            }

            setShowCreateModal(false);
            await loadContacts(companyId);
        } catch (err: any) {
            console.error('Error saving contact:', err);
            alert('Failed to save contact: ' + (err.message || err));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (contactId: string) => {
        if (!confirm('Are you sure you want to delete this contact? This action cannot be undone.')) {
            return;
        }

        setDeletingContact(contactId);
        try {
            // Find contact to get wafeq_id
            const contact = contacts.find(c => c.id === contactId);
            
            // Delete from Wafeq first if wafeq_id exists
            if (contact?.wafeq_id) {
                const deleteResponse = await fetch(`/api/wafeq/contacts/${contact.wafeq_id}`, {
                    method: 'DELETE'
                });

                if (!deleteResponse.ok) {
                    const errorData = await deleteResponse.json();
                    console.warn('Wafeq delete failed:', errorData.error);
                    // Continue with local delete even if Wafeq delete fails
                }
            }

            // Delete from Supabase
            const { error } = await supabase
                .from('customers')
                .delete()
                .eq('id', contactId);

            if (error) throw error;

            await loadContacts(companyId);
        } catch (err: any) {
            console.error('Error deleting contact:', err);
            alert('Failed to delete contact: ' + err.message);
        } finally {
            setDeletingContact(null);
        }
    };


    const handleSyncAll = async () => {
        if (!confirm('Sync all contacts with Wafeq? This may take a while.')) {
            return;
        }

        if (!companyId) {
            alert('Company ID is missing. Please refresh the page.');
            return;
        }

        setSyncing(true);
        try {
            // Fetch all contacts from Wafeq via our API route
            const wafeqResponse = await fetch('/api/wafeq/contacts');
            
            if (!wafeqResponse.ok) {
                const errorData = await wafeqResponse.json();
                throw new Error(errorData.error || 'Failed to fetch contacts from Wafeq');
            }

            const wafeqData = await wafeqResponse.json();
            // Wafeq API returns contacts in a results array or directly as array
            const wafeqContacts = wafeqData.contacts || wafeqData.results || [];

            if (!Array.isArray(wafeqContacts)) {
                throw new Error('Invalid response format from Wafeq');
            }

            // Sync each contact
            let synced = 0;
            let errors = 0;
            
            for (const wafeqContact of wafeqContacts) {
                try {
                    // Check if contact exists in Supabase by wafeq_id
                    const { data: existing } = await supabase
                        .from('customers')
                        .select('id')
                        .eq('wafeq_id', wafeqContact.id)
                        .eq('company_id', companyId)
                        .single();

                    // Map Wafeq response to our format
                    // Wafeq uses 'name', we use 'company_name'
                    const companyName = wafeqContact.name || wafeqContact.company_name;
                    
                    // Handle relationship - Wafeq returns array, we store as string
                    let relationshipValue = 'customer';
                    if (Array.isArray(wafeqContact.relationship)) {
                        if (wafeqContact.relationship.length > 1 || 
                            (wafeqContact.relationship.includes('customer') && wafeqContact.relationship.includes('supplier'))) {
                            relationshipValue = 'both';
                        } else {
                            relationshipValue = wafeqContact.relationship[0] || 'customer';
                        }
                    } else if (wafeqContact.relationship) {
                        relationshipValue = wafeqContact.relationship;
                    }

                    const contactData = {
                        company_id: companyId,
                        company_name: companyName,
                        name: companyName, // Legacy field
                        country: wafeqContact.country || 'Saudi Arabia',
                        tax_registration_number: wafeqContact.tax_registration_number || null,
                        vat_number: wafeqContact.tax_registration_number || null, // Legacy
                        city: wafeqContact.address?.city || null,
                        street_address: wafeqContact.address?.street_address || null,
                        building_number: wafeqContact.address?.building_number || null,
                        district: wafeqContact.address?.district || null,
                        address_additional_number: wafeqContact.address?.address_additional_number || null,
                        postal_code: wafeqContact.address?.postal_code || null,
                        contact_code: wafeqContact.code || null,
                        email: wafeqContact.email || null,
                        phone: wafeqContact.phone || null,
                        relationship: relationshipValue,
                        payment_terms: wafeqContact.payment_terms || null,
                        contact_id_type: wafeqContact.contact_id_type || null,
                        id_number: wafeqContact.id_number || null,
                        default_revenue_account: wafeqContact.selling_defaults?.default_revenue_account || null,
                        default_revenue_cost_center: wafeqContact.selling_defaults?.default_revenue_cost_center || null,
                        default_revenue_tax_rate: wafeqContact.selling_defaults?.default_revenue_tax_rate || null,
                        default_expense_account: wafeqContact.purchasing_defaults?.default_expense_account || null,
                        default_expense_cost_center: wafeqContact.purchasing_defaults?.default_expense_cost_center || null,
                        default_expense_tax_rate: wafeqContact.purchasing_defaults?.default_expense_tax_rate || null,
                        wafeq_id: wafeqContact.id,
                        wafeq_synced_at: new Date().toISOString()
                    };

                    if (existing) {
                        // Update existing
                        const { error } = await supabase
                            .from('customers')
                            .update(contactData)
                            .eq('id', existing.id);
                        
                        if (error) {
                            console.error(`Error updating contact ${wafeqContact.id}:`, error);
                            errors++;
                            continue;
                        }
                    } else {
                        // Create new
                        const { error } = await supabase
                            .from('customers')
                            .insert(contactData);
                        
                        if (error) {
                            console.error(`Error creating contact ${wafeqContact.id}:`, error);
                            errors++;
                            continue;
                        }
                    }
                    synced++;
                } catch (err: any) {
                    console.error(`Error syncing contact ${wafeqContact.id}:`, err);
                    errors++;
                }
            }

            if (synced > 0) {
                alert(`Successfully synced ${synced} contact${synced > 1 ? 's' : ''} from Wafeq!${errors > 0 ? ` (${errors} failed)` : ''}`);
            } else if (errors > 0) {
                alert(`Failed to sync contacts. ${errors} error${errors > 1 ? 's' : ''} occurred.`);
            } else {
                alert('No contacts found in Wafeq to sync.');
            }
            await loadContacts(companyId);
        } catch (err: any) {
            console.error('Error syncing all contacts:', err);
            alert(`Error syncing contacts with Wafeq: ${err.message || 'Network error'}`);
        } finally {
            setSyncing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading contacts...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition">
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </Link>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Contacts</h1>
                                <p className="text-gray-600 mt-1">Manage your contacts and sync with Wafeq</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleSyncAll}
                                disabled={syncing}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                {syncing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Syncing...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="w-4 h-4" />
                                        Sync All with Wafeq
                                    </>
                                )}
                            </button>
                            <button
                                onClick={handleCreate}
                                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition"
                            >
                                <Plus className="w-5 h-5" />
                                Create Contact
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-8 py-8">
                {/* Filters */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by name, email, phone, or VAT..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        {/* Type Filter */}
                        <div className="relative">
                            <select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value as any)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                            >
                                <option value="all">All Types</option>
                                <option value="customer">Customers</option>
                                <option value="supplier">Suppliers</option>
                                <option value="both">Both</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Contacts Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {filteredContacts.length === 0 ? (
                        <div className="p-12 text-center">
                            <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-xl text-gray-600 mb-2">No contacts found</p>
                            <p className="text-gray-500 mb-4">
                                {searchTerm ? 'Try a different search term' : 'Create your first contact to get started'}
                            </p>
                            <button
                                onClick={handleCreate}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                            >
                                <Plus className="w-5 h-5" />
                                Create Contact
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto -mx-4 sm:mx-0">
                            <div className="inline-block min-w-full align-middle">
                                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                                    <table className="min-w-full divide-y divide-gray-300">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider min-w-[150px]">Company Name</th>
                                                <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider min-w-[180px]">Email</th>
                                                <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider min-w-[120px]">Phone</th>
                                                {/* <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider min-w-[140px]">VAT Number</th> */}
                                                <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider min-w-[120px]">Location</th>
                                                <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider min-w-[100px]">Type</th>
                                                <th scope="col" className="hidden md:table-cell px-3 py-3.5 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider min-w-[100px]">Wafeq Sync</th>
                                                <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-gray-900 uppercase tracking-wider min-w-[120px]">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 bg-white">
                                    {filteredContacts.map((contact) => (
                                        <tr key={contact.id} className="hover:bg-gray-50 transition">
                                            <td className="px-3 py-4">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                        <User className="w-5 h-5 text-blue-600" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-semibold text-gray-900 truncate" title={contact.company_name || contact.name}>
                                                            {contact.company_name || contact.name}
                                                        </p>
                                                        {contact.city && (
                                                            <p className="text-xs text-gray-500 truncate">{contact.city}{contact.country ? `, ${contact.country}` : ''}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap">
                                                {contact.email ? (
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                        <span className="text-sm text-gray-900 truncate max-w-[200px]" title={contact.email}>{contact.email}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap">
                                                {contact.phone ? (
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                        <span className="text-sm text-gray-900 truncate max-w-[150px]" title={contact.phone}>{contact.phone}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-4 hidden">
                                                {contact.tax_registration_number || contact.vat_number ? (
                                                    <div className="max-w-[120px]">
                                                        <span 
                                                            className="text-sm text-gray-900 block truncate" 
                                                            title={contact.tax_registration_number || contact.vat_number}
                                                        >
                                                            {contact.tax_registration_number || contact.vat_number}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-4">
                                                {contact.city || contact.street_address ? (
                                                    <div className="text-sm text-gray-900 min-w-0">
                                                        {contact.street_address && (
                                                            <div className="truncate max-w-[150px]" title={contact.street_address}>
                                                                {contact.street_address}
                                                            </div>
                                                        )}
                                                        {contact.city && (
                                                            <div className="text-xs text-gray-500 truncate max-w-[150px]">
                                                                {contact.city}{contact.district ? `, ${contact.district}` : ''}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                    contact.relationship === 'customer' ? 'bg-green-100 text-green-800' :
                                                    contact.relationship === 'supplier' ? 'bg-orange-100 text-orange-800' :
                                                    contact.relationship === 'both' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {contact.relationship || contact.contact_type || 'customer'}
                                                </span>
                                            </td>
                                            <td className="hidden md:table-cell px-3 py-4 whitespace-nowrap">
                                                {contact.wafeq_synced_at ? (
                                                    <div className="flex items-center gap-2">
                                                        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                                                        <span className="text-xs text-gray-600">
                                                            {new Date(contact.wafeq_synced_at).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <XCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                        <span className="text-xs text-gray-400">Not synced</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-4 whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => handleEdit(contact)}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                        title="Edit"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(contact.id)}
                                                        disabled={deletingContact === contact.id}
                                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                                                        title="Delete"
                                                    >
                                                        {deletingContact === contact.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Create/Edit Modal - Wafeq Style */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-8 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-3xl font-bold text-gray-900">Contact</h2>
                                <p className="text-gray-600 mt-1">A person or organization you do business with</p>
                            </div>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition"
                            >
                                <XCircle className="w-5 h-5 text-gray-600" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-8">
                            {/* Business and VAT Treatment (Required) */}
                            <div className="border-b border-gray-200 pb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                    Business and VAT Treatment <span className="text-red-500">Required</span>
                                </h3>
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Company name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.company_name}
                                            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Required"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Country
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.country}
                                            onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Optional"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Tax registration number
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.tax_registration_number}
                                            onChange={(e) => setFormData({ ...formData, tax_registration_number: e.target.value })}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Optional"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Address (Optional) - Collapsible */}
                            <div className="border-b border-gray-200 pb-6">
                                <button
                                    type="button"
                                    onClick={() => setExpandedSections({ ...expandedSections, address: !expandedSections.address })}
                                    className="flex items-center justify-between w-full text-left mb-4"
                                >
                                    <h3 className="text-lg font-semibold text-gray-900">
                                        Address <span className="text-gray-500 font-normal">Optional</span>
                                    </h3>
                                    {expandedSections.address ? (
                                        <ChevronUp className="w-5 h-5 text-gray-500" />
                                    ) : (
                                        <ChevronDown className="w-5 h-5 text-gray-500" />
                                    )}
                                </button>
                                {expandedSections.address && (
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                                            <input
                                                type="text"
                                                value={formData.city}
                                                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Optional"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Street address</label>
                                            <input
                                                type="text"
                                                value={formData.street_address}
                                                onChange={(e) => setFormData({ ...formData, street_address: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Optional"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Building number</label>
                                            <input
                                                type="text"
                                                value={formData.building_number}
                                                onChange={(e) => setFormData({ ...formData, building_number: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Optional"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">District</label>
                                            <input
                                                type="text"
                                                value={formData.district}
                                                onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Optional"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Address additional number</label>
                                            <input
                                                type="text"
                                                value={formData.address_additional_number}
                                                onChange={(e) => setFormData({ ...formData, address_additional_number: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Optional"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Postal code</label>
                                            <input
                                                type="text"
                                                value={formData.postal_code}
                                                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Optional"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Invoicing Information (Optional) - Collapsible */}
                            <div className="border-b border-gray-200 pb-6">
                                <button
                                    type="button"
                                    onClick={() => setExpandedSections({ ...expandedSections, invoicing: !expandedSections.invoicing })}
                                    className="flex items-center justify-between w-full text-left mb-4"
                                >
                                    <h3 className="text-lg font-semibold text-gray-900">
                                        Invoicing information <span className="text-gray-500 font-normal">Optional</span>
                                    </h3>
                                    {expandedSections.invoicing ? (
                                        <ChevronUp className="w-5 h-5 text-gray-500" />
                                    ) : (
                                        <ChevronDown className="w-5 h-5 text-gray-500" />
                                    )}
                                </button>
                                {expandedSections.invoicing && (
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Code</label>
                                            <input
                                                type="text"
                                                value={formData.contact_code}
                                                onChange={(e) => setFormData({ ...formData, contact_code: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Optional"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Email <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="email"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Required"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Phone <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="tel"
                                                value={formData.phone}
                                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Required"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Relationship</label>
                                            <select
                                                value={formData.relationship}
                                                onChange={(e) => setFormData({ ...formData, relationship: e.target.value as any })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="">Select</option>
                                                <option value="customer">Customer</option>
                                                <option value="supplier">Supplier</option>
                                                <option value="both">Both</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Payment terms</label>
                                            <select
                                                value={formData.payment_terms}
                                                onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="">Select</option>
                                                <option value="net_15">Net 15</option>
                                                <option value="net_30">Net 30</option>
                                                <option value="net_60">Net 60</option>
                                                <option value="due_on_receipt">Due on Receipt</option>
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Contact ID Type</label>
                                                <select
                                                    value={formData.contact_id_type}
                                                    onChange={(e) => setFormData({ ...formData, contact_id_type: e.target.value })}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value="">Select</option>
                                                    <option value="national_id">National ID</option>
                                                    <option value="commercial_registration">Commercial Registration</option>
                                                    <option value="iqama">Iqama</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">ID Number</label>
                                                <input
                                                    type="text"
                                                    value={formData.id_number}
                                                    onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    placeholder="ID Number"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Contact Defaults */}
                            <div className="border-b border-gray-200 pb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Contact Defaults</h3>
                                <p className="text-sm text-gray-600 mb-4">
                                    You can set default values for your contacts. These values will be automatically added to future documents you create.{' '}
                                    <a href="https://help.wafeq.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                        Learn more
                                    </a>{' '}
                                    about contact defaults.
                                </p>

                                {/* Selling Defaults (Optional) - Collapsible */}
                                <div className="mb-4">
                                    <button
                                        type="button"
                                        onClick={() => setExpandedSections({ ...expandedSections, sellingDefaults: !expandedSections.sellingDefaults })}
                                        className="flex items-center justify-between w-full text-left mb-4"
                                    >
                                        <h4 className="text-base font-semibold text-gray-900">
                                            Selling Defaults <span className="text-gray-500 font-normal">Optional</span>
                                        </h4>
                                        {expandedSections.sellingDefaults ? (
                                            <ChevronUp className="w-5 h-5 text-gray-500" />
                                        ) : (
                                            <ChevronDown className="w-5 h-5 text-gray-500" />
                                        )}
                                    </button>
                                    {expandedSections.sellingDefaults && (
                                        <div className="grid grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Default revenue account</label>
                                                <select
                                                    value={formData.default_revenue_account}
                                                    onChange={(e) => setFormData({ ...formData, default_revenue_account: e.target.value })}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value="">Select</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Default revenue cost center</label>
                                                <select
                                                    value={formData.default_revenue_cost_center}
                                                    onChange={(e) => setFormData({ ...formData, default_revenue_cost_center: e.target.value })}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value="">Select</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Default revenue tax rate</label>
                                                <select
                                                    value={formData.default_revenue_tax_rate}
                                                    onChange={(e) => setFormData({ ...formData, default_revenue_tax_rate: e.target.value })}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value="">Select</option>
                                                    <option value="15">15% VAT</option>
                                                    <option value="0">0% (Zero-rated)</option>
                                                    <option value="exempt">Exempt</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Purchasing Defaults (Optional) - Collapsible */}
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setExpandedSections({ ...expandedSections, purchasingDefaults: !expandedSections.purchasingDefaults })}
                                        className="flex items-center justify-between w-full text-left mb-4"
                                    >
                                        <h4 className="text-base font-semibold text-gray-900">
                                            Purchasing Defaults <span className="text-gray-500 font-normal">Optional</span>
                                        </h4>
                                        {expandedSections.purchasingDefaults ? (
                                            <ChevronUp className="w-5 h-5 text-gray-500" />
                                        ) : (
                                            <ChevronDown className="w-5 h-5 text-gray-500" />
                                        )}
                                    </button>
                                    {expandedSections.purchasingDefaults && (
                                        <div className="grid grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Default expense account</label>
                                                <select
                                                    value={formData.default_expense_account}
                                                    onChange={(e) => setFormData({ ...formData, default_expense_account: e.target.value })}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value="">Select</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Default expense cost center</label>
                                                <select
                                                    value={formData.default_expense_cost_center}
                                                    onChange={(e) => setFormData({ ...formData, default_expense_cost_center: e.target.value })}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value="">Select</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Default expense tax rate name</label>
                                                <select
                                                    value={formData.default_expense_tax_rate}
                                                    onChange={(e) => setFormData({ ...formData, default_expense_tax_rate: e.target.value })}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value="">Select</option>
                                                    <option value="15">15% VAT</option>
                                                    <option value="0">0% (Zero-rated)</option>
                                                    <option value="exempt">Exempt</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Beneficiaries */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Beneficiaries</h3>
                                <p className="text-sm text-gray-600 mb-4">
                                    If you've connected a bank account that supports making payments, you have the option to pay suppliers directly from within Wafeq by adding a beneficiary.
                                </p>
                                <button
                                    type="button"
                                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-gray-700"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Beneficiary
                                </button>
                            </div>

                            <div className="flex gap-4 pt-6 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-semibold"
                                    disabled={submitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            {editingContact ? 'Updating...' : 'Creating...'}
                                        </>
                                    ) : (
                                        editingContact ? 'Update Contact' : 'Create Contact'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
