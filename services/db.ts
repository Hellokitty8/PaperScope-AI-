
import { PaperData } from '../types';

/**
 * Bridge service for Server-side persistence
 */

export const savePaperToDB = async (paper: PaperData) => {
  try {
    // We need to ensure the file is in a serializable state (base64)
    // if it's a File object from upload
    let serializablePaper = { ...paper };
    
    // Convert File to Base64 if it's currently a File object
    // This handles the first upload case
    if (paper.file instanceof File) {
        serializablePaper.file = await fileToBase64(paper.file) as any;
    }

    // Add AbortController for timeout (e.g., 5 seconds)
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('/api/papers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serializablePaper),
      signal: controller.signal
    });
    clearTimeout(id);
    
    if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
    }
  } catch (error) {
    // Log but don't crash. UI works in-memory even if DB fails.
    console.warn("Failed to save paper to Server (Offline mode?):", error);
  }
};

export const getPapersFromDB = async (_userId: string): Promise<PaperData[]> => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch('/api/papers', { signal: controller.signal });
    clearTimeout(id);
    
    if (!response.ok) return [];
    const papers = await response.json();
    
    // Reconstruct File-like blobs from base64 if needed for PDF viewer
    return papers.map((p: any) => ({
        ...p,
        file: base64ToBlob(p.file, 'application/pdf')
    }));
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

// Config Persistence
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

// Helpers
const fileToBase64 = (file: File) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const base64ToBlob = (base64: string, type: string) => {
    if (!base64 || typeof base64 !== 'string') return base64;
    
    try {
        const parts = base64.split(';base64,');
        const contentType = parts.length > 1 ? parts[0].split(':')[1] : type;
        const raw = window.atob(parts.length > 1 ? parts[1] : base64);
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }
        return new Blob([uInt8Array], { type: contentType || type });
    } catch (e) {
        console.error("Failed to convert base64 to blob", e);
        return new Blob([], { type });
    }
};