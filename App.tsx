import React, { useState, useRef, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import FileUpload from './components/FileUpload';
import DetailModal from './components/DetailModal';
import SettingsModal from './components/SettingsModal';
import PdfViewerModal from './components/PdfViewerModal';
import ComparisonModal from './components/ComparisonModal';
import ImageModal from './components/ImageModal';
import AuthPage from './components/AuthPage';
import { analyzePaperWithGemini, comparePapersWithGemini } from './services/geminiService';
import { PaperData, AnalysisColumn, LLMSettings, DEFAULT_SETTINGS, ComparisonResult, Highlight } from './types';

// Default column widths
const DEFAULT_WIDTHS: Record<string, number> = {
  checkbox: 48,
  file: 300,
  tags: 160,
  type: 120,
  title: 250,
  publication: 150,
  problem: 220,
  solution_idea: 220,
  contribution: 220,
  method: 220,
  model_architecture: 220,
  borrowable_ideas: 220,
  screenshot: 180,
};

// Tag Color Palette - Pre-defined full class strings to ensure Tailwind picks them up
const TAG_COLORS = [
  { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', activeBg: 'bg-blue-100', hoverBg: 'hover:bg-blue-50' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', activeBg: 'bg-emerald-100', hoverBg: 'hover:bg-emerald-50' },
  { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', activeBg: 'bg-purple-100', hoverBg: 'hover:bg-purple-50' },
  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', activeBg: 'bg-amber-100', hoverBg: 'hover:bg-amber-50' },
  { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', activeBg: 'bg-rose-100', hoverBg: 'hover:bg-rose-50' },
  { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', activeBg: 'bg-cyan-100', hoverBg: 'hover:bg-cyan-50' },
  { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', activeBg: 'bg-indigo-100', hoverBg: 'hover:bg-indigo-50' },
  { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200', activeBg: 'bg-fuchsia-100', hoverBg: 'hover:bg-fuchsia-50' },
  { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200', activeBg: 'bg-lime-100', hoverBg: 'hover:bg-lime-50' },
  { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', activeBg: 'bg-sky-100', hoverBg: 'hover:bg-sky-50' },
];

const getTagStyle = (tag: string) => {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TAG_COLORS.length;
  return TAG_COLORS[index];
};

const App: React.FC = () => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    return localStorage.getItem('paperScope_currentUser');
  });

  const [papers, setPapers] = useState<PaperData[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<LLMSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  
  // Banner State
  const [bannerImage, setBannerImage] = useState<string>(() => {
    return localStorage.getItem('paperScope_banner') || '/banner.jpg';
  });
  
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
  const [pdfViewer, setPdfViewer] = useState<{ isOpen: boolean; paper: PaperData | null }>({
    isOpen: false,
    paper: null,
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

  // --- Auth Handlers ---
  const handleLogin = (username: string) => {
      setCurrentUser(username);
      localStorage.setItem('paperScope_currentUser', username);
  };

  const handleLogout = () => {
      setCurrentUser(null);
      localStorage.removeItem('paperScope_currentUser');
  };

  // --- Banner Handler ---
  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (event) => {
              const result = event.target?.result as string;
              setBannerImage(result);
              localStorage.setItem('paperScope_banner', result);
          };
          reader.readAsDataURL(file);
      }
  };

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
      return papers.filter(p => p.tags && p.tags.includes(activeTab));
  }, [papers, activeTab]);

  const getTagCount = (tagName: string) => {
      if (tagName === 'All') return papers.length;
      if (tagName === 'Uncategorized') return papers.filter(p => !p.tags || p.tags.length === 0).length;
      return papers.filter(p => p.tags && p.tags.includes(tagName)).length;
  };

  const handleFilesSelected = async (files: File[]) => {
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
      screenshots: [],
    }));

    setPapers((prev) => [...prev, ...newPapers]);
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
          "Key Ideas": p.analysis?.borrowable_ideas || '',
          "Screenshots": p.screenshots?.length || 0 
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Papers");
      XLSX.writeFile(workbook, `PaperScope_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // --- Tag Handling Logic ---
  const startEditingTags = (paper: PaperData) => {
      setTempTagInput((paper.tags || []).join(', '));
      setEditingTagsId(paper.id);
  };

  const saveTags = (id: string) => {
      const newTags = tempTagInput
        .split(/[,，]/)
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
          setPapers(prev => prev.map(p => p.id === id ? { ...p, screenshots: [...(p.screenshots || []), result] } : p));
      };
      reader.readAsDataURL(file);
  };

  const removeScreenshot = (paperId: string, indexToRemove: number) => {
      setPapers(prev => prev.map(p => {
          if (p.id !== paperId) return p;
          return {
              ...p,
              screenshots: (p.screenshots || []).filter((_, idx) => idx !== indexToRemove)
          };
      }));
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

  const openPdf = (paper: PaperData) => {
    setPdfViewer({ isOpen: true, paper });
  };

  const handleSavePaperUpdates = (paperId: string, highlights: Highlight[]) => {
      setPapers(prev => prev.map(p => {
          if (p.id === paperId) {
              return { ...p, highlights };
          }
          return p;
      }));
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
      return <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4"></div>;
    }
    if (!content) return <span className="text-gray-300 text-xs italic cursor-pointer hover:text-gray-500 transition-colors" onClick={() => openDetail(paperId, fieldKey, label, '', type)}>No Data</span>;

    return (
      <div
        onClick={() => openDetail(paperId, fieldKey, label, content, type)}
        className="group cursor-pointer rounded hover:bg-indigo-50/50 transition-colors duration-200 h-full flex items-start pt-1"
      >
        <p className="line-clamp-3 text-sm text-gray-700 leading-relaxed group-hover:text-indigo-900">
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

  if (!currentUser) {
      return <AuthPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      
      <FileUpload 
          onFilesSelected={handleFilesSelected} 
          isProcessing={false} 
      />

      {/* Professional Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-[1920px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white font-bold shadow-sm">
                   A
               </div>
               <div>
                  <h1 className="text-lg font-bold text-gray-900 tracking-tight leading-none">
                    XJTLU AI Lab
                  </h1>
                  <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Research Workspace</span>
               </div>
            </div>
            
            <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block"></div>

            {/* Desktop Tabs embedded in header */}
            <nav className="hidden md:flex items-center gap-1">
               <button
                    onClick={() => setActiveTab('All')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        activeTab === 'All' 
                            ? 'bg-gray-100 text-gray-900' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    All Papers
                    <span className="ml-2 bg-gray-200 text-gray-600 py-0.5 px-1.5 rounded-full text-[10px]">{getTagCount('All')}</span>
                </button>
                {uniqueTags.map(tag => {
                    const style = getTagStyle(tag);
                    const isActive = activeTab === tag;
                    return (
                        <button
                            key={tag}
                            onClick={() => setActiveTab(tag)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${
                                isActive
                                    ? `${style.activeBg} ${style.text} ${style.border}` 
                                    : `bg-white ${style.text} border-transparent ${style.hoverBg}`
                            }`}
                        >
                            <span>{tag}</span>
                            <span className={`ml-2 py-0.5 px-1.5 rounded-full text-[10px] ${isActive ? 'bg-white/50 text-inherit' : 'bg-gray-100 text-gray-600'}`}>
                                {getTagCount(tag)}
                            </span>
                        </button>
                    );
                })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
             {selectedPaperIds.size >= 1 && (
                 <button
                    onClick={handleExportExcel}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md transition-colors shadow-sm"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    Export
                 </button>
             )}
             {selectedPaperIds.size >= 2 && (
                 <button
                    onClick={handleCompare}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors shadow-sm"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                    Compare
                 </button>
             )}
             <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              title="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.1-.463 1.112h-1.82a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
            <div className="h-6 w-px bg-gray-200"></div>
            
            <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center font-bold text-xs shadow-inner">
                    {currentUser?.charAt(0).toUpperCase()}
                </div>
                <button
                    onClick={handleLogout}
                    className="text-xs font-medium text-gray-500 hover:text-red-600 transition-colors"
                >
                    Sign out
                </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6 py-6 overflow-hidden flex flex-col gap-6 relative z-0">
        
        {/* Banner - Workspace Cover Style */}
        <div className="relative group rounded-xl overflow-hidden shadow-sm border border-gray-200 h-32 md:h-48 shrink-0 bg-gray-100">
            <img 
                src={bannerImage} 
                alt="Workspace Banner" 
                className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700 ease-out"
                onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://placehold.co/1200x300/F1F5F9/94A3B8?text=Workspace+Cover';
                }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
            <label className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-md text-white/90 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-black/60 transition-colors cursor-pointer flex items-center gap-2 border border-white/10 opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 duration-200">
                <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleBannerUpload}
                />
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                Change Cover
            </label>
            <div className="absolute bottom-4 left-6 text-white">
                <h2 className="text-xl md:text-2xl font-bold tracking-tight">Paper Analysis</h2>
                <p className="text-white/80 text-sm">Organize and analyze your research literature.</p>
            </div>
        </div>

        {/* Data Table */}
        <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col relative">
          {papers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-12 bg-white">
               <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4 border border-gray-100">
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#94A3B8" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                   </svg>
               </div>
              <p className="text-lg font-medium text-gray-900">No papers yet</p>
              <p className="text-sm text-gray-500 mt-1">Upload a PDF to get started with the analysis.</p>
            </div>
          ) : (
            <div className="overflow-auto custom-scrollbar flex-1 relative">
              <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm border-b border-gray-200">
                  <tr>
                    {/* Checkbox Column Header */}
                    <th 
                        className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200/50 w-12 text-center"
                        style={{ width: columnWidths['checkbox'] }}
                    >
                        <input 
                            type="checkbox"
                            checked={filteredPapers.length > 0 && filteredPapers.every(p => selectedPaperIds.has(p.id))}
                            onChange={toggleAllSelection}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                        />
                    </th>

                    {/* File Column Header */}
                    <th 
                        className="relative p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200/50 select-none group bg-gray-50 hover:bg-gray-100 transition-colors"
                        style={{ width: columnWidths['file'] || 300 }}
                    >
                      File Name
                      <div 
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/50 z-10"
                        onMouseDown={(e) => startResize(e, 'file')}
                      />
                    </th>

                    {/* Tags Column Header */}
                    <th 
                        className="relative p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200/50 select-none group bg-gray-50 hover:bg-gray-100 transition-colors"
                        style={{ width: columnWidths['tags'] || 160 }}
                    >
                      Tags
                      <div 
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/50 z-10"
                        onMouseDown={(e) => startResize(e, 'tags')}
                      />
                    </th>

                    {/* Dynamic Headers */}
                    {columns.map((col) => (
                      <th
                        key={col.label}
                        className="relative p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200/50 select-none group bg-gray-50 hover:bg-gray-100 transition-colors"
                        style={{ width: columnWidths[col.key] || 220 }}
                      >
                        {col.label}
                        <div 
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/50 z-10"
                            onMouseDown={(e) => startResize(e, col.key)}
                        />
                      </th>
                    ))}
                    
                    {/* Screenshot Header */}
                    <th 
                        className="relative p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200/50 select-none group bg-gray-50 hover:bg-gray-100 transition-colors"
                        style={{ width: columnWidths['screenshot'] || 150 }}
                    >
                      Screenshots
                      <div 
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/50 z-10"
                        onMouseDown={(e) => startResize(e, 'screenshot')}
                      />
                    </th>

                    {/* Action Header */}
                    <th className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16 text-center">
                      ...
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredPapers.map((paper) => {
                    const isAnalyzing = paper.status === 'analyzing';
                    const isError = paper.status === 'error';
                    const isSelected = selectedPaperIds.has(paper.id);
                    const isEditingTags = editingTagsId === paper.id;
                    
                    return (
                      <tr
                        key={paper.id}
                        className={`hover:bg-gray-50/80 transition-colors group ${isSelected ? 'bg-indigo-50/30' : ''}`}
                      >
                         {/* Checkbox Column */}
                         <td className="p-3 align-top text-center border-r border-gray-100" style={{ width: columnWidths['checkbox'] }}>
                             <input 
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelection(paper.id)}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer mt-1"
                             />
                         </td>

                        {/* File Column */}
                        <td className="p-3 align-top overflow-hidden border-r border-gray-100" style={{ width: columnWidths['file'] || 300 }}>
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 text-gray-400 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                </svg>
                            </div>
                            <div className="overflow-hidden w-full">
                              <p 
                                className="font-medium text-gray-900 hover:text-indigo-600 text-sm truncate w-full cursor-pointer transition-colors" 
                                title="Click to view PDF"
                                onClick={() => openPdf(paper)}
                              >
                                {paper.fileName}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                {isAnalyzing && (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100/50">
                                    <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span>
                                    Processing
                                  </span>
                                )}
                                {isError && (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-100/50">
                                    Failed
                                  </span>
                                )}
                                {!isAnalyzing && !isError && (
                                    <span className="text-[10px] text-gray-400 font-mono">
                                        {(paper.fileSize / 1024 / 1024).toFixed(2)} MB
                                    </span>
                                )}
                              </div>
                              {isError && (
                                <p className="text-[10px] text-red-500 mt-1 truncate w-full">
                                    {paper.errorMessage}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Tags Column */}
                        <td className="p-3 align-top border-r border-gray-100" style={{ width: columnWidths['tags'] || 160 }}>
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
                                    className="w-full bg-white border border-indigo-300 rounded px-2 py-1 text-xs text-gray-900 shadow-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                                    placeholder="tag1, tag2..."
                                />
                            ) : (
                                <div 
                                    onClick={() => startEditingTags(paper)}
                                    className="flex flex-wrap gap-1.5 cursor-text min-h-[24px] content-start"
                                >
                                    {paper.tags && paper.tags.length > 0 ? (
                                        paper.tags.map((tag, idx) => {
                                            const style = getTagStyle(tag);
                                            return (
                                              <span 
                                                  key={idx}
                                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${style.bg} ${style.text} ${style.border}`}
                                              >
                                                  {tag}
                                              </span>
                                            );
                                        })
                                    ) : (
                                        <span className="text-gray-300 text-[10px] hover:text-gray-500 border border-transparent hover:border-gray-200 px-1 rounded transition-colors opacity-0 group-hover:opacity-100">
                                            + add tag
                                        </span>
                                    )}
                                </div>
                            )}
                        </td>

                        {/* Analysis Columns */}
                        {columns.map((col) => (
                          <td 
                            key={`${paper.id}-${col.key}`} 
                            className="p-3 align-top border-r border-gray-100 overflow-hidden"
                            style={{ width: columnWidths[col.key] || 220 }}
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
                           className="p-3 align-top border-r border-gray-100"
                           style={{ width: columnWidths['screenshot'] || 150 }}
                        >
                            <div 
                                tabIndex={0}
                                onPaste={(e) => handlePaste(paper.id, e)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (e.dataTransfer.files?.[0]) handleScreenshotUpload(paper.id, e.dataTransfer.files[0]);
                                }}
                                onDragOver={(e) => e.preventDefault()}
                                className="w-full h-full min-h-[60px] outline-none"
                            >
                                {paper.screenshots && paper.screenshots.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        {paper.screenshots.map((shot, idx) => (
                                            <div key={idx} className="relative group/shot w-full aspect-square border border-gray-200 rounded overflow-hidden bg-gray-50">
                                                <img 
                                                    src={shot} 
                                                    alt={`Screenshot ${idx + 1}`} 
                                                    className="w-full h-full object-cover cursor-zoom-in hover:scale-105 transition-transform duration-200"
                                                    onClick={() => setImageModal({ isOpen: true, url: shot })}
                                                />
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); removeScreenshot(paper.id, idx); }}
                                                    className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 text-white rounded opacity-0 group-hover/shot:opacity-100 transition-opacity hover:bg-red-500"
                                                    title="Remove image"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                        {/* Add Button Tile */}
                                        <label className="flex items-center justify-center w-full aspect-square cursor-pointer border border-dashed border-gray-300 rounded hover:border-indigo-400 hover:bg-indigo-50 transition-colors bg-white text-gray-300 hover:text-indigo-400">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                            </svg>
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                className="hidden" 
                                                onChange={(e) => {
                                                    if(e.target.files?.[0]) handleScreenshotUpload(paper.id, e.target.files[0]);
                                                }}
                                            />
                                        </label>
                                    </div>
                                ) : (
                                    <>
                                        <label className="flex flex-col items-center justify-center w-full h-full min-h-[60px] cursor-pointer p-2 rounded border border-dashed border-gray-200 bg-gray-50/50 hover:bg-white hover:border-indigo-300 transition-colors group/upload">
                                            <span className="text-[10px] text-gray-400 group-hover/upload:text-indigo-500 transition-colors font-medium">Paste / Drop</span>
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
                        <td className="p-3 align-top text-center w-16">
                          <button
                            onClick={() => deletePaper(paper.id)}
                            className="text-gray-300 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                            title="Remove paper"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
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
        paper={pdfViewer.paper}
        onClose={() => setPdfViewer({ isOpen: false, paper: null })}
        onSave={handleSavePaperUpdates}
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