
export interface AnalysisResult {
  type: string;
  title: string;
  publication: string;
  problem: string;
  solution_idea: string;
  contribution: string;
  method: string;
  model_architecture: string;
  borrowable_ideas: string;
  critique: string;
  future_work: string;
  mind_map: string;
}

export interface ComparisonResult {
  papers: {
    title: string;
    method: string;
    framework: string;
    main_ideas: string;
  }[];
  summary: string; // Brief overall comparison summary
}

export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Highlight {
  id: string;
  page: number;
  rects: HighlightRect[];
  color: string; // hex code
  text?: string;
  comment?: string; // Added for notes/annotations
}

export interface PaperData {
  id: string;
  userId?: string; 
  file: File | Blob | string;
  fileName: string;
  fileSize: number;
  uploadTime: number;
  status: 'idle' | 'analyzing' | 'success' | 'error';
  // New field to track database persistence status
  saveStatus?: 'saving' | 'saved' | 'error';
  analysis: AnalysisResult | null;
  errorMessage?: string;
  tags: string[]; 
  screenshots: string[]; 
  highlights?: Highlight[]; 
}

export interface LLMSettings {
  useExternal: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxContextWindow: number;
  timeout: number;
}

export const DEFAULT_SETTINGS: LLMSettings = {
  useExternal: false,
  baseUrl: "https://max.openai365.top/v1",
  apiKey: "",
  model: "gemini-3-flash-preview",
  temperature: 0,
  maxContextWindow: 300000,
  timeout: 600
};

export enum AnalysisColumn {
  TAGS = 'Tags',
  FILE = 'File',
  TYPE = 'Type',
  TITLE = 'Title',
  PUBLICATION = 'Venue',
  PROBLEM = 'Problem',
  SOLUTION = 'Solution',
  CONTRIBUTION = 'Contribution',
  METHOD = 'Method',
  MODEL = 'Model Arch',
  IDEAS = 'Key Ideas',
  CRITIQUE = 'Critique',
  FUTURE_WORK = 'Future Work',
  MIND_MAP = 'Mind Map',
  SCREENSHOT = 'Screenshot'
}
