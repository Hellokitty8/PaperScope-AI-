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

export interface PaperData {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  uploadTime: number;
  status: 'idle' | 'analyzing' | 'success' | 'error';
  analysis: AnalysisResult | null;
  errorMessage?: string;
  tags: string[]; // Changed from group to tags array
  screenshots: string[]; // Changed from single screenshot to array
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
  SCREENSHOT = 'Screenshot'
}