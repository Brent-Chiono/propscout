import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');

export interface PropertyNote {
  propertyId: string;
  note: string;
  favorite: boolean;
  skip: boolean;
  updatedAt: string;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadNotes(): Record<string, PropertyNote> {
  try {
    ensureDir();
    if (!fs.existsSync(NOTES_FILE)) return {};
    return JSON.parse(fs.readFileSync(NOTES_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveNote(note: PropertyNote): void {
  try {
    ensureDir();
    const all = loadNotes();
    all[note.propertyId] = note;
    fs.writeFileSync(NOTES_FILE, JSON.stringify(all, null, 2), 'utf-8');
  } catch (err) {
    console.error('[notes] Failed to save:', err);
  }
}

export function deleteNote(propertyId: string): void {
  try {
    const all = loadNotes();
    delete all[propertyId];
    fs.writeFileSync(NOTES_FILE, JSON.stringify(all, null, 2), 'utf-8');
  } catch (err) {
    console.error('[notes] Failed to delete:', err);
  }
}
