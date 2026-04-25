import { NextResponse } from 'next/server';
import { loadNotes, saveNote, deleteNote, PropertyNote } from '@/lib/notes';

/** GET - load all notes */
export async function GET() {
  return NextResponse.json(loadNotes());
}

/** POST - save/update a note */
export async function POST(req: Request) {
  try {
    const note: PropertyNote = await req.json();
    if (!note.propertyId) {
      return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
    }
    note.updatedAt = new Date().toISOString();
    saveNote(note);
    return NextResponse.json({ saved: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** DELETE - remove a note */
export async function DELETE(req: Request) {
  try {
    const { propertyId } = await req.json();
    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
    }
    deleteNote(propertyId);
    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
