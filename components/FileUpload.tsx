import React, { useState } from 'react';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelected, isProcessing }) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter(
        (file: File) => file.type === 'application/pdf'
      );
      onFilesSelected(files);
      // Reset input
      e.target.value = '';
    }
  };

  return (
    <div 
      className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-3"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Tooltip bubble */}
      <div className={`transition-all duration-300 transform origin-bottom-right ${isHovered ? 'scale-100 opacity-100' : 'scale-90 opacity-0'} mb-1`}>
        <div className="bg-gray-900 text-white px-3 py-1.5 rounded-lg shadow-xl font-medium text-xs whitespace-nowrap">
          Upload Paper (PDF)
        </div>
      </div>

      <label 
        htmlFor="file-upload" 
        className={`
          cursor-pointer w-14 h-14 rounded-full shadow-lg shadow-indigo-500/30
          flex items-center justify-center transition-all duration-300 transform hover:scale-105 active:scale-95
          bg-indigo-600 text-white hover:bg-indigo-700
          ${isProcessing ? 'opacity-70 grayscale cursor-not-allowed' : ''}
        `}
      >
        <input
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          id="file-upload"
          onChange={handleFileChange}
          disabled={isProcessing}
        />
        
        <svg 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24" 
            strokeWidth={2} 
            stroke="currentColor" 
            className="w-6 h-6"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </label>
    </div>
  );
};

export default FileUpload;