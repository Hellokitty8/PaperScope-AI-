import React, { useEffect, useRef } from 'react';
import { ComparisonResult } from '../types';

interface ComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: ComparisonResult | null;
  isLoading: boolean;
}

const ComparisonModal: React.FC<ComparisonModalProps> = ({ isOpen, onClose, result, isLoading }) => {
  const modalRef = useRef<HTMLDivElement>(null);

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

  const generateMarkdown = (data: ComparisonResult): string => {
    let md = `# Paper Comparison Report\n\n`;
    md += `Generated on: ${new Date().toLocaleString()}\n\n`;
    
    md += `## 📝 Comparative Summary\n\n`;
    md += `${data.summary}\n\n`;
    
    md += `## 📊 Detailed Comparison Table\n\n`;
    md += `| Paper Title | Method | Framework | Main Ideas |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    
    data.papers.forEach(p => {
      const clean = (text: string) => (text || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      md += `| ${clean(p.title)} | ${clean(p.method)} | ${clean(p.framework)} | ${clean(p.main_ideas)} |\n`;
    });
    
    return md;
  };

  const handleDownload = () => {
    if (!result) return;
    const mdContent = generateMarkdown(result);
    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paper-comparison-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div 
        ref={modalRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                </svg>
             </div>
             <h3 className="text-xl font-bold text-gray-900">Paper Comparison</h3>
          </div>
          <div className="flex items-center gap-3">
            {result && !isLoading && (
                <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download .md
                </button>
            )}
            <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-full transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-gray-50/50">
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="text-lg text-gray-600 font-medium">Generating comparison matrix...</p>
                </div>
            ) : result ? (
                <div className="space-y-8">
                    {/* Summary Section */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                             <span className="text-2xl">📝</span> Comparative Summary
                        </h4>
                        <div className="prose prose-indigo max-w-none text-gray-700 leading-relaxed whitespace-pre-line">
                            {result.summary}
                        </div>
                    </div>

                    {/* Table Section */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                         <div className="p-4 bg-gray-50 border-b border-gray-200">
                             <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <span className="text-2xl">📊</span> Detailed Comparison
                             </h4>
                         </div>
                         <div className="overflow-x-auto">
                             <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 w-1/4">Paper Title</th>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 w-1/4">Method</th>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 w-1/4">Framework</th>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 w-1/4">Main Ideas</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {result.papers.map((p, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="p-4 align-top font-medium text-gray-900">{p.title}</td>
                                            <td className="p-4 align-top text-gray-700">{p.method}</td>
                                            <td className="p-4 align-top text-gray-700">{p.framework}</td>
                                            <td className="p-4 align-top text-gray-700">{p.main_ideas}</td>
                                        </tr>
                                    ))}
                                </tbody>
                             </table>
                         </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <p>No comparison data available.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ComparisonModal;