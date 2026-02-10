import React, { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { v4 as uuidv4 } from 'uuid';
import { Highlight, PaperData } from '../types';

// Set up the worker for PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  paper: PaperData | null;
  onSave: (paperId: string, highlights: Highlight[]) => void;
}

const COLORS = [
  { id: 'yellow', hex: '#fef08a', label: 'Yellow', class: 'bg-yellow-200' },
  { id: 'green', hex: '#bbf7d0', label: 'Green', class: 'bg-green-200' },
  { id: 'red', hex: '#fecaca', label: 'Red', class: 'bg-red-200' },
  { id: 'blue', hex: '#bfdbfe', label: 'Blue', class: 'bg-blue-200' },
];

const PdfViewerModal: React.FC<PdfViewerModalProps> = ({ isOpen, onClose, paper, onSave }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // PDF State
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  
  // Highlight State
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selectedColor, setSelectedColor] = useState<string>(COLORS[0].hex);
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(true);

  // Load paper data when opened
  useEffect(() => {
    if (isOpen && paper) {
      const url = URL.createObjectURL(paper.file);
      setFileUrl(url);
      setHighlights(paper.highlights || []);
      setPageNumber(1);
      
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [isOpen, paper]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const changePage = (offset: number) => {
    setPageNumber(prevPageNumber => {
        const newPage = prevPageNumber + offset;
        return Math.min(Math.max(1, newPage), numPages);
    });
  };

  const handleTextSelection = () => {
    if (!isSelectionMode) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();
    
    // Find the page container element to calculate relative coordinates
    const pageElement = document.querySelector(`.react-pdf__Page[data-page-number="${pageNumber}"]`);
    if (!pageElement) return;

    const pageRect = pageElement.getBoundingClientRect();

    const newRects = Array.from(rects).map(rect => {
      return {
        x: (rect.left - pageRect.left) / scale,
        y: (rect.top - pageRect.top) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
      };
    });

    // Only add valid highlights (inside the page)
    if (newRects.length > 0 && newRects[0].x >= 0 && newRects[0].y >= 0) {
        const newHighlight: Highlight = {
            id: uuidv4(),
            page: pageNumber,
            rects: newRects,
            color: selectedColor,
            text: selection.toString()
        };

        setHighlights(prev => [...prev, newHighlight]);
        
        // Clear selection
        selection.removeAllRanges();
    }
  };

  const removeHighlight = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHighlights(prev => prev.filter(h => h.id !== id));
  };

  const handleSave = () => {
      if (paper) {
          onSave(paper.id, highlights);
          // Optional: Add a visual toast here
      }
  };

  if (!isOpen || !paper || !fileUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        ref={modalRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden"
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-bold text-gray-800 truncate max-w-[200px]" title={paper.fileName}>
                {paper.fileName}
            </h3>
            
            <div className="h-6 w-px bg-gray-300"></div>

            {/* Pagination */}
            <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1">
                <button 
                    disabled={pageNumber <= 1} 
                    onClick={() => changePage(-1)}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-xs font-mono w-16 text-center">{pageNumber} / {numPages || '--'}</span>
                <button 
                    disabled={pageNumber >= numPages} 
                    onClick={() => changePage(1)}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>

            <div className="h-6 w-px bg-gray-300"></div>

            {/* Zoom */}
            <div className="flex items-center gap-2">
                <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="p-1.5 hover:bg-gray-200 rounded text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                </button>
                <span className="text-xs font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(3, s + 0.1))} className="p-1.5 hover:bg-gray-200 rounded text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
             {/* Highlighter Tools */}
             <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-gray-200">
                 <span className="text-xs font-semibold text-gray-400 px-2 uppercase tracking-wider">Highlight</span>
                 {COLORS.map(color => (
                     <button
                        key={color.id}
                        onClick={() => setSelectedColor(color.hex)}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${selectedColor === color.hex ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: color.hex }}
                        title={color.label}
                     />
                 ))}
             </div>

             <div className="h-6 w-px bg-gray-300"></div>

             <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
             >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                Save Highlights
             </button>

             <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
             >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
             </button>
          </div>
        </div>
        
        {/* PDF Rendering Area */}
        <div 
            className="flex-1 bg-gray-100 overflow-auto flex justify-center p-8 relative" 
            ref={containerRef}
            onMouseUp={handleTextSelection}
        >
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            className="shadow-xl"
            loading={<div className="flex items-center gap-2 text-gray-500"><div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>Loading PDF...</div>}
            error={<div className="text-red-500 bg-red-50 p-4 rounded-lg">Failed to load PDF. Check file format.</div>}
          >
            <div className="relative group">
                <Page 
                    pageNumber={pageNumber} 
                    scale={scale} 
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="bg-white"
                />
                
                {/* Highlights Layer */}
                {highlights
                    .filter(h => h.page === pageNumber)
                    .map(h => (
                        <React.Fragment key={h.id}>
                            {h.rects.map((rect, idx) => (
                                <div
                                    key={idx}
                                    className="absolute mix-blend-multiply cursor-pointer group-hover/highlight:opacity-100"
                                    style={{
                                        left: rect.x * scale,
                                        top: rect.y * scale,
                                        width: rect.width * scale,
                                        height: rect.height * scale,
                                        backgroundColor: h.color,
                                        opacity: 0.4
                                    }}
                                    onClick={(e) => removeHighlight(h.id, e)}
                                    title="Click to remove highlight"
                                />
                            ))}
                        </React.Fragment>
                    ))
                }
            </div>
          </Document>
        </div>
      </div>
    </div>
  );
};

export default PdfViewerModal;