import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalysisResult, LLMSettings, ComparisonResult, PaperData } from "../types";

const blobBase64Cache = new WeakMap<Blob, Promise<string>>();

// Helper: Convert File/Blob OR URL string to Base64 (pure data, no prefix)
const processFileToBase64 = async (file: File | Blob | string): Promise<string> => {
  let blob: Blob;

  if (typeof file === 'string') {
      // It's a URL (e.g. /api/files/...). Fetch it first.
      try {
          const res = await fetch(file);
          if (!res.ok) throw new Error("Failed to fetch PDF from server for analysis");
          blob = await res.blob();
      } catch (e) {
          throw new Error("Could not download file for analysis: " + e);
      }
  } else {
      blob = file;
  }

  const cached = blobBase64Cache.get(blob);
  if (cached) return cached;

  const conversionPromise = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove Data URI prefix if present (e.g., "data:application/pdf;base64,")
      if (result.includes(',')) {
          resolve(result.split(',')[1]);
      } else {
          resolve(result);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(blob);
  });

  blobBase64Cache.set(blob, conversionPromise);
  return conversionPromise;
};

const analysisSchemaProperties = {
  type: { type: Type.STRING, description: "论文的研究领域 (例如: CV, NLP, RL, Survey)" },
  title: { type: Type.STRING, description: "论文标题" },
  publication: { type: Type.STRING, description: "发表会议或期刊 (例如: NeurIPS 2024)" },
  problem: { type: Type.STRING, description: "论文想要解决的核心问题及痛点 (通俗易懂, Markdown)" },
  solution_idea: { type: Type.STRING, description: "核心解决思路和直觉 (通俗易懂, Markdown)" },
  contribution: { type: Type.STRING, description: "主要创新点和贡献 (Markdown 列表)" },
  method: { type: Type.STRING, description: "具体方法和技术路径 (通俗易懂, Markdown)" },
  model_architecture: { type: Type.STRING, description: "模型架构图或系统流程的文字描述 (Markdown)" },
  borrowable_ideas: { type: Type.STRING, description: "可借鉴的Idea或Trick (Markdown)" },
  critique: { type: Type.STRING, description: "批判性评估：方法优缺点及局限性 (Markdown)" },
  future_work: { type: Type.STRING, description: "未来研究方向：至少三个有价值的研究问题 (Markdown)" },
  mind_map: { type: Type.STRING, description: "论文核心内容思维导图 (Markdown 层级列表)" },
};

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: analysisSchemaProperties,
  required: [
    "type",
    "title",
    "publication",
    "problem",
    "solution_idea",
    "contribution",
    "method",
    "model_architecture",
    "borrowable_ideas",
    "critique",
    "future_work",
    "mind_map"
  ],
};

// Updated to adopt the persona of a Senior AI Researcher/NeurIPS Reviewer.
const SYSTEM_PROMPT = `Role: 你是一位资深的人工智能研究员，也是 NeurIPS 的审稿人。我是一名刚入门的学生，正在阅读这篇论文。
Goal: 请你像导师一样，帮我深入浅出地理解这篇论文。提取关键信息，并用**通俗易懂**的语言（适合初学者）进行解释。

Task: 深度分析附件中的 PDF 论文，并提取以下信息：

1. **type**: 论文的类型或领域（例如：大语言模型、目标检测、强化学习等）。
2. **title**: 论文的标题。
3. **publication**: 发表的刊物或会议（例如：NeurIPS 2024, CVPR, arXiv）。
4. **problem**: **想要解决的问题**。这篇论文试图解决什么核心痛点？为什么这个问题很重要？现有方法有什么不足？
5. **solution_idea**: **解决问题的思路**。作者的核心洞察（Insight）是什么？用直觉性的语言解释他们的解决方案，不要一上来就堆砌公式。
6. **contribution**: **贡献**。列出论文的主要创新点和贡献。
7. **method**: **方法**。他们具体是怎么做的？一步步解释技术路径。
8. **model_architecture**: **模型图**。请用文字生动地描述模型的架构图，或者系统流程图，就像你在给我看图讲课一样。
9. **borrowable_ideas**: **可借鉴的思路**。这篇论文里有哪些巧妙的 Trick、模块设计或者思想，是我在未来的研究中可以参考或借用的？
10. **critique**: **批判性评估**。请批判性地评估这篇论文的研究方法。你认为论文的方法有哪些优点？有哪些潜在的不足或局限性？是否有其他更合适的方法可以用来研究这个问题？
11. **future_work**: **未来研究方向**。根据这篇论文的研究内容，你认为未来有哪些值得进一步研究的方向？请提出 **至少三个** 有价值的后续研究问题。
12. **mind_map**: **思维导图**。请以 **Markdown 层级列表** 的形式，总结这篇论文的核心内容，必须包含：研究问题、方法、结果、结论和贡献等关键要素。结构清晰，便于我构建脑图。

**要求**:
- 输出必须是严格的 **JSON**格式。
- JSON 的 Key 必须严格使用小写英文：type, title, publication, problem, solution_idea, contribution, method, model_architecture, borrowable_ideas, critique, future_work, mind_map。
- 所有内容必须使用 **简体中文 (Simplified Chinese)**。
- 对于较长的解释（如问题、思路、方法、评估），请使用 **Markdown 列表** 来优化排版。
- 确保内容详实，不要太简略。`;

