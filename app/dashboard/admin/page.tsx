'use client';

import Link from 'next/link';
import { ArrowLeft, Database, BookOpen, Shield } from 'lucide-react';

const adminLinks = [
  {
    href: '/dashboard/admin/reset-demo-x7k9p2',
    title: 'Demo Data Management',
    description: 'Reset and manage test/demo data for the test company',
    icon: Database,
    color: 'orange',
  },
  {
    href: '/dashboard/admin/testing-guide',
    title: 'Testing Guide',
    description: 'Step-by-step testing instructions for all features',
    icon: BookOpen,
    color: 'blue',
  },
];

const colorClasses: Record<string, { bg: string; border: string; icon: string; hover: string }> = {
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-600', hover: 'hover:border-orange-500' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', hover: 'hover:border-blue-500' },
};

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard"
            className="p-2 hover:bg-gray-200 rounded-lg transition"
            aria-label="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-200 rounded-lg">
              <Shield className="w-6 h-6 text-gray-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
              <p className="text-sm text-gray-600">Demo data, testing, and administration</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          {adminLinks.map((item) => {
            const Icon = item.icon;
            const colors = colorClasses[item.color] || colorClasses.blue;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-4 p-6 rounded-xl border-2 ${colors.bg} ${colors.border} ${colors.hover} transition bg-white shadow-sm`}
              >
                <div className={`p-3 rounded-lg ${colors.bg}`}>
                  <Icon className={`w-8 h-8 ${colors.icon}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900">{item.title}</h2>
                  <p className="text-sm text-gray-600 mt-0.5">{item.description}</p>
                </div>
                <span className="text-gray-400 shrink-0">→</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
