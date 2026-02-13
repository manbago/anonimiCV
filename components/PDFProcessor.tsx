'use client';

import React, { useState } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { Download, Loader2, FileText, CheckCircle } from 'lucide-react';
import FileUploader from './FileUploader';
import { identifyRedactions, TextItem, detectCandidateName, getInitials } from '../utils/anonymizer';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PDFProcessorProps { }

type ProcessingState = 'idle' | 'processing' | 'done' | 'error';

export default function PDFProcessor({ }: PDFProcessorProps) {
    const [status, setStatus] = useState<ProcessingState>('idle');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const [redactedItems, setRedactedItems] = useState<{ text: string; type: string; pageIndex: number }[]>([]);
    const [customWordsInput, setCustomWordsInput] = useState<string>('');

    const processPDF = async (file: File) => {
        setStatus('processing');
        setErrorMessage(null);
        setFileName(file.name);
        setRedactedItems([]);

        // Parse custom words
        const customWordsList = customWordsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const arrayBufferForPdfLib = arrayBuffer.slice(0);

            // 1. Load PDF with pdfjs to extract text coordinates
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const numPages = pdf.numPages;

            const allRedactions: { pageIndex: number; matches: any[] }[] = [];
            let candidateName: string | null = null;

            for (let i = 1; i <= numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const viewport = page.getViewport({ scale: 1 });

                const textItems: TextItem[] = textContent.items.map((item: any) => {
                    // pdfjs transform matrix: [scaleX, skewY, skewX, scaleY, translateX, translateY]
                    const tx = item.transform;
                    const x = tx[4];
                    const y = tx[5];
                    const width = item.width;
                    const height = item.height;

                    return {
                        str: item.str,
                        x: x,
                        y: y,
                        width: width,
                        height: height,
                        fontHeight: Math.sqrt(tx[3] * tx[3]), // Approximate font height
                    };
                });

                // Detect Name on First Page
                if (i === 1) {
                    const detected = detectCandidateName(textItems);
                    if (detected) candidateName = detected;
                }

                const matches = identifyRedactions(textItems, i - 1, viewport.height, candidateName || undefined, customWordsList);
                allRedactions.push({ pageIndex: i - 1, matches });
            }

            // Collect all redacted items for display
            const allItems = allRedactions.flatMap(page =>
                page.matches.map(m => ({ text: m.text, type: m.type, pageIndex: page.pageIndex + 1 }))
            );
            setRedactedItems(allItems);

            // 2. Load PDF with pdf-lib to modify
            const pdfDoc = await PDFDocument.load(arrayBufferForPdfLib);
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            const pages = pdfDoc.getPages();

            // Placeholder Logo (a simple blue circle)
            const logoSize = 30;

            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const { width, height } = page.getSize();

                // Resize page to add space at the top (e.g. 60 units)
                const headerHeight = 60;
                page.setSize(width, height + headerHeight);

                // Add Header in the new space
                // Original top was at 'height'. New top is 'height + headerHeight'.
                // We want to draw in that top strip.
                const headerText = candidateName ? `CV Anonimizado - ${getInitials(candidateName)}` : 'CV Anonimizado';
                page.drawText(headerText, {
                    x: 60,
                    y: height + headerHeight - 35, // Position relative to new top
                    size: 18,
                    font: helveticaFont,
                    color: rgb(0.1, 0.1, 0.3),
                });

                // Draw Simple Logo Placeholder
                page.drawCircle({
                    x: 40,
                    y: height + headerHeight - 30,
                    size: 10,
                    color: rgb(0.1, 0.1, 0.3),
                });

                // Apply Redactions
                // Note: Redaction coordinates from pdfjs (user space) should map correctly to the ORIGINAL content area.
                // Since we extended the page upwards, the bottom-left origin (0,0) stays matching the content.
                // So matches at y=100 are still at y=100, which is the same visual spot relative to text.
                const pageRedactions = allRedactions.find((r) => r.pageIndex === i);
                if (pageRedactions) {
                    for (const match of pageRedactions.matches) {
                        // 1. Draw white rectangle to hide original text
                        page.drawRectangle({
                            x: match.x,
                            y: match.y - 2,
                            width: match.width,
                            height: match.height + 4,
                            color: rgb(1, 1, 1), // White
                        });

                        // 2. Draw '#' characters on top
                        const charWidth = 6;
                        const numChars = Math.max(1, Math.floor(match.width / charWidth));
                        const hashString = '#'.repeat(numChars);

                        page.drawText(hashString, {
                            x: match.x,
                            y: match.y,
                            size: 10,
                            font: helveticaFont,
                            color: rgb(0, 0, 0),
                        });
                    }
                }
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            setDownloadUrl(url);
            setStatus('done');
        } catch (err) {
            console.error(err);
            setErrorMessage('Ocurrió un error al procesar el PDF. Asegúrate de que no esté encriptado o dañado.');
            setStatus('error');
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-lg mt-8">
            {status === 'idle' && (
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Palabras clave adicionales a ocultar (separadas por comas)
                        </label>
                        <input
                            type="text"
                            value={customWordsInput}
                            onChange={(e) => setCustomWordsInput(e.target.value)}
                            placeholder="Ej: Confidential, Secreto, NombreEmpresa"
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <FileUploader onFileUpload={processPDF} />
                    <div className="text-center text-sm text-gray-500">
                        <p>Procesamiento 100% local. Tu archivo no se sube a ningún servidor.</p>
                    </div>
                </div>
            )}

            {status === 'processing' && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                    <p className="text-lg font-medium text-gray-700">Anonimizando documento...</p>
                    <p className="text-sm text-gray-500">{fileName}</p>
                </div>
            )}

            {status === 'done' && (
                <div className="flex flex-col items-center justify-center py-10 space-y-6">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-gray-800">¡Documento Listo!</h3>
                        <p className="text-gray-600 mt-2">Se han ocultado los siguientes datos sensibles:</p>
                    </div>

                    <div className="w-full bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto text-left border border-gray-200">
                        {redactedItems.length === 0 ? (
                            <p className="text-sm text-gray-500 italic text-center">No se encontraron datos para anonimizar.</p>
                        ) : (
                            <ul className="space-y-2">
                                {redactedItems.map((item, idx) => (
                                    <li key={idx} className="text-sm flex items-start gap-2 pb-2 border-b border-gray-100 last:border-0">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase
                                            ${item.type === 'email' ? 'bg-blue-100 text-blue-700' :
                                                item.type === 'phone' ? 'bg-green-100 text-green-700' :
                                                    'bg-purple-100 text-purple-700'}`}>
                                            {item.type}
                                        </span>
                                        <span className="text-gray-700 font-mono break-all">{item.text}</span>
                                        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">Pág {item.pageIndex}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <a
                        href={downloadUrl!}
                        download={`anonimizado-${fileName}`}
                        className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                    >
                        <Download className="w-5 h-5" />
                        <span>Descargar PDF Anonimizado</span>
                    </a>

                    <button
                        onClick={() => {
                            setStatus('idle');
                            setDownloadUrl(null);
                        }}
                        className="text-gray-500 hover:text-gray-700 text-sm underline"
                    >
                        Procesar otro archivo
                    </button>
                </div>
            )}

            {status === 'error' && (
                <div className="text-center py-8">
                    <div className="text-red-500 mb-4 font-bold">Error</div>
                    <p className="mb-4 text-gray-600">{errorMessage}</p>
                    <button
                        onClick={() => setStatus('idle')}
                        className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded text-gray-800"
                    >
                        Intentar de nuevo
                    </button>
                </div>
            )}
        </div>
    );
}
