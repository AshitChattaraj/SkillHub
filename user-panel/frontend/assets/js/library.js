// assets/js/library.js
// Admin-managed content libraries that aren't tied to a single course:
//   - library_videos  : general + GATE video library
//   - library_pdfs    : general + GATE PDF library (notes, formula sheets,
//                        PYQs, mock tests, book lists, roadmaps...)
// Both collections share a `section` field ("General" | "GATE") and, for
// PDFs, a `tag` field used to group them on the GATE page (PYQs, Mock
// Tests, Formula Sheets, Revision Notes, ...).

import { db } from "./firebase.js";
import {
  collection, doc, getDocs, addDoc, deleteDoc, query, orderBy, limit as fbLimit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const videosCol = collection(db, "library_videos");
const pdfsCol = collection(db, "library_pdfs");

// ------------------------------------------------------------------ Videos
export async function listVideos() {
  const snap = await getDocs(query(videosCol, orderBy("addedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addVideo(data) {
  await addDoc(videosCol, {
    title: data.title,
    url: data.url,
    description: data.description || "",
    section: data.section || "General", // "General" | "GATE"
    branch: data.branch || "",           // e.g. "CSE" for GATE branch-wise
    thumbnailUrl: data.thumbnailUrl || "",
    addedAt: serverTimestamp(),
  });
}

export async function deleteVideo(id) {
  await deleteDoc(doc(db, "library_videos", id));
}

// -------------------------------------------------------------------- PDFs
export async function listPdfs() {
  const snap = await getDocs(query(pdfsCol, orderBy("addedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addPdf(data) {
  await addDoc(pdfsCol, {
    title: data.title,
    fileUrl: data.fileUrl,
    description: data.description || "",
    section: data.section || "General", // "General" | "GATE"
    tag: data.tag || "Notes",           // PYQs | Mock Tests | Formula Sheet | Revision Notes | Book List | Roadmap | Notes
    sizeLabel: data.sizeLabel || "",
    addedAt: serverTimestamp(),
  });
}

export async function deletePdf(id) {
  await deleteDoc(doc(db, "library_pdfs", id));
}

// One-time seed: if the PDF library is empty, populate it with the real
// files that already ship in /pdfs so the GATE resource cards aren't
// blank on a fresh install. Safe to call every admin page load — it
// checks first and does nothing if anything already exists.
export async function ensureSeedPdfLibrary() {
  const existing = await getDocs(query(pdfsCol, fbLimit(1)));
  if (!existing.empty) return;

  const seed = [
    { title: "GATE 2027 Engineering Mathematics Formula Sheet", fileUrl: "pdfs/GATE2027_Engineering_Mathematics_Formula_Sheet.pdf", tag: "Formula Sheet", sizeLabel: "482 KB", description: "A compact, exam-ready reference covering every core Engineering Mathematics formula tested across GATE branches." },
    { title: "GATE CSE Roadmap", fileUrl: "pdfs/GATE_CSE_Roadmap.pdf", tag: "Roadmap", sizeLabel: "3 KB", description: "A concise strategic roadmap for GATE Computer Science aspirants." },
    { title: "GATE CS Formula Series (Final)", fileUrl: "pdfs/GATE_CS_Formula_Series_Final.pdf", tag: "Formula Sheet", sizeLabel: "987 KB", description: "The complete Computer Science formula series for last-minute revision." },
    { title: "GatePlus — GATE 2027 Recommended Books", fileUrl: "pdfs/GatePlus_GATE2027_Books.pdf", tag: "Book List", sizeLabel: "2.4 MB", description: "A curated directory of the best reference books for GATE 2027 preparation." },
    { title: "Ultimate General Aptitude Quick Revision Sheet", fileUrl: "pdfs/Ultimate General Aptitude Quick Revision Sheet.pdf", tag: "Revision Notes", sizeLabel: "1.0 MB", description: "A fast, high-yield revision sheet covering Verbal, Numerical and General Aptitude." },
    { title: "Ultimate PYQs Directory (2007–2026)", fileUrl: "pdfs/Ultimate PYQS DIRECTORY (2007-2026).pdf", tag: "PYQs", sizeLabel: "976 KB", description: "A comprehensive archive of Previous Year Questions spanning 2007 to 2026." },
  ];
  for (const item of seed) {
    await addPdf({ ...item, section: "GATE" });
  }
}
