'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function HomePage() {
    const router = useRouter();

    useEffect(() => {
        // Check if user is authenticated
        const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/login');
            } else {
                // Redirect to dashboard
                router.push('/dashboard');
            }
        };

        checkAuth();
    }, [router]);

    // Show loading while redirecting
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
                                <div className="text-center">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">Redirecting to dashboard...</p>
            </div>
        </div>
    );
}
