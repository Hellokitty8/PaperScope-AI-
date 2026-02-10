import React, { useCallback } from 'react';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelected, isProcessing }) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (isProcessing) return;

      const files = Array.from(e.dataTransfer.files).filter(
        (file: File) => file.type === 'application/pdf'
      );
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected, isProcessing]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter(
        (file: File) => file.type === 'application/pdf'
      );
      onFilesSelected(files);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
        isProcessing
          ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
          : 'border-indigo-300 bg-white hover:border-indigo-500 hover:bg-indigo-50 cursor-pointer shadow-sm'
      }`}
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
      <label htmlFor="file-upload" className="cursor-pointer block w-full h-full">
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="p-3 bg-indigo-100 rounded-full text-indigo-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-8 h-8"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </div>
          <div className="text-gray-600">
            <span className="font-medium text-indigo-600">Click to upload</span> or drag
            and drop PDF papers
          </div>
          <p className="text-xs text-gray-400">PDF files up to 10MB supported</p>
        </div>
      </label>
    </div>
  );
};

export default FileUpload;