import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AnalysisColumn } from '../types';

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  type: AnalysisColumn | null;
  onSave: (newContent: string) => void;
}

const DetailModal: React.FC<DetailModalProps> = ({
  isOpen,
  onClose,
  title,
  content,
  type,
  onSave,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);

  useEffect(() => {
    setEditedContent(content);
    setIsEditing(false);
  }, [content, isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
          if (isEditing) {
              setIsEditing(false);
              setEditedContent(content); // Reset on escape if editing
          } else {
              onClose();
          }
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, isEditing, content]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const handleSave = () => {
      onSave(editedContent);
      setIsEditing(false);
      onClose();
  };

  // Determine icon based on column type
  const getIcon = () => {
    switch (type) {
      case AnalysisColumn.PROBLEM: return '❓';
      case AnalysisColumn.SOLUTION: return '💡';
      case AnalysisColumn.MODEL: return '🏗️';
      case AnalysisColumn.CONTRIBUTION: return '🎁';
      case AnalysisColumn.IDEAS: return '✨';
      default: return '📄';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 transition-opacity duration-300"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
             <span className="text-2xl">{getIcon()}</span>
             <h3 className="text-xl font-bold text-gray-800">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
                <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                    Edit
                </button>
            )}
            <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
          </div>
        </div>
        
        <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
            {isEditing ? (
                <textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="w-full h-full min-h-[400px] p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none text-base leading-relaxed text-gray-700 font-sans"
                    placeholder="Enter details..."
                />
            ) : (
                <div className="prose prose-indigo max-w-none">
                    <ReactMarkdown>{content}</ReactMarkdown>
                </div>
            )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
            <button 
                onClick={onClose}
                className="px-5 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 shadow-sm transition-all"
            >
                {isEditing ? 'Cancel' : 'Close'}
            </button>
            {isEditing && (
                <button 
                    onClick={handleSave}
                    className="px-5 py-2 bg-indigo-600 border border-transparent text-white font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-all"
                >
                    Save Changes
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default DetailModal;