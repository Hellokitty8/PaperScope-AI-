
import { PaperData } from '../types';

/**
 * Bridge service for Server-side persistence
 */

export const checkBackendHealth = async (): Promise<boolean> => {
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 2000); // 2s timeout
        const res = await fetch('/api/health', { signal: controller.signal });
        clearTimeout(id);
        return res.ok;
    } catch (e) {
        console.error("Backend health check failed:", e);
        return false;
    }
};

export const savePaperToDB = async (paper: PaperData) => {
  try {
    const serializablePaper: any = { ...paper };
    
    // Logic to handle file payload
    if (paper.file instanceof Blob) {
        // New file upload: Convert to base64
        serializablePaper.file = await blobToBase64(paper.file);
    } else if (typeof paper.file === 'string') {
        // Existing URL: Don't re-upload content to save bandwidth
        // Server knows not to delete the file if this is missing/string
        delete serializablePaper.file; 
    }

    // Increased timeout for large files (120 seconds)
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 120000); 

    const response = await fetch('/api/papers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serializablePaper),
      signal: controller.signal
    });
    clearTimeout(id);
    
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server error ${response.status}: ${text}`);
    }
    
    return true;
  } catch (error) {
    console.error("FATAL: Failed to save paper to Server:", error);
    throw error; // Propagate error so UI can show it
  }
};

export const getPapersFromDB = async (_userId: string): Promise<PaperData[]> => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000); 
    
    const response = await fetch('/api/papers', { signal: controller.signal });
    clearTimeout(id);
    
    if (!response.ok) return [];
    const papers = await response.json();
    return papers;
  } catch (error) {
    console.warn("Failed to fetch papers from Server:", error);
    return [];
  }
};

export const deletePaperFromDB = async (id: string) => {
  try {
    await fetch(`/api/papers/${id}`, { method: 'DELETE' });
  } catch (error) {
    console.error("Failed to delete paper from Server:", error);
  }
};

export const getBannerFromServer = async (): Promise<string> => {
    try {
        const res = await fetch('/api/config/banner');
        if (!res.ok) return '/banner.jpg';
        const data = await res.json();
        return data.banner || '/banner.jpg';
    } catch {
        return '/banner.jpg';
    }
};

export const saveBannerToServer = async (banner: string) => {
    try {
        await fetch('/api/config/banner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ banner })
        });
    } catch (e) {
        console.warn("Failed to save banner", e);
    }
};

const blobToBase64 = (blob: Blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});