// Comparison Schema
const comparisonSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: "A detailed comparative summary of the papers (at least 300 words)." },
    papers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          method: { type: Type.STRING },
          framework: { type: Type.STRING },
          main_ideas: { type: Type.STRING },
        },
        required: ["title", "method", "framework", "main_ideas"]
      }
    }
  },
  required: ["summary", "papers"]
};

// Helper to normalize URL
const normalizeUrl = (url: string): string => {
  let normalized = url;
  if (!normalized.endsWith('/chat/completions') && !normalized.endsWith('/')) {
      normalized += '/chat/completions';
  } else if (normalized.endsWith('/')) {
      normalized += 'chat/completions';
  }
  return normalized;
}

// Recursive function to find the data object in a potentially nested JSON response
const findRelevantObject = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return null;

    // Check if this object looks like the result (has at least title or problem)
    // We check for both English and Chinese variations
    const keys = Object.keys(obj).map(k => k.toLowerCase());
    if ((keys.includes('title') || keys.includes('标题')) && 
        (keys.includes('problem') || keys.includes('问题') || keys.includes('description') || keys.includes('abstract'))) {
        return obj;
    }

    // If array, iterate elements
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const found = findRelevantObject(item);
            if (found) return found;
        }
        return null;
    }

    // If object, iterate values
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const found = findRelevantObject(obj[key]);
            if (found) return found;
        }
    }
    
    return null;
};

