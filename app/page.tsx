'use client';

import dynamic from 'next/dynamic';
import Header from "@/components/Header";

const PDFProcessor = dynamic(() => import('@/components/PDFProcessor'), {
  ssr: false,
  loading: () => (
    <div className="w-full max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-lg mt-8 text-center">
      <p className="text-gray-500">Cargando procesador...</p>
    </div>
  ),
});

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-20">
      <Header />
      <main className="container mx-auto px-4 pt-12">
        <div className="text-center mb-10">
          <h2 className="text-4xl font-extrabold text-blue-900 mb-4">
            Protege la identidad de tus candidatos
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Sube un CV en PDF y nuestra herramienta eliminará automáticamente
            datos de contacto como nombres, teléfonos y correos electrónicos.
          </p>
        </div>

        <PDFProcessor />
      </main>

      <footer className="fixed bottom-0 w-full bg-white border-t border-gray-200 py-4 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} AnonimiCV. Privacidad garantizada.
      </footer>
    </div>
  );
}
