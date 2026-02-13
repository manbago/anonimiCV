import React from 'react';
import { ShieldCheck } from 'lucide-react';

export default function Header() {
    return (
        <header className="bg-white shadow-sm border-b border-gray-200 py-4">
            <div className="container mx-auto px-4 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-8 h-8 text-blue-900" />
                    <h1 className="text-2xl font-bold text-blue-900 tracking-tight">AnonimiCV</h1>
                </div>
                <nav>
                    <span className="text-sm text-gray-500">Anonimización segura client-side</span>
                </nav>
            </div>
        </header>
    );
}