// Helper to normalize Keys
const normalizeKeys = (obj: any): AnalysisResult => {
    // 1. Find the relevant object deeply nested
    let sourceObj = findRelevantObject(obj);
    
    // If we couldn't find a relevant object, assume the root might be it (or partially filled)
    if (!sourceObj) {
        sourceObj = obj;
    }

    const newObj: any = {};
    const keyMap: Record<string, string> = {
        'type': 'type', '类型': 'type', '领域': 'type',
        'title': 'title', '标题': 'title', '题目': 'title',
        'publication': 'publication', 'venue': 'publication', 'journal': 'publication', '发表': 'publication', '会议': 'publication', '刊物': 'publication',
        'problem': 'problem', '痛点': 'problem', '问题': 'problem',
        'solution': 'solution_idea', 'solution_idea': 'solution_idea', 'idea': 'solution_idea', '思路': 'solution_idea', '解决': 'solution_idea',
        'contribution': 'contribution', '贡献': 'contribution', '创新': 'contribution',
        'method': 'method', '方法': 'method', '技术': 'method',
        'model': 'model_architecture', 'model_architecture': 'model_architecture', 'architecture': 'model_architecture', '模型': 'model_architecture', '架构': 'model_architecture',
        'borrowable': 'borrowable_ideas', 'borrowable_ideas': 'borrowable_ideas', 'ideas': 'borrowable_ideas', 'key_ideas': 'borrowable_ideas', '借鉴': 'borrowable_ideas', '启发': 'borrowable_ideas',
        'critique': 'critique', 'evaluation': 'critique', '评估': 'critique', '批判': 'critique', '局限': 'critique', '不足': 'critique',
        'future_work': 'future_work', 'future': 'future_work', '未来': 'future_work', '方向': 'future_work', 'questions': 'future_work',
        'mind_map': 'mind_map', 'mindmap': 'mind_map', 'map': 'mind_map', '思维导图': 'mind_map', '脑图': 'mind_map', '结构': 'mind_map'
    };

    Object.keys(sourceObj).forEach(key => {
        const lower = key.toLowerCase().trim();
        // Check exact match in map
        let targetKey = keyMap[lower];
        
        // If no exact match, try partial match
        if (!targetKey) {
            if (lower.includes('architect') || lower.includes('模型') || lower.includes('架构')) targetKey = 'model_architecture';
            else if (lower.includes('solution') || lower.includes('思路')) targetKey = 'solution_idea';
            else if (lower.includes('borrow') || lower.includes('idea') || lower.includes('借鉴')) targetKey = 'borrowable_ideas';
            else if (lower.includes('contrib') || lower.includes('贡献')) targetKey = 'contribution';
            else if (lower.includes('problem') || lower.includes('问题')) targetKey = 'problem';
            else if (lower.includes('method') || lower.includes('方法')) targetKey = 'method';
            else if (lower.includes('publ') || lower.includes('venue') || lower.includes('发表')) targetKey = 'publication';
            else if (lower.includes('title') || lower.includes('标题')) targetKey = 'title';
            else if (lower.includes('type') || lower.includes('类型')) targetKey = 'type';
            else if (lower.includes('eval') || lower.includes('critique') || lower.includes('评估') || lower.includes('批判')) targetKey = 'critique';
            else if (lower.includes('future') || lower.includes('未来') || lower.includes('方向')) targetKey = 'future_work';
            else if (lower.includes('mind') || lower.includes('map') || lower.includes('导图')) targetKey = 'mind_map';
        }

        if (targetKey) {
            newObj[targetKey] = sourceObj[key];
        } else {
            newObj[key] = sourceObj[key];
        }
    });

    return newObj as AnalysisResult;
};

let cachedApiKey: string | undefined;
let apiKeyFetchPromise: Promise<string | undefined> | null = null;

// Helper to get API Key (Env or Backend)
const getApiKey = async (): Promise<string | undefined> => {
    if (cachedApiKey) return cachedApiKey;
    if (apiKeyFetchPromise) return apiKeyFetchPromise;

    // 1. Check local env (Vite build time injection if configured, usually empty in docker)
    if (process.env.API_KEY) {
        cachedApiKey = process.env.API_KEY;
        return cachedApiKey;
    }

    apiKeyFetchPromise = (async () => {
        // 2. Fetch from backend (Runtime injection from Cloud Run)
        try {
            const res = await fetch('/api/config/env');
            if (res.ok) {
                const data = await res.json();
                cachedApiKey = data.apiKey || undefined;
                return cachedApiKey;
            }
        } catch (e) {
            console.warn("Could not fetch API key from backend");
        } finally {
            apiKeyFetchPromise = null;
        }
        return undefined;
    })();

    return apiKeyFetchPromise;
};

export const analyzePaperWithGemini = async (file: File | Blob | string, settings?: LLMSettings): Promise<AnalysisResult> => {
  const base64Data = await processFileToBase64(file);
  const mimeType = 'application/pdf'; // We assume PDF for now based on app constraint

  // 1. External Model Path (OpenAI Compatible)
  if (settings?.useExternal) {
    if (!settings.apiKey) {
      throw new Error("External API Key is missing in settings.");
    }

    const payload = {
      model: settings.model,
      temperature: settings.temperature,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: SYSTEM_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`, 
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" }
    };

    const url = normalizeUrl(settings.baseUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), settings.timeout * 1000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`External API Error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) throw new Error("Empty response from external model");
      
      const cleanJson = content.replace(/```json\n?|\n?```/g, "").trim();
      const result = normalizeKeys(JSON.parse(cleanJson));
      if (!result.title && !result.problem) {
          throw new Error("Parsed JSON is empty or missing key fields.");
      }
      return result;

    } catch (error) {
      clearTimeout(timeoutId);
      console.error("External Analysis Error:", error);
      throw error;
    }
  }

  // 2. Native Google Gemini Path (Default)
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("API Key not found. Please ensure API_KEY is set in Cloud Run Variables.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = settings?.model || "gemini-3-flash-preview";

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: SYSTEM_PROMPT,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response text from Gemini.");
    }

    // Robust JSON extraction
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
         console.error("Invalid Response Text:", text);
         throw new Error("Invalid response format: No JSON object found in response.");
    }

    const cleanText = text.substring(firstBrace, lastBrace + 1);
    
    let json;
    try {
        json = JSON.parse(cleanText);
    } catch (e) {
        console.error("JSON Parse Error on text:", cleanText);
        throw new Error("Failed to parse Gemini response as JSON. Check console for raw output.");
    }
    
    const result = normalizeKeys(json);

    // Final Validation: If we don't have at least a title, something went wrong with parsing or generation
    if (!result.title) {
        console.warn("Missing title in result:", result);
        // We throw an error to force the UI to show 'Error' instead of empty columns
        throw new Error("Analysis completed but returned incomplete data (Missing Title).");
    }

    return result;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

export const comparePapersWithGemini = async (papers: PaperData[], settings?: LLMSettings): Promise<ComparisonResult> => {
    // Construct a text-based input from the existing analysis
    const papersInput = papers.map((p, index) => `
    Paper ${index + 1}:
    Title: ${p.analysis?.title || p.fileName}
    Method: ${p.analysis?.method || 'N/A'}
    Model Architecture: ${p.analysis?.model_architecture || 'N/A'}
    Solution Idea: ${p.analysis?.solution_idea || 'N/A'}
    Key Ideas: ${p.analysis?.borrowable_ideas || 'N/A'}
    Critique: ${p.analysis?.critique || 'N/A'}
    Future Work: ${p.analysis?.future_work || 'N/A'}
    `).join('\n\n');

    const COMPARE_PROMPT = `请对比以下 ${papers.length} 篇论文。
    
    1. 提供一份详细的对比总结（至少 300 字），讨论它们在方法、思路和结果上的异同。
    2. 填写一个对比表格，包含：论文标题、方法、框架（模型架构）和主要思路。

    **关键：所有输出必须使用简体中文。**
    
    Data:
    ${papersInput}

    Return strict JSON matching the schema:
    {
        "summary": "string",
        "papers": [
            { "title": "string", "method": "string", "framework": "string", "main_ideas": "string" }
        ]
    }`;

    if (settings?.useExternal) {
        if (!settings.apiKey) throw new Error("External API Key is missing.");
        
        const payload = {
            model: settings.model,
            temperature: settings.temperature,
            messages: [{ role: "user", content: COMPARE_PROMPT }],
            response_format: { type: "json_object" }
        };

        const url = normalizeUrl(settings.baseUrl);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), settings.timeout * 1000);

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${settings.apiKey}`
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`External API Error (${response.status}): ${errText}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (!content) throw new Error("Empty response");
            const cleanJson = content.replace(/```json\n?|\n?```/g, "").trim();
            return JSON.parse(cleanJson) as ComparisonResult;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    const apiKey = await getApiKey();
    if (!apiKey) throw new Error("API Key not found.");
    const ai = new GoogleGenAI({ apiKey });
    const modelName = settings?.model || "gemini-3-flash-preview";

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [{ text: COMPARE_PROMPT }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: comparisonSchema
            }
        });
        
        const text = response.text;
        if (!text) throw new Error("No response from Gemini");
        
        // Clean Markdown code blocks if present
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        const cleanText = (firstBrace !== -1 && lastBrace !== -1) ? text.substring(firstBrace, lastBrace + 1) : text;

        return JSON.parse(cleanText) as ComparisonResult;
    } catch (error) {
        console.error("Comparison Error:", error);
        throw error;
    }
};
