import React, { useEffect, useRef, useState } from 'react';
import { LLMSettings, DEFAULT_SETTINGS } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: LLMSettings;
  onSave: (settings: LLMSettings) => void;
}

const GOOGLE_MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash Preview (Fast & Efficient)' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro Preview (Complex Reasoning)' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Stable)' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [formData, setFormData] = useState<LLMSettings>(settings);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
        setFormData(settings);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' 
        ? (e.target as HTMLInputElement).checked 
        : type === 'number' ? Number(value) : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50">
          <h3 className="text-lg font-bold text-gray-800">Model Configuration</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg border border-indigo-100">
            <label className="text-sm font-medium text-indigo-900">Enable External Model (OpenAI API)</label>
            <div className="relative inline-block w-12 h-6 align-middle select-none">
              <input 
                type="checkbox" 
                name="useExternal" 
                checked={formData.useExternal} 
                onChange={handleChange}
                className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer border-gray-300 checked:right-0 checked:border-indigo-600 transition-all duration-300"
                style={{ right: formData.useExternal ? '0' : '50%' }}
              />
              <label className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${formData.useExternal ? 'bg-indigo-600' : 'bg-gray-300'}`}></label>
            </div>
          </div>

          <div className="space-y-4 transition-all duration-300">
             {formData.useExternal ? (
               <>
                 <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Base URL</label>
                  <input
                    type="text"
                    name="baseUrl"
                    value={formData.baseUrl}
                    onChange={handleChange}
                    placeholder="https://api.openai.com/v1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">API Key</label>
                  <input
                    type="password"
                    name="apiKey"
                    value={formData.apiKey}
                    onChange={handleChange}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Model Name</label>
                  <input
                    type="text"
                    name="model"
                    value={formData.model}
                    onChange={handleChange}
                    placeholder="gpt-4o"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                  />
                </div>
               </>
             ) : (
                /* Internal Google Model Selection */
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Select Gemini Model</label>
                  <div className="relative">
                    <select
                      name="model"
                      value={formData.model}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm appearance-none bg-white"
                    >
                      {GOOGLE_MODELS.map(model => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    API Key is managed via environment variables on the server.
                  </p>
                </div>
             )}

            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Temperature</label>
                <input
                  type="number"
                  name="temperature"
                  step="0.1"
                  min="0"
                  max="2"
                  value={formData.temperature}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Timeout (s)</label>
                <input
                  type="number"
                  name="timeout"
                  value={formData.timeout}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                />
              </div>
            </div>
             <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Max Context Window</label>
                <input
                  type="number"
                  name="maxContextWindow"
                  value={formData.maxContextWindow}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                />
              </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
             <button
              type="button"
              onClick={() => { setFormData(DEFAULT_SETTINGS); }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Reset Defaults
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm transition-colors"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsModal;