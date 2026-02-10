import { openDB, DBSchema } from 'idb';
import { PaperData } from '../types';

interface PaperScopeDB extends DBSchema {
  papers: {
    key: string;
    value: PaperData;
    indexes: { 'by-user': string };
  };
}

const DB_NAME = 'paperScopeDB';
const DB_VERSION = 1;

export const initDB = async () => {
  return openDB<PaperScopeDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('papers', { keyPath: 'id' });
      store.createIndex('by-user', 'userId');
    },
  });
};

export const savePaperToDB = async (paper: PaperData) => {
  try {
    const db = await initDB();
    await db.put('papers', paper);
  } catch (error) {
    console.error("Failed to save paper to DB:", error);
  }
};

export const getPapersFromDB = async (userId: string): Promise<PaperData[]> => {
  try {
    const db = await initDB();
    return db.getAllFromIndex('papers', 'by-user', userId);
  } catch (error) {
    console.error("Failed to fetch papers from DB:", error);
    return [];
  }
};

export const deletePaperFromDB = async (id: string) => {
  try {
    const db = await initDB();
    await db.delete('papers', id);
  } catch (error) {
    console.error("Failed to delete paper from DB:", error);
  }
};