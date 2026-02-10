import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalysisResult, LLMSettings, ComparisonResult, PaperData } from "../types";

const processFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove Data URI prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

const analysisSchemaProperties = {
  type: { type: Type.STRING, description: "The type of the paper (e.g., Review, Methodology, Case Study)." },
  title: { type: Type.STRING, description: "The full title of the paper." },
  publication: { type: Type.STRING, description: "The publication venue, journal, or conference name." },
  problem: { type: Type.STRING, description: "Detailed analysis of the specific problem or gap (Markdown lists, min 500 chars)." },
  solution_idea: { type: Type.STRING, description: "Deep analysis of the core solution idea or hypothesis (Markdown lists, min 500 chars)." },
  contribution: { type: Type.STRING, description: "Comprehensive list of contributions and innovations (Markdown lists, min 500 chars)." },
  method: { type: Type.STRING, description: "Detailed explanation of methodology, algorithms, and experiments (Markdown lists, min 500 chars)." },
  model_architecture: { type: Type.STRING, description: "Detailed description of the model architecture or system diagram (Markdown lists, min 500 chars)." },
  borrowable_ideas: { type: Type.STRING, description: "Extensive list of concepts, techniques, or insights for future work (Markdown lists, min 500 chars)." },
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
    "borrowable_ideas"
  ],
};

// Updated to adopt the persona of a Computer Science Professor teaching a student.
const SYSTEM_PROMPT = `Role: You are a distinguished Computer Science Professor. I am your student.
Goal: Teach me the content of the attached research paper. Your objective is to ensure I fully understand the concepts, methodologies, and contributions.

Task: Analyze the attached PDF deeply and extract the following details.

For the fields: 'problem', 'solution_idea', 'contribution', 'method', 'model_architecture', and 'borrowable_ideas', strict adherence to the following is required:
1. **Teaching Persona**: Explain as if you are mentoring me. Don't just list facts; explain the *why* and *how*. Use clear, educational language.
2. **Deep Thinking**: Provide a thorough, in-depth analysis.
3. **Format**: Use **Markdown bullet points** for structure to make it readable.
4. **Length**: Each of these fields must be **at least 500 Chinese characters** long.
5. **Content**: Include specific details, theoretical grounding, and technical nuances.

**CRITICAL: All output values must be in Simplified Chinese (简体中文).**

Return the response in strict JSON format with the following keys:
- type
- title
- publication
- problem
- solution_idea
- contribution
- method
- model_architecture
- borrowable_ideas`;

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

export const analyzePaperWithGemini = async (file: File, settings?: LLMSettings): Promise<AnalysisResult> => {
  const base64Data = await processFileToBase64(file);

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
                url: `data:${file.type};base64,${base64Data}`, 
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
      return JSON.parse(cleanJson) as AnalysisResult;

    } catch (error) {
      clearTimeout(timeoutId);
      console.error("External Analysis Error:", error);
      throw error;
    }
  }

  // 2. Native Google Gemini Path (Default)
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: file.type,
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

    const json = JSON.parse(text) as AnalysisResult;
    return json;
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
    `).join('\n\n');

    const COMPARE_PROMPT = `Compare the following ${papers.length} research papers based on the provided details. 
    
    1. Provide a detailed comparative summary (at least 300 words) discussing the similarities and differences in their approaches.
    2. Fill out a comparison table for each paper focusing on: Method, Framework (Model Architecture), and Main Ideas.

    **CRITICAL: All output values must be in Simplified Chinese (简体中文).**
    
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

    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key not found.");
    const ai = new GoogleGenAI({ apiKey });

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: { parts: [{ text: COMPARE_PROMPT }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: comparisonSchema
            }
        });
        
        const text = response.text;
        if (!text) throw new Error("No response from Gemini");
        return JSON.parse(text) as ComparisonResult;
    } catch (error) {
        console.error("Comparison Error:", error);
        throw error;
    }
};