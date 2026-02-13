
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
import { savePaperToDB, getPapersFromDB, deletePaperFromDB, getBannerFromServer, saveBannerToServer, checkBackendHealth } from './services/db';
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
  critique: 250,
  future_work: 250,
  mind_map: 250,
  screenshot: 200,
};

// Tag Color Palette (Unchanged)
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

type AnalysisTask = {
  id: string;
  file: File | Blob | string;
  settings: LLMSettings;
};

const MAX_PARALLEL_ANALYSES = 2;
const PAPERS_PER_PAGE = 8;

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
  
  // Backend Health State
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  
  // Banner State
  const [bannerImage, setBannerImage] = useState<string>('/banner.jpg');
  
  // Grouping/Tagging State
  const [activeTab, setActiveTab] = useState<string>('All');
  const [currentPage, setCurrentPage] = useState<number>(1);
  
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

  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const papersRef = useRef<PaperData[]>([]);
  const syncInFlightRef = useRef<Set<string>>(new Set());
  const syncPendingRef = useRef<Map<string, PaperData>>(new Map());
  const analysisQueueRef = useRef<AnalysisTask[]>([]);
  const analysisQueuedIdsRef = useRef<Set<string>>(new Set());
  const activeAnalysisCountRef = useRef(0);

  useEffect(() => {
      papersRef.current = papers;
  }, [papers]);

  // Health Check function
  const performHealthCheck = async () => {
      setIsChecking(true);
      const healthy = await checkBackendHealth();
      setIsConnected(healthy);
      setIsChecking(false);
      return healthy;
  };

  // Initial Check
  useEffect(() => {
      performHealthCheck();
      const interval = setInterval(performHealthCheck, 30000);
      return () => clearInterval(interval);
  }, []);

  // Load papers and banner from Server on startup
  useEffect(() => {
    if (currentUser) {
        if (!isConnected) return; // Don't try to fetch if we know it's down
        
        getBannerFromServer().then(setBannerImage);
        getPapersFromDB(currentUser).then(storedPapers => {
            const sorted = storedPapers.sort((a, b) => b.uploadTime - a.uploadTime);
            setPapers(sorted);
            papersRef.current = sorted;
        });
    } else {
        setPapers([]);
        papersRef.current = [];
    }
  }, [currentUser, isConnected]);

  // Helper to sync state to DB
  const syncPaperToDB = async (paper: PaperData) => {
      syncPendingRef.current.set(paper.id, paper);
      if (syncInFlightRef.current.has(paper.id)) return;

      syncInFlightRef.current.add(paper.id);
      try {
          while (true) {
              const pendingPaper = syncPendingRef.current.get(paper.id);
              if (!pendingPaper) break;
              syncPendingRef.current.delete(paper.id);

              let healthy = isConnected;
              if (!healthy) {
                  healthy = await checkBackendHealth();
                  if (healthy) {
                      setIsConnected(true);
                  }
              }

              if (!healthy) {
                  setPapers(prev => prev.map(p => p.id === paper.id ? { ...p, saveStatus: 'error' } : p));
                  continue;
              }

              setPapers(prev => prev.map(p => p.id === paper.id ? { ...p, saveStatus: 'saving' } : p));

              try {
                  await savePaperToDB(pendingPaper);
                  setPapers(prev => prev.map(p => {
                      if (p.id !== paper.id) return p;
                      const storedFile = typeof p.file === 'string' ? p.file : `/api/files/${p.id}.pdf`;
                      return { ...p, file: storedFile, saveStatus: 'saved' };
                  }));
              } catch (e) {
                  console.error("Sync failed for", pendingPaper.fileName, e);
                  setPapers(prev => prev.map(p => p.id === paper.id ? { ...p, saveStatus: 'error' } : p));
              }
          }
      } finally {
          syncInFlightRef.current.delete(paper.id);
          if (syncPendingRef.current.has(paper.id)) {
              const latestPaper = syncPendingRef.current.get(paper.id);
              if (latestPaper) {
                  void syncPaperToDB(latestPaper);
              }
          }
      }
  };

  const handleLogin = (username: string) => {
      setCurrentUser(username);
      localStorage.setItem('paperScope_currentUser', username);
  };

  const handleLogout = () => {
      setCurrentUser(null);
      localStorage.removeItem('paperScope_currentUser');
      setPapers([]);
      papersRef.current = [];
      analysisQueueRef.current = [];
      analysisQueuedIdsRef.current.clear();
      activeAnalysisCountRef.current = 0;
      syncPendingRef.current.clear();
      syncInFlightRef.current.clear();
  };

  const runAnalysisQueue = () => {
      while (
          activeAnalysisCountRef.current < MAX_PARALLEL_ANALYSES &&
          analysisQueueRef.current.length > 0
      ) {
          const task = analysisQueueRef.current.shift();
          if (!task) break;

          activeAnalysisCountRef.current += 1;
          void processPaper(task.id, task.file, task.settings).finally(() => {
              activeAnalysisCountRef.current = Math.max(0, activeAnalysisCountRef.current - 1);
              analysisQueuedIdsRef.current.delete(task.id);
              runAnalysisQueue();
          });
      }
  };

  const enqueueAnalysis = (id: string, file: File | Blob | string, currentSettings: LLMSettings) => {
      if (analysisQueuedIdsRef.current.has(id)) return;
      analysisQueuedIdsRef.current.add(id);
      analysisQueueRef.current.push({ id, file, settings: currentSettings });
      runAnalysisQueue();
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (event) => {
              const result = event.target?.result as string;
              setBannerImage(result);
              saveBannerToServer(result); 
          };
          reader.readAsDataURL(file);
      }
  };

  // --- Derived State for Tags ---
  const uniqueTags = useMemo(() => {
      const allTags = papers.flatMap(p => p.tags || []);
      return Array.from(new Set(allTags)).sort();
  }, [papers]);

  const filteredPapers = useMemo(() => {
      if (activeTab === 'All') return papers;
      if (activeTab === 'Uncategorized') return papers.filter(p => !p.tags || p.tags.length === 0);
      return papers.filter(p => p.tags && p.tags.includes(activeTab));
  }, [papers, activeTab]);

  const totalPages = useMemo(() => {
      return Math.max(1, Math.ceil(filteredPapers.length / PAPERS_PER_PAGE));
  }, [filteredPapers.length]);

  const paginatedPapers = useMemo(() => {
      const startIndex = (currentPage - 1) * PAPERS_PER_PAGE;
      return filteredPapers.slice(startIndex, startIndex + PAPERS_PER_PAGE);
  }, [filteredPapers, currentPage]);

  const visiblePageNumbers = useMemo(() => {
      const maxVisiblePages = 5;
      if (totalPages <= maxVisiblePages) {
          return Array.from({ length: totalPages }, (_, index) => index + 1);
      }

      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + maxVisiblePages - 1);
      start = Math.max(1, end - maxVisiblePages + 1);

      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [currentPage, totalPages]);

  useEffect(() => {
      setCurrentPage(1);
  }, [activeTab]);

  useEffect(() => {
      setCurrentPage(prev => Math.min(prev, totalPages));
  }, [totalPages]);

  const getTagCount = (tagName: string) => {
      if (tagName === 'All') return papers.length;
      if (tagName === 'Uncategorized') return papers.filter(p => !p.tags || p.tags.length === 0).length;
      return papers.filter(p => p.tags && p.tags.includes(tagName)).length;
  };

  const handleFilesSelected = async (files: File[]) => {
    if (!currentUser) return;
    
    // Check connection before processing
    if (!isConnected) {
        const healthy = await performHealthCheck();
        if (!healthy) {
             alert("无法上传：后端服务未连接。请确认运行了 'npm start'");
             return;
        }
    }

    let initialTags: string[] = [];
    if (activeTab !== 'All' && activeTab !== 'Uncategorized') {
        initialTags = [activeTab];
    }

    const newPapers: PaperData[] = files.map((file) => ({
      id: uuidv4(),
      userId: currentUser,
      file,
      fileName: file.name,
      fileSize: file.size,
      uploadTime: Date.now(),
      status: 'idle',
      saveStatus: 'saving', 
      analysis: null,
      tags: initialTags,
      screenshots: [],
    }));

    setPapers((prev) => {
      const next = [...newPapers, ...prev];
      papersRef.current = next;
      return next;
    });
    
    newPapers.forEach((paper) => {
        enqueueAnalysis(paper.id, paper.file, settings);
        void syncPaperToDB(paper);
    });
  };

  const processPaper = async (id: string, file: File | Blob | string, currentSettings: LLMSettings) => {
    setPapers((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, status: 'analyzing', errorMessage: undefined } : p));
      papersRef.current = next;
      return next;
    });

    try {
      const result = await analyzePaperWithGemini(file, currentSettings);
      
      const latestPaper = papersRef.current.find(p => p.id === id);
      if (!latestPaper) return;

      const updatedPaper: PaperData = {
        ...latestPaper,
        status: 'success',
        analysis: result,
        errorMessage: undefined
      };

      setPapers((prev) => prev.map((p) => (p.id === id ? updatedPaper : p)));
      papersRef.current = papersRef.current.map((p) => (p.id === id ? updatedPaper : p));
      void syncPaperToDB(updatedPaper);

    } catch (error: any) {
      console.error(`Analysis failed for paper ${id}:`, error);

      let friendlyError = "Analysis failed";
      const msg = (error.message || "").toLowerCase();
      
      if (msg.includes("api key")) friendlyError = "Missing API Key";
      else if (msg.includes("json") || msg.includes("parse") || msg.includes("unexpected token")) friendlyError = "Model returned invalid format";
      else if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) friendlyError = "Network connection failed";
      else if (msg.includes("pdf") || msg.includes("file") || msg.includes("corrupt")) friendlyError = "Could not process PDF";
      else if (msg.includes("429")) friendlyError = "Rate limit exceeded (429)";
      else if (msg.includes("500") || msg.includes("503") || msg.includes("service")) friendlyError = "AI Service Unavailable";
      else if (msg.includes("timeout")) friendlyError = "Request Timed Out";
      else if (msg.includes("safety") || msg.includes("blocked")) friendlyError = "Content Blocked (Safety)";
      else if (msg.length > 0) friendlyError = error.message.length > 60 ? error.message.substring(0, 57) + "..." : error.message;

      const latestPaper = papersRef.current.find(p => p.id === id);
      if (!latestPaper) return;

      const updatedPaper: PaperData = {
        ...latestPaper,
        status: 'error',
        errorMessage: friendlyError
      };

      setPapers((prev) => prev.map((p) => (p.id === id ? updatedPaper : p)));
      papersRef.current = papersRef.current.map((p) => (p.id === id ? updatedPaper : p));
      void syncPaperToDB(updatedPaper);
    }
  };

  const retryAnalysis = (id: string) => {
    const paper = papers.find(p => p.id === id);
    if (!paper) return;
    
    // Trigger analysis again
    enqueueAnalysis(id, paper.file, settings);
  };

  const deletePaper = (id: string) => {
    deletePaperFromDB(id);
    setPapers((prev) => prev.filter((p) => p.id !== id));
    papersRef.current = papersRef.current.filter((p) => p.id !== id);
    syncPendingRef.current.delete(id);
    analysisQueueRef.current = analysisQueueRef.current.filter((task) => task.id !== id);
    analysisQueuedIdsRef.current.delete(id);
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
    const allVisibleIds = paginatedPapers.map(p => p.id);
    const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedPaperIds.has(id));

    if (allSelected) {
        setSelectedPaperIds(prev => {
            const next = new Set(prev);
            allVisibleIds.forEach(id => next.delete(id));
            return next;
        });
    } else {
        setSelectedPaperIds(prev => {
            const next = new Set(prev);
            allVisibleIds.forEach(id => next.add(id));
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
      }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Papers");
      XLSX.writeFile(workbook, `PaperScope_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const startEditingTags = (paper: PaperData) => {
      setTempTagInput((paper.tags || []).join(', '));
      setEditingTagsId(paper.id);
  };

  const saveTags = (id: string) => {
      const newTags = tempTagInput.split(/[,，]/).map(t => t.trim()).filter(t => t.length > 0);
      const uniqueTags = Array.from(new Set(newTags));
      setPapers(prev => prev.map(p => {
          if (p.id === id) {
              const updated = { ...p, tags: uniqueTags };
              syncPaperToDB(updated);
              return updated;
          }
          return p;
      }));
      setEditingTagsId(null);
  };

  const handleScreenshotUpload = (id: string, file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
          const result = e.target?.result as string;
          setPapers(prev => prev.map(p => {
              if (p.id === id) {
                  const updated = { ...p, screenshots: [...(p.screenshots || []), result] };
                  syncPaperToDB(updated);
                  return updated;
              }
              return p;
          }));
      };
      reader.readAsDataURL(file);
  };

  const removeScreenshot = (paperId: string, indexToRemove: number) => {
      setPapers(prev => prev.map(p => {
          if (p.id !== paperId) return p;
          const updated = {
              ...p,
              screenshots: (p.screenshots || []).filter((_, idx) => idx !== indexToRemove)
          };
          syncPaperToDB(updated);
          return updated;
      }));
  };

  const openPdf = (paper: PaperData) => {
    setPdfViewer({ isOpen: true, paper });
  };

  const handleSavePaperUpdates = (paperId: string, highlights: Highlight[]) => {
      setPapers(prev => prev.map(p => {
          if (p.id === paperId) {
              const updated = { ...p, highlights };
              syncPaperToDB(updated);
              return updated;
          }
          return p;
      }));
  };

  const openDetail = (paperId: string, fieldKey: string, title: string, content: string, type: AnalysisColumn) => {
    setActiveModal({ isOpen: true, paperId, fieldKey, title, content, type });
  };

  const closeModal = () => {
    setActiveModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleUpdateAnalysis = (newContent: string) => {
    setPapers(prev => prev.map(p => {
        if (p.id === activeModal.paperId && p.analysis) {
            const updated = {
                ...p,
                analysis: { ...p.analysis, [activeModal.fieldKey]: newContent }
            };
            syncPaperToDB(updated);
            return updated;
        }
        return p;
    }));
  };

  const startResize = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    resizingRef.current = { key, startX: e.clientX, startWidth: columnWidths[key] || 150 };
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

  const RenderCell = ({ paper, fieldKey, content, label, type }: { paper: PaperData; fieldKey: string; content?: string; label: string; type: AnalysisColumn }) => {
    const isAnalyzing = paper.status === 'analyzing';
    const isError = paper.status === 'error';

    if (isAnalyzing) return <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4"></div>;

    if (isError) {
        if (fieldKey === 'type') {
             return (
                 <div className="text-red-500 text-[10px] flex items-center gap-1 opacity-70">
                     <span className="truncate">See details ←</span>
                 </div>
             );
        }
        return <span className="text-gray-200 text-xs">-</span>;
    }

    if (!content) return <span className="text-gray-300 text-xs italic cursor-pointer hover:text-gray-500 transition-colors" onClick={() => openDetail(paper.id, fieldKey, label, '', type)}>暂无内容</span>;

    return (
      <div onClick={() => openDetail(paper.id, fieldKey, label, content, type)} className="group cursor-pointer rounded hover:bg-indigo-50/50 transition-colors duration-200 h-full flex items-start pt-1">
        <p className="line-clamp-3 text-sm text-gray-700 leading-relaxed group-hover:text-indigo-900 text-wrap break-words">{content}</p>
      </div>
    );
  };

  const columns = [
    { label: '📌 类型', key: 'type', colType: AnalysisColumn.TYPE },
    { label: '📑 论文标题', key: 'title', colType: AnalysisColumn.TITLE },
    { label: '🏛️ 发表刊物', key: 'publication', colType: AnalysisColumn.PUBLICATION },
    { label: '❓ 想要解决的问题', key: 'problem', colType: AnalysisColumn.PROBLEM },
    { label: '💡 解决思路', key: 'solution_idea', colType: AnalysisColumn.SOLUTION },
    { label: '🎁 贡献', key: 'contribution', colType: AnalysisColumn.CONTRIBUTION },
    { label: '🛠️ 方法', key: 'method', colType: AnalysisColumn.METHOD },
    { label: '🏗️ 模型图', key: 'model_architecture', colType: AnalysisColumn.MODEL },
    { label: '✨ 可借鉴思路', key: 'borrowable_ideas', colType: AnalysisColumn.IDEAS },
    { label: '⚖️ 批判性评估', key: 'critique', colType: AnalysisColumn.CRITIQUE },
    { label: '🚀 未来研究方向', key: 'future_work', colType: AnalysisColumn.FUTURE_WORK },
    { label: '🧠 思维导图', key: 'mind_map', colType: AnalysisColumn.MIND_MAP },
  ];

  if (!currentUser) return <AuthPage onLogin={handleLogin} />;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <FileUpload onFilesSelected={handleFilesSelected} isProcessing={!isConnected} />

      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-[1920px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white font-bold shadow-sm">A</div>
               <div>
                  <h1 className="text-lg font-bold text-gray-900 tracking-tight leading-none">XJTLU AI Lab</h1>
                  <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Research Assistant</span>
               </div>
            </div>
            {/* Health Indicator */}
            <div 
                className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 transition-colors cursor-pointer ${isConnected ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}
                onClick={performHealthCheck}
                title="点击检查连接"
            >
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
                {isChecking ? '检查中...' : isConnected ? '系统在线' : '后端断开'}
            </div>

            <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block"></div>
            <nav className="hidden md:flex items-center gap-1">
               <button onClick={() => setActiveTab('All')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'All' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                    全部论文
                    <span className="ml-2 bg-gray-200 text-gray-600 py-0.5 px-1.5 rounded-full text-[10px]">{getTagCount('All')}</span>
                </button>
                {uniqueTags.map(tag => {
                    const style = getTagStyle(tag);
                    const isActive = activeTab === tag;
                    return (
                        <button key={tag} onClick={() => setActiveTab(tag)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${isActive ? `${style.activeBg} ${style.text} ${style.border}` : `bg-white ${style.text} border-transparent ${style.hoverBg}`}`}>
                            <span>{tag}</span>
                            <span className={`ml-2 py-0.5 px-1.5 rounded-full text-[10px] ${isActive ? 'bg-white/50 text-inherit' : 'bg-gray-100 text-gray-600'}`}>{getTagCount(tag)}</span>
                        </button>
                    );
                })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
             {selectedPaperIds.size >= 1 && <button onClick={handleExportExcel} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md shadow-sm">导出 Excel</button>}
             {selectedPaperIds.size >= 2 && <button onClick={handleCompare} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm">对比论文</button>}
             <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.1-.463 1.112h-1.82a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg></button>
             <div className="h-6 w-px bg-gray-200"></div>
             <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center font-bold text-xs shadow-inner">{currentUser?.charAt(0).toUpperCase()}</div>
                <button onClick={handleLogout} className="text-xs font-medium text-gray-500 hover:text-red-600 transition-colors">退出登录</button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Alert if disconnected */}
      {!isConnected && (
          <div className="bg-red-600 text-white text-center py-2 text-xs font-bold sticky top-16 z-30 shadow-md animate-in slide-in-from-top-4">
              <div className="flex items-center justify-center gap-2">
                 <span>⚠️ 无法连接到后端服务器。数据将不会保存。请在终端运行: npm start</span>
                 <button 
                    onClick={performHealthCheck} 
                    className="bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded text-[10px] uppercase border border-white/20 transition-colors"
                 >
                    {isChecking ? '连接中...' : '重试连接'}
                 </button>
              </div>
          </div>
      )}

      <main className="flex-1 px-6 py-6 overflow-hidden flex flex-col gap-6 relative z-0">
        <div className="relative group rounded-xl overflow-hidden shadow-sm border border-gray-200 h-32 md:h-48 shrink-0 bg-gray-100">
            <img src={bannerImage} alt="Workspace Banner" className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700 ease-out" onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/1200x300/F1F5F9/94A3B8?text=Workspace+Cover'; }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
            <label className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-md text-white/90 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-black/60 transition-colors cursor-pointer flex items-center gap-2 border border-white/10 opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 duration-200">
                <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>更换封面
            </label>
            <div className="absolute bottom-4 left-6 text-white">
                <h2 className="text-xl md:text-2xl font-bold tracking-tight">AI 论文阅读助手</h2>
                <p className="text-white/80 text-sm">Collaborative workspace for AI analysis.</p>
            </div>
        </div>

        <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col relative">
          {papers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-12 bg-white">
               <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4 border border-gray-100"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#94A3B8" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg></div>
              <p className="text-lg font-medium text-gray-900">暂无论文</p>
              <p className="text-sm text-gray-500 mt-1">请点击右下角按钮上传 PDF。</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="overflow-auto custom-scrollbar flex-1 relative">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm border-b border-gray-200">
                    <tr>
                      <th className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200/50 w-12 text-center" style={{ width: columnWidths['checkbox'] }}>
                          <input type="checkbox" checked={paginatedPapers.length > 0 && paginatedPapers.every(p => selectedPaperIds.has(p.id))} onChange={toggleAllSelection} className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer" />
                      </th>
                      <th className="relative p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200/50 select-none group bg-gray-50 hover:bg-gray-100 transition-colors" style={{ width: columnWidths['file'] || 300 }}>
                        📄 论文文件
                        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/50 z-10" onMouseDown={(e) => startResize(e, 'file')} />
                      </th>
                      <th className="relative p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200/50 select-none group bg-gray-50 hover:bg-gray-100 transition-colors" style={{ width: columnWidths['tags'] || 160 }}>
                        🏷️ 标签
                        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/50 z-10" onMouseDown={(e) => startResize(e, 'tags')} />
                      </th>
                      {columns.map((col) => (
                        <th key={col.label} className="relative p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200/50 select-none group bg-gray-50 hover:bg-gray-100 transition-colors" style={{ width: columnWidths[col.key] || 220 }}>
                          {col.label}
                          <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/50 z-10" onMouseDown={(e) => startResize(e, col.key)} />
                        </th>
                      ))}
                      <th className="relative p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200/50 select-none group bg-gray-50 hover:bg-gray-100 transition-colors" style={{ width: columnWidths['screenshot'] || 200 }}>
                        🖼️ 截图
                        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/50 z-10" onMouseDown={(e) => startResize(e, 'screenshot')} />
                      </th>
                      <th className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16 text-center">...</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {paginatedPapers.map((paper) => {
                      const isAnalyzing = paper.status === 'analyzing';
                      const isError = paper.status === 'error';
                      const isSaving = paper.saveStatus === 'saving';
                      const saveFailed = paper.saveStatus === 'error';
                      const isSelected = selectedPaperIds.has(paper.id);
                      const isEditingTags = editingTagsId === paper.id;
                      
                      return (
                        <tr key={paper.id} className={`hover:bg-gray-50/80 transition-colors group ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                           <td className="p-3 align-top text-center border-r border-gray-100" style={{ width: columnWidths['checkbox'] }}>
                               <input type="checkbox" checked={isSelected} onChange={() => toggleSelection(paper.id)} className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer mt-1" />
                           </td>
                          <td className="p-3 align-top overflow-hidden border-r border-gray-100" style={{ width: columnWidths['file'] || 300 }}>
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 text-gray-400 shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                              </div>
                              <div className="overflow-hidden w-full">
                                <p className="font-medium text-gray-900 hover:text-indigo-600 text-sm truncate w-full cursor-pointer transition-colors" onClick={() => openPdf(paper)}>
                                  {paper.fileName}
                                </p>
                                <div className="flex flex-col gap-1 mt-1">
                                  {isSaving && <span className="text-[10px] text-indigo-500 animate-pulse">☁️ 保存中...</span>}
                                  {saveFailed && <span className="text-[10px] text-red-500 font-bold" title="上传失败，刷新后数据将丢失">⚠️ 保存失败</span>}
                                  {isAnalyzing && (
                                    <span className="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100/50">
                                      <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span>
                                      正在分析...
                                    </span>
                                  )}
                                  {isError && (
                                      <div className="flex items-center gap-2 mt-1">
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-100/50 max-w-[150px] truncate" title={paper.errorMessage}>
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 shrink-0"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                                              {paper.errorMessage || "失败"}
                                          </span>
                                          <button 
                                              onClick={(e) => { e.stopPropagation(); retryAnalysis(paper.id); }}
                                              className="group/retry flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded transition-colors"
                                              title="Retry Analysis"
                                          >
                                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3 group-hover/retry:animate-spin">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                              </svg>
                                              Retry
                                          </button>
                                      </div>
                                  )}
                                  {!isAnalyzing && !isError && (
                                      <span className="text-[10px] text-gray-400 font-mono">{(paper.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="p-3 align-top border-r border-gray-100" style={{ width: columnWidths['tags'] || 160 }}>
                              {isEditingTags ? (
                                  <input type="text" value={tempTagInput} onChange={(e) => setTempTagInput(e.target.value)} onBlur={() => saveTags(paper.id)} onKeyDown={(e) => { if (e.key === 'Enter') saveTags(paper.id); if (e.key === 'Escape') setEditingTagsId(null); }} autoFocus className="w-full bg-white border border-indigo-300 rounded px-2 py-1 text-xs text-gray-900 shadow-sm focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="标签1, 标签2..." />
                              ) : (
                                  <div onClick={() => startEditingTags(paper)} className="flex flex-wrap gap-1.5 cursor-text min-h-[24px] content-start">
                                      {paper.tags && paper.tags.length > 0 ? (
                                          paper.tags.map((tag, idx) => {
                                              const style = getTagStyle(tag);
                                              return <span key={idx} className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${style.bg} ${style.text} ${style.border}`}>{tag}</span>;
                                          })
                                      ) : (
                                          <span className="text-gray-300 text-[10px] hover:text-gray-500 border border-transparent hover:border-gray-200 px-1 rounded transition-colors opacity-0 group-hover:opacity-100">+ 添加标签</span>
                                      )}
                                  </div>
                              )}
                          </td>
                          {columns.map((col) => (
                            <td key={`${paper.id}-${col.key}`} className="p-3 align-top border-r border-gray-100 overflow-hidden" style={{ width: columnWidths[col.key] || 220 }}>
                               <RenderCell paper={paper} fieldKey={col.key} label={col.label} type={col.colType} content={paper.analysis ? (paper.analysis as any)[col.key] : ''} />
                            </td>
                          ))}
                          <td className="p-3 align-top border-r border-gray-100" style={{ width: columnWidths['screenshot'] || 200 }}>
                              <div className="w-full h-full min-h-[60px] outline-none flex flex-wrap content-start gap-2">
                                  {paper.screenshots && paper.screenshots.length > 0 && paper.screenshots.map((shot, idx) => (
                                      <div key={idx} className="relative group/shot w-[60px] h-[60px] border border-gray-200 rounded overflow-hidden bg-gray-50 flex-shrink-0">
                                          <img src={shot} alt={`Screenshot ${idx + 1}`} className="w-full h-full object-cover cursor-zoom-in hover:scale-105 transition-transform duration-200" onClick={() => setImageModal({ isOpen: true, url: shot })} />
                                          <button onClick={(e) => { e.stopPropagation(); removeScreenshot(paper.id, idx); }} className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 text-white rounded opacity-0 group-hover/shot:opacity-100 transition-opacity hover:bg-red-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                                      </div>
                                  ))}
                                  <label className="flex flex-col items-center justify-center w-[60px] h-[60px] cursor-pointer rounded border border-dashed border-gray-300 bg-gray-50 hover:bg-white hover:border-indigo-400 transition-all group/upload flex-shrink-0">
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-400 group-hover/upload:text-indigo-500"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleScreenshotUpload(paper.id, e.target.files[0])} />
                                  </label>
                              </div>
                          </td>
                          <td className="p-3 align-top text-center w-16">
                            <button onClick={() => deletePaper(paper.id)} className="text-gray-300 hover:text-red-600 transition-colors p-1 rounded"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-200 bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-xs text-gray-500">
                  第 {filteredPapers.length === 0 ? 0 : currentPage} / {filteredPapers.length === 0 ? 0 : totalPages} 页 · 共 {filteredPapers.length} 篇
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1 || filteredPapers.length === 0}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    首页
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1 || filteredPapers.length === 0}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>

                  {filteredPapers.length > 0 && visiblePageNumbers[0] > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(1)}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-600 bg-white hover:bg-gray-50"
                      >
                        1
                      </button>
                      {visiblePageNumbers[0] > 2 && <span className="px-1 text-xs text-gray-400">...</span>}
                    </>
                  )}

                  {filteredPapers.length > 0 && visiblePageNumbers.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        page === currentPage
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-gray-300 text-gray-600 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  ))}

                  {filteredPapers.length > 0 && visiblePageNumbers[visiblePageNumbers.length - 1] < totalPages && (
                    <>
                      {visiblePageNumbers[visiblePageNumbers.length - 1] < totalPages - 1 && <span className="px-1 text-xs text-gray-400">...</span>}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(totalPages)}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-600 bg-white hover:bg-gray-50"
                      >
                        {totalPages}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages || filteredPapers.length === 0}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一页
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages || filteredPapers.length === 0}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    末页
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <DetailModal isOpen={activeModal.isOpen} onClose={closeModal} title={activeModal.title} content={activeModal.content} type={activeModal.type} onSave={handleUpdateAnalysis} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} onSave={setSettings} />
      <PdfViewerModal isOpen={pdfViewer.isOpen} paper={pdfViewer.paper} onClose={() => setPdfViewer({ isOpen: false, paper: null })} onSave={handleSavePaperUpdates} />
      <ComparisonModal isOpen={comparisonModal.isOpen} isLoading={comparisonModal.isLoading} result={comparisonModal.result} onClose={() => setComparisonModal(prev => ({ ...prev, isOpen: false }))} />
      <ImageModal isOpen={imageModal.isOpen} onClose={() => setImageModal({ isOpen: false, url: null })} imageUrl={imageModal.url} />
    </div>
  );
};

export default App;
