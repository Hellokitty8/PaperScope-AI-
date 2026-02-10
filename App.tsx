import React, { useState, useRef, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import FileUpload from './components/FileUpload';
import DetailModal from './components/DetailModal';
import SettingsModal from './components/SettingsModal';
import PdfViewerModal from './components/PdfViewerModal';
import ComparisonModal from './components/ComparisonModal';
import ImageModal from './components/ImageModal';
import { analyzePaperWithGemini, comparePapersWithGemini } from './services/geminiService';
import { PaperData, AnalysisColumn, LLMSettings, DEFAULT_SETTINGS, ComparisonResult } from './types';

// Default column widths
const DEFAULT_WIDTHS: Record<string, number> = {
  checkbox: 48,
  tags: 220, // Slightly wider for multiple tags
  file: 250,
  type: 120,
  title: 200,
  publication: 150,
  problem: 200,
  solution_idea: 200,
  contribution: 200,
  method: 200,
  model_architecture: 200,
  borrowable_ideas: 200,
  screenshot: 150,
};

const App: React.FC = () => {
  const [papers, setPapers] = useState<PaperData[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<LLMSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  
  // Grouping/Tagging State
  const [activeTab, setActiveTab] = useState<string>('All');
  
  // Tag Editing State
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [tempTagInput, setTempTagInput] = useState<string>("");

  // Comparison State
  const [comparisonModal, setComparisonModal] = useState<{
    isOpen: boolean;
    isLoading: boolean;
    result: ComparisonResult | null;
  }>({
    isOpen: false,
    isLoading: false,
    result: null,
  });

  // PDF Viewer State
  const [pdfViewer, setPdfViewer] = useState<{ isOpen: boolean; file: File | null }>({
    isOpen: false,
    file: null,
  });

  // Image Modal State
  const [imageModal, setImageModal] = useState<{ isOpen: boolean; url: string | null }>({
    isOpen: false,
    url: null,
  });

  // Detail Modal State
  const [activeModal, setActiveModal] = useState<{
    isOpen: boolean;
    paperId: string;
    fieldKey: string;
    title: string;
    content: string;
    type: AnalysisColumn | null;
  }>({
    isOpen: false,
    paperId: '',
    fieldKey: '',
    title: '',
    content: '',
    type: null,
  });

  // Resizing State
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // --- Derived State for Tags ---
  // Extract all unique tags from all papers
  const uniqueTags = useMemo(() => {
      const allTags = papers.flatMap(p => p.tags || []);
      return Array.from(new Set(allTags)).sort();
  }, [papers]);

  // Filter papers based on active tab
  const filteredPapers = useMemo(() => {
      if (activeTab === 'All') return papers;
      if (activeTab === 'Uncategorized') return papers.filter(p => !p.tags || p.tags.length === 0);
      // Show paper if its tags array includes the active tab
      return papers.filter(p => p.tags && p.tags.includes(activeTab));
  }, [papers, activeTab]);

  const getTagCount = (tagName: string) => {
      if (tagName === 'All') return papers.length;
      if (tagName === 'Uncategorized') return papers.filter(p => !p.tags || p.tags.length === 0).length;
      return papers.filter(p => p.tags && p.tags.includes(tagName)).length;
  };

  const handleFilesSelected = async (files: File[]) => {
    // Determine default tags based on current active view
    // If user is in "CV" tab, new uploads get "CV" tag automatically
    let initialTags: string[] = [];
    if (activeTab !== 'All' && activeTab !== 'Uncategorized') {
        initialTags = [activeTab];
    }

    const newPapers: PaperData[] = files.map((file) => ({
      id: uuidv4(),
      file,
      fileName: file.name,
      fileSize: file.size,
      uploadTime: Date.now(),
      status: 'idle',
      analysis: null,
      tags: initialTags,
      screenshot: null,
    }));

    setPapers((prev) => [...prev, ...newPapers]);
    // Process files with current settings
    newPapers.forEach((paper) => processPaper(paper.id, paper.file, settings));
  };

  const processPaper = async (id: string, file: File, currentSettings: LLMSettings) => {
    setPapers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: 'analyzing' } : p))
    );

    try {
      const result = await analyzePaperWithGemini(file, currentSettings);
      setPapers((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: 'success', analysis: result } : p
        )
      );
    } catch (error: any) {
      setPapers((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, status: 'error', errorMessage: error.message || 'Analysis failed' }
            : p
        )
      );
    }
  };

  const deletePaper = (id: string) => {
    setPapers((prev) => prev.filter((p) => p.id !== id));
    setSelectedPaperIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
    });
  };

  const toggleSelection = (id: string) => {
    setSelectedPaperIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        return next;
    });
  };

  const toggleAllSelection = () => {
    const allFilteredIds = filteredPapers.map(p => p.id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedPaperIds.has(id));

    if (allSelected) {
        setSelectedPaperIds(prev => {
            const next = new Set(prev);
            allFilteredIds.forEach(id => next.delete(id));
            return next;
        });
    } else {
        setSelectedPaperIds(prev => {
            const next = new Set(prev);
            allFilteredIds.forEach(id => next.add(id));
            return next;
        });
    }
  };

  const handleCompare = async () => {
    if (selectedPaperIds.size < 2) return;

    const selectedPapers = papers.filter(p => selectedPaperIds.has(p.id));
    setComparisonModal({ isOpen: true, isLoading: true, result: null });

    try {
        const result = await comparePapersWithGemini(selectedPapers, settings);
        setComparisonModal({ isOpen: true, isLoading: false, result });
    } catch (error) {
        console.error("Comparison failed", error);
        setComparisonModal({ isOpen: true, isLoading: false, result: null });
    }
  };

  const handleExportExcel = () => {
      if (selectedPaperIds.size === 0) return;

      const papersToExport = papers.filter(p => selectedPaperIds.has(p.id));
      
      const data = papersToExport.map(p => ({
          "File Name": p.fileName,
          "Tags": p.tags?.join(', ') || '',
          "Type": p.analysis?.type || '',
          "Title": p.analysis?.title || '',
          "Venue": p.analysis?.publication || '',
          "Problem": p.analysis?.problem || '',
          "Solution": p.analysis?.solution_idea || '',
          "Contribution": p.analysis?.contribution || '',
          "Method": p.analysis?.method || '',
          "Model Architecture": p.analysis?.model_architecture || '',
          "Key Ideas": p.analysis?.borrowable_ideas || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Papers");
      XLSX.writeFile(workbook, `PaperScope_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // --- Tag Handling Logic ---
  const startEditingTags = (paper: PaperData) => {
      // Join tags for editing
      setTempTagInput((paper.tags || []).join(', '));
      setEditingTagsId(paper.id);
  };

  const saveTags = (id: string) => {
      const newTags = tempTagInput
        .split(/[,，]/) // split by comma or Chinese comma
        .map(t => t.trim())
        .filter(t => t.length > 0);
      
      const uniqueTags = Array.from(new Set(newTags));

      setPapers(prev => prev.map(p => p.id === id ? { ...p, tags: uniqueTags } : p));
      setEditingTagsId(null);
  };

  const handleScreenshotUpload = (id: string, file: File) => {
      if (!file.type.startsWith('image/')) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
          const result = e.target?.result as string;
          setPapers(prev => prev.map(p => p.id === id ? { ...p, screenshot: result } : p));
      };
      reader.readAsDataURL(file);
  };

  const handlePaste = (id: string, e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
              const blob = items[i].getAsFile();
              if (blob) {
                  handleScreenshotUpload(id, blob);
                  e.preventDefault(); 
              }
          }
      }
  };

  const openPdf = (file: File) => {
    setPdfViewer({ isOpen: true, file });
  };

  const openDetail = (paperId: string, fieldKey: string, title: string, content: string, type: AnalysisColumn) => {
    setActiveModal({
      isOpen: true,
      paperId,
      fieldKey,
      title,
      content,
      type,
    });
  };

  const closeModal = () => {
    setActiveModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleUpdateAnalysis = (newContent: string) => {
    setPapers(prev => prev.map(p => {
        if (p.id === activeModal.paperId && p.analysis) {
            return {
                ...p,
                analysis: {
                    ...p.analysis,
                    [activeModal.fieldKey]: newContent
                }
            };
        }
        return p;
    }));
  };

  // --- Resizing Logic ---
  const startResize = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    resizingRef.current = {
      key,
      startX: e.clientX,
      startWidth: columnWidths[key] || 150,
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { key, startX, startWidth } = resizingRef.current;
    const diff = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + diff); 
    setColumnWidths((prev) => ({ ...prev, [key]: newWidth }));
  };

  const handleMouseUp = () => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  // --- Render Helpers ---

  const RenderCell = ({
    paperId,
    fieldKey,
    content,
    label,
    type,
    isLoading
  }: {
    paperId: string;
    fieldKey: string;
    content?: string;
    label: string;
    type: AnalysisColumn;
    isLoading: boolean;
  }) => {
    if (isLoading) {
      return <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>;
    }
    if (!content) return <span className="text-gray-300 italic cursor-pointer hover:bg-gray-100 p-1 rounded" onClick={() => openDetail(paperId, fieldKey, label, '', type)}>Empty (Click to Edit)</span>;

    return (
      <div
        onClick={() => openDetail(paperId, fieldKey, label, content, type)}
        className="group cursor-pointer p-1 rounded hover:bg-indigo-50 transition-colors duration-200 h-full flex items-center"
      >
        <p className="truncate text-sm text-gray-700 w-full group-hover:text-indigo-700">
          {content}
        </p>
      </div>
    );
  };

  const columns = [
    { label: 'Type', key: 'type', colType: AnalysisColumn.TYPE },
    { label: 'Title', key: 'title', colType: AnalysisColumn.TITLE },
    { label: 'Venue', key: 'publication', colType: AnalysisColumn.PUBLICATION },
    { label: 'Problem', key: 'problem', colType: AnalysisColumn.PROBLEM },
    { label: 'Solution', key: 'solution_idea', colType: AnalysisColumn.SOLUTION },
    { label: 'Contribution', key: 'contribution', colType: AnalysisColumn.CONTRIBUTION },
    { label: 'Method', key: 'method', colType: AnalysisColumn.METHOD },
    { label: 'Model Arch', key: 'model_architecture', colType: AnalysisColumn.MODEL },
    { label: 'Key Ideas', key: 'borrowable_ideas', colType: AnalysisColumn.IDEAS },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F3F4F6]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-[1920px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
              P
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              PaperScope <span className="text-indigo-600">AI</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
             {selectedPaperIds.size >= 1 && (
                 <button
                    onClick={handleExportExcel}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors shadow-md animate-in fade-in"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Export ({selectedPaperIds.size})
                 </button>
             )}
             {selectedPaperIds.size >= 2 && (
                 <button
                    onClick={handleCompare}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors shadow-md animate-in fade-in"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    Compare ({selectedPaperIds.size})
                 </button>
             )}
             <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
              Configure Model
            </button>
            <div className="h-6 w-px bg-gray-300"></div>
            <a href="https://ai.google.dev" target="_blank" rel="noreferrer" className="text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors">
              Powered by Gemini
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-hidden flex flex-col gap-6">
        {/* Upload Section */}
        <div className="max-w-4xl mx-auto w-full">
            <FileUpload 
              onFilesSelected={handleFilesSelected} 
              isProcessing={false} 
            />
        </div>

        {/* Tags Tabs - Horizontal Scrolling */}
        {papers.length > 0 && (
             <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                <button
                    onClick={() => setActiveTab('All')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all shadow-sm border whitespace-nowrap ${
                        activeTab === 'All' 
                            ? 'bg-indigo-600 text-white border-indigo-600' 
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                >
                    All
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === 'All' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {getTagCount('All')}
                    </span>
                </button>
                
                {uniqueTags.map(tag => (
                    <button
                        key={tag}
                        onClick={() => setActiveTab(tag)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all shadow-sm border whitespace-nowrap ${
                            activeTab === tag
                                ? 'bg-indigo-600 text-white border-indigo-600' 
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        {tag}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tag ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                            {getTagCount(tag)}
                        </span>
                    </button>
                ))}

                {getTagCount('Uncategorized') > 0 && (
                    <button
                        onClick={() => setActiveTab('Uncategorized')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all shadow-sm border whitespace-nowrap ${
                            activeTab === 'Uncategorized'
                                ? 'bg-indigo-600 text-white border-indigo-600' 
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        Uncategorized
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === 'Uncategorized' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                            {getTagCount('Uncategorized')}
                        </span>
                    </button>
                )}
             </div>
        )}

        {/* Data Table */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col relative">
          {papers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-12">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mb-4 text-gray-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className="text-lg font-medium">No papers uploaded yet</p>
              <p className="text-sm">Upload PDFs to start your analysis</p>
              {settings.useExternal && (
                  <p className="text-xs text-indigo-600 mt-2 font-mono">Using external model: {settings.model}</p>
              )}
            </div>
          ) : (
            <div className="overflow-auto custom-scrollbar flex-1 relative">
              <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm">
                  <tr>
                    {/* Checkbox Column Header */}
                    <th 
                        className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 w-12 text-center"
                        style={{ width: columnWidths['checkbox'] }}
                    >
                        <input 
                            type="checkbox"
                            checked={filteredPapers.length > 0 && filteredPapers.every(p => selectedPaperIds.has(p.id))}
                            onChange={toggleAllSelection}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                        />
                    </th>

                    {/* Tags Column Header */}
                    <th 
                        className="relative p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 select-none group"
                        style={{ width: columnWidths['tags'] || 200 }}
                    >
                      Tags
                      <div 
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300 z-10"
                        onMouseDown={(e) => startResize(e, 'tags')}
                      />
                    </th>

                    {/* File Column Header */}
                    <th 
                        className="relative p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 select-none group"
                        style={{ width: columnWidths['file'] || 250 }}
                    >
                      File
                      <div 
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300 z-10"
                        onMouseDown={(e) => startResize(e, 'file')}
                      />
                    </th>

                    {/* Dynamic Headers */}
                    {columns.map((col) => (
                      <th
                        key={col.label}
                        className="relative p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 select-none group"
                        style={{ width: columnWidths[col.key] || 200 }}
                      >
                        {col.label}
                        <div 
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300 z-10"
                            onMouseDown={(e) => startResize(e, col.key)}
                        />
                      </th>
                    ))}
                    
                    {/* Screenshot Header */}
                    <th 
                        className="relative p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 select-none group"
                        style={{ width: columnWidths['screenshot'] || 150 }}
                    >
                      Screenshot
                      <div 
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300 z-10"
                        onMouseDown={(e) => startResize(e, 'screenshot')}
                      />
                    </th>

                    {/* Action Header */}
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 w-16">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPapers.map((paper) => {
                    const isAnalyzing = paper.status === 'analyzing';
                    const isError = paper.status === 'error';
                    const isSelected = selectedPaperIds.has(paper.id);
                    const isEditingTags = editingTagsId === paper.id;
                    
                    return (
                      <tr
                        key={paper.id}
                        className={`hover:bg-gray-50 transition-colors group ${isSelected ? 'bg-indigo-50/30' : ''}`}
                      >
                         {/* Checkbox Column */}
                         <td className="p-4 align-top text-center" style={{ width: columnWidths['checkbox'] }}>
                             <input 
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelection(paper.id)}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer mt-2"
                             />
                         </td>

                        {/* Tags Column */}
                        <td className="p-4 align-top" style={{ width: columnWidths['tags'] || 200 }}>
                            {isEditingTags ? (
                                <input 
                                    type="text"
                                    value={tempTagInput}
                                    onChange={(e) => setTempTagInput(e.target.value)}
                                    onBlur={() => saveTags(paper.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveTags(paper.id);
                                        if (e.key === 'Escape') setEditingTagsId(null);
                                    }}
                                    autoFocus
                                    className="w-full bg-white border border-indigo-400 rounded px-2 py-1 text-sm text-gray-700 shadow-sm focus:ring-2 focus:ring-indigo-200 outline-none placeholder:text-gray-300"
                                    placeholder="tag1, tag2..."
                                />
                            ) : (
                                <div 
                                    onClick={() => startEditingTags(paper)}
                                    className="flex flex-wrap gap-1.5 cursor-text min-h-[32px] content-start"
                                >
                                    {paper.tags && paper.tags.length > 0 ? (
                                        paper.tags.map((tag, idx) => (
                                            <span 
                                                key={idx}
                                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors border border-indigo-200"
                                            >
                                                {tag}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-gray-300 text-sm italic hover:text-gray-400 border border-transparent border-dashed hover:border-gray-300 px-2 rounded">
                                            + tags
                                        </span>
                                    )}
                                </div>
                            )}
                        </td>

                        {/* File Column */}
                        <td className="p-4 align-top overflow-hidden" style={{ width: columnWidths['file'] || 250 }}>
                          <div className="flex items-start gap-3">
                            <div className={`mt-1 p-1.5 rounded-lg shrink-0 ${
                                isAnalyzing ? 'bg-amber-100 text-amber-600' :
                                isError ? 'bg-red-100 text-red-600' :
                                'bg-indigo-100 text-indigo-600'
                            }`}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                </svg>
                            </div>
                            <div className="overflow-hidden w-full">
                              <p 
                                className="font-medium text-indigo-600 hover:text-indigo-800 text-sm truncate w-full cursor-pointer hover:underline" 
                                title="Click to view PDF"
                                onClick={() => openPdf(paper.file)}
                              >
                                {paper.fileName}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                {isAnalyzing && (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                    Analyzing...
                                  </span>
                                )}
                                {isError && (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                                    Error
                                  </span>
                                )}
                                {!isAnalyzing && !isError && (
                                    <span className="text-xs text-gray-400">
                                        {(paper.fileSize / 1024 / 1024).toFixed(2)} MB
                                    </span>
                                )}
                              </div>
                              {isError && (
                                <p className="text-xs text-red-500 mt-1 truncate w-full">
                                    {paper.errorMessage}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Analysis Columns */}
                        {columns.map((col) => (
                          <td 
                            key={`${paper.id}-${col.key}`} 
                            className="p-4 align-top border-l border-gray-50 overflow-hidden"
                            style={{ width: columnWidths[col.key] || 200 }}
                          >
                             <RenderCell
                                paperId={paper.id}
                                fieldKey={col.key}
                                label={col.label}
                                type={col.colType}
                                content={paper.analysis ? (paper.analysis as any)[col.key] : ''}
                                isLoading={isAnalyzing}
                             />
                          </td>
                        ))}

                        {/* Screenshot Column */}
                        <td 
                           className="p-4 align-top border-l border-gray-50"
                           style={{ width: columnWidths['screenshot'] || 150 }}
                        >
                            <div 
                                tabIndex={0}
                                onPaste={(e) => handlePaste(paper.id, e)}
                                className="w-full min-h-[80px] h-full flex items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-indigo-300 transition-colors relative focus:ring-2 focus:ring-indigo-500 outline-none overflow-hidden group/upload"
                            >
                                {paper.screenshot ? (
                                    <div className="relative w-full h-full flex flex-col items-center">
                                        <img 
                                            src={paper.screenshot} 
                                            alt="Screenshot" 
                                            className="max-h-[100px] object-contain cursor-zoom-in"
                                            onClick={() => setImageModal({ isOpen: true, url: paper.screenshot })}
                                        />
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setPapers(prev => prev.map(p => p.id === paper.id ? { ...p, screenshot: null } : p)) }}
                                            className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-bl shadow-sm opacity-0 group-hover/upload:opacity-100 transition-opacity"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer p-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-400 mb-1">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                            </svg>
                                            <span className="text-[10px] text-gray-400 text-center leading-tight">Paste (Ctrl+V) or Click</span>
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                className="hidden" 
                                                onChange={(e) => {
                                                    if(e.target.files?.[0]) handleScreenshotUpload(paper.id, e.target.files[0]);
                                                }}
                                            />
                                        </label>
                                    </>
                                )}
                            </div>
                        </td>

                        {/* Action Column */}
                        <td className="p-4 align-top text-right w-16">
                          <button
                            onClick={() => deletePaper(paper.id)}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50"
                            title="Remove paper"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <DetailModal
        isOpen={activeModal.isOpen}
        onClose={closeModal}
        title={activeModal.title}
        content={activeModal.content}
        type={activeModal.type}
        onSave={handleUpdateAnalysis}
      />
      
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={setSettings}
      />
      
      <PdfViewerModal 
        isOpen={pdfViewer.isOpen}
        file={pdfViewer.file}
        onClose={() => setPdfViewer({ isOpen: false, file: null })}
      />

      <ComparisonModal
        isOpen={comparisonModal.isOpen}
        isLoading={comparisonModal.isLoading}
        result={comparisonModal.result}
        onClose={() => setComparisonModal(prev => ({ ...prev, isOpen: false }))}
      />

      <ImageModal 
        isOpen={imageModal.isOpen}
        onClose={() => setImageModal({ isOpen: false, url: null })}
        imageUrl={imageModal.url}
      />
    </div>
  );
};

export default App;