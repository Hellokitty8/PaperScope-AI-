
import React, { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { v4 as uuidv4 } from 'uuid';
import { Highlight, PaperData } from '../types';

// Set up the worker for PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  paper: PaperData | null;
  onSave: (paperId: string, highlights: Highlight[]) => void;
}

const COLORS = [
  { id: 'yellow', hex: '#fef08a', label: 'Yellow' },
  { id: 'green', hex: '#bbf7d0', label: 'Green' },
  { id: 'red', hex: '#fecaca', label: 'Red' },
  { id: 'blue', hex: '#bfdbfe', label: 'Blue' },
];

const PdfViewerModal: React.FC<PdfViewerModalProps> = ({ isOpen, onClose, paper, onSave }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // PDF State
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.2);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  
  // Highlight Data State
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selectedColor, setSelectedColor] = useState<string>(COLORS[0].hex);
  
  // Interaction State
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{x: number, y: number} | null>(null);
  const [tempNote, setTempNote] = useState<string>('');

  // Load paper data when opened
  useEffect(() => {
    if (isOpen && paper) {
      let url: string = '';
      let isBlob = false;
      
      // Check if paper.file is string (URL) or Blob/File
      if (typeof paper.file === 'string') {
          url = paper.file;
      } else {
          url = URL.createObjectURL(paper.file);
          isBlob = true;
      }
      
      setFileUrl(url);
      setHighlights(paper.highlights || []);
      // Reset states
      setActiveHighlightId(null);
      setPopoverPosition(null);
      setTempNote('');
      
      return () => {
        if (isBlob) URL.revokeObjectURL(url);
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

  const handleTextSelection = () => {
    // Close popover if selecting new text
    if (activeHighlightId) {
        setActiveHighlightId(null);
        setPopoverPosition(null);
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    
    // Robustly find the page element: Text nodes are deep inside, so traverse up
    let startNode: Node | null = range.startContainer;
    while (startNode && startNode.nodeType !== 1) { // 1 is Element node
        startNode = startNode.parentNode;
    }
    const pageElement = (startNode as Element)?.closest('.react-pdf__Page');
    
    if (!pageElement) return;

    const pageNumAttr = pageElement.getAttribute('data-page-number');
    if (!pageNumAttr) return;
    const pageNumber = parseInt(pageNumAttr, 10);

    // Calculate rects relative to this specific page
    const pageRect = pageElement.getBoundingClientRect();
    const rects = range.getClientRects();
    
    const newRects = Array.from(rects).map(rect => {
      return {
        x: (rect.left - pageRect.left) / scale,
        y: (rect.top - pageRect.top) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
      };
    });

    if (newRects.length > 0) {
        const newHighlight: Highlight = {
            id: uuidv4(),
            page: pageNumber,
            rects: newRects,
            color: selectedColor,
            text: selection.toString(),
            comment: ''
        };

        setHighlights(prev => [...prev, newHighlight]);
        selection.removeAllRanges();
        
        // Optionally auto-open note for the new highlight? 
        // For now, let's just highlight it. User can click to add note.
    }
  };

  const handleHighlightClick = (e: React.MouseEvent, highlight: Highlight) => {
    e.stopPropagation();
    
    // Calculate position relative to viewport
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    
    // Center popover above or below the highlight
    setPopoverPosition({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 10 // Show below by default
    });
    
    setActiveHighlightId(highlight.id);
    setTempNote(highlight.comment || '');
  };

  const updateHighlightNote = () => {
      setHighlights(prev => prev.map(h => 
          h.id === activeHighlightId ? { ...h, comment: tempNote } : h
      ));
      // Keep popover open or close? Let's close it to signal "saved"
      setActiveHighlightId(null);
      setPopoverPosition(null);
  };

  const deleteHighlight = () => {
      setHighlights(prev => prev.filter(h => h.id !== activeHighlightId));
      setActiveHighlightId(null);
      setPopoverPosition(null);
  };

  const changeHighlightColor = (colorHex: string) => {
      setHighlights(prev => prev.map(h => 
        h.id === activeHighlightId ? { ...h, color: colorHex } : h
      ));
  };

  const handleGlobalClick = () => {
      if (activeHighlightId) {
          setActiveHighlightId(null);
          setPopoverPosition(null);
      }
  };

  const handleSave = () => {
      if (paper) {
          onSave(paper.id, highlights);
      }
  };

  if (!isOpen || !paper || !fileUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        ref={modalRef}
        onClick={handleGlobalClick}
        className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden relative"
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-gray-50 shrink-0 z-20">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-bold text-gray-800 truncate max-w-[300px]" title={paper.fileName}>
                {paper.fileName}
            </h3>
            
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
             {/* Highlighter Tools - Color Picker for NEW highlights */}
             <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-gray-200">
                 <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Default Color</span>
                 {COLORS.map(color => (
                     <button
                        key={color.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedColor(color.hex); }}
                        className={`w-5 h-5 rounded-full border-2 transition-all ${selectedColor === color.hex ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: color.hex }}
                        title={color.label}
                     />
                 ))}
             </div>

             <div className="h-6 w-px bg-gray-300"></div>

             <button
                onClick={(e) => { e.stopPropagation(); handleSave(); }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
             >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                Save Annotations
             </button>

             <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
             >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
             </button>
          </div>
        </div>
        
        {/* PDF Rendering Area - Continuous Scroll */}
        <div 
            className="flex-1 bg-gray-100 overflow-y-auto overflow-x-hidden flex justify-center p-8 relative scroll-smooth" 
            ref={containerRef}
            onMouseUp={handleTextSelection}
        >
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            className="shadow-xl"
            loading={<div className="flex items-center gap-2 text-gray-500 mt-20"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>Loading PDF...</div>}
            error={<div className="text-red-500 bg-red-50 p-4 rounded-lg mt-10">Failed to load PDF. Check file format.</div>}
          >
             {Array.from(new Array(numPages), (el, index) => {
                 const pageNum = index + 1;
                 const pageHighlights = highlights.filter(h => h.page === pageNum);
                 
                 return (
                    <div key={`page_${pageNum}`} className="relative mb-6 shadow-md bg-white group/page">
                         <Page 
                            pageNumber={pageNum} 
                            scale={scale} 
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            className="bg-white"
                            loading={<div className="h-[800px] w-[600px] bg-white animate-pulse"></div>}
                        />
                        
                        {/* Highlights Overlay for this Page */}
                        {pageHighlights.map(h => (
                            <React.Fragment key={h.id}>
                                {h.rects.map((rect, idx) => (
                                    <div
                                        key={idx}
                                        className={`absolute mix-blend-multiply cursor-pointer transition-opacity duration-200 ${activeHighlightId === h.id ? 'opacity-60 ring-2 ring-indigo-500 ring-offset-1' : 'opacity-30 hover:opacity-50'}`}
                                        style={{
                                            left: rect.x * scale,
                                            top: rect.y * scale,
                                            width: rect.width * scale,
                                            height: rect.height * scale,
                                            backgroundColor: h.color,
                                        }}
                                        onClick={(e) => handleHighlightClick(e, h)}
                                    />
                                ))}
                                {/* Indicator if note exists */}
                                {h.comment && h.rects.length > 0 && (
                                    <div 
                                        className="absolute w-4 h-4 bg-yellow-400 rounded-full border border-white shadow-sm flex items-center justify-center text-[8px] pointer-events-none"
                                        style={{
                                            left: (h.rects[0].x + h.rects[0].width) * scale - 8,
                                            top: h.rects[0].y * scale - 8,
                                            zIndex: 10
                                        }}
                                    >
                                        📝
                                    </div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                 );
             })}
          </Document>
        </div>

        {/* Popover for Annotations */}
        {activeHighlightId && popoverPosition && (
            <div 
                className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-100 w-80 animate-in fade-in zoom-in-95 duration-150 flex flex-col overflow-hidden"
                style={{
                    left: Math.min(window.innerWidth - 340, Math.max(20, popoverPosition.x - 160)), // Clamp to screen width
                    top: Math.min(window.innerHeight - 250, popoverPosition.y), // Clamp to bottom
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Popover Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                    <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Annotation</span>
                    <div className="flex gap-1">
                        {COLORS.map(color => (
                            <button 
                                key={color.id}
                                onClick={() => changeHighlightColor(color.hex)}
                                className={`w-4 h-4 rounded-full border border-gray-200 hover:scale-110 transition-transform ${highlights.find(h => h.id === activeHighlightId)?.color === color.hex ? 'ring-2 ring-gray-400' : ''}`}
                                style={{ backgroundColor: color.hex }}
                            />
                        ))}
                    </div>
                </div>

                {/* Popover Body */}
                <div className="p-4">
                     <textarea
                        value={tempNote}
                        onChange={(e) => setTempNote(e.target.value)}
                        placeholder="Add a note or comment..."
                        className="w-full min-h-[100px] text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none mb-3"
                        autoFocus
                     />
                     <div className="flex items-center justify-between">
                         <button
                            onClick={deleteHighlight}
                            className="text-red-500 hover:text-red-700 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                            title="Delete Highlight"
                         >
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                         </button>
                         <button
                            onClick={updateHighlightNote}
                            className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 shadow-sm"
                         >
                             Done
                         </button>
                     </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default PdfViewerModal;
