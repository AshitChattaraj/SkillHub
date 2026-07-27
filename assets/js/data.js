// assets/js/data.js
// Everything that makes the dashboard "real" instead of hardcoded numbers:
// per-material completion tracking, an activity log (downloads/videos
// watched/AI questions/resume checks), certificates, bookmarks, course
// ratings, and saved AI chat history. All scoped under the signed-in
// user's uid so Firestore rules can restrict access to "yours only".

import { db, auth } from "./firebase.js";
import {
  collection, collectionGroup, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc,
  query, where, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function uid() {
  return auth.currentUser?.uid;
}

// ------------------------------------------------------------- Activity log
// One flat collection, filtered by uid/type. Small-scale friendly, and
// lets the admin Data Records screen query across all students too.
export async function logActivity(type, refTitle = "", meta = {}) {
  const u = uid();
  if (!u) return;
  await addDoc(collection(db, "activity"), {
    uid: u,
    type, // "download_pdf" | "watch_video" | "material_complete" | "ai_chat" | "resume_check"
    refTitle,
    meta,
    at: serverTimestamp(),
  });
}

export async function listMyActivity(type = null) {
  const u = uid();
  if (!u) return [];
  const constraints = type
    ? [where("uid", "==", u), where("type", "==", type), orderBy("at", "desc")]
    : [where("uid", "==", u), orderBy("at", "desc")];
  const snap = await getDocs(query(collection(db, "activity"), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------- Progress
// One doc per (user, material): users/{uid}/progress/{materialId}
export async function markMaterialComplete(courseId, folderId, materialId, materialTitle) {
  const u = uid();
  if (!u) return;
  await setDoc(doc(db, "users", u, "progress", materialId), {
    courseId, folderId, materialId, completedAt: serverTimestamp(),
  });
  await logActivity("material_complete", materialTitle, { courseId });
}

export async function unmarkMaterialComplete(materialId) {
  const u = uid();
  if (!u) return;
  await deleteDoc(doc(db, "users", u, "progress", materialId));
}

export async function getMyProgressMap() {
  const u = uid();
  if (!u) return {};
  const snap = await getDocs(collection(db, "users", u, "progress"));
  const map = {};
  snap.docs.forEach((d) => { map[d.id] = d.data(); });
  return map;
}

// Computes { percent, completedCount, totalCount } for one course, given
// the full folder->material tree (fetched via courses.js) and the
// current user's progress map.
export function computeCourseCompletion(materialsFlatList, progressMap) {
  if (!materialsFlatList.length) return { percent: 0, completedCount: 0, totalCount: 0 };
  const completedCount = materialsFlatList.filter((m) => progressMap[m.id]).length;
  const totalCount = materialsFlatList.length;
  return { percent: Math.round((completedCount / totalCount) * 100), completedCount, totalCount };
}

// ------------------------------------------------------------- Bookmarks
export async function toggleBookmark(courseId, courseTitle) {
  const u = uid();
  if (!u) return;
  const ref = doc(db, "users", u, "bookmarks", courseId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, { courseId, courseTitle, addedAt: serverTimestamp() });
  return true;
}

export async function listMyBookmarks() {
  const u = uid();
  if (!u) return [];
  const snap = await getDocs(query(collection(db, "users", u, "bookmarks"), orderBy("addedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ------------------------------------------------------------ Certificates
export async function issueCertificateIfEarned(courseId, courseTitle, percent) {
  const u = uid();
  if (!u || percent < 100) return false;
  const certId = `${u}_${courseId}`;
  const ref = doc(db, "certificates", certId);
  const existing = await getDoc(ref);
  if (existing.exists()) return true; // already issued
  await setDoc(ref, {
    uid: u, courseId, courseTitle, issuedAt: serverTimestamp(),
  });
  return true;
}

export async function listMyCertificates() {
  const u = uid();
  if (!u) return [];
  const snap = await getDocs(query(collection(db, "certificates"), where("uid", "==", u)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ----------------------------------------------------------------- Ratings
export async function rateCourse(courseId, rating) {
  const u = uid();
  if (!u) return;
  await setDoc(doc(db, "courses", courseId, "ratings", u), {
    rating, at: serverTimestamp(),
  });
}

export async function getCourseRating(courseId) {
  const snap = await getDocs(collection(db, "courses", courseId, "ratings"));
  if (snap.empty) return { average: 0, count: 0 };
  let sum = 0;
  snap.docs.forEach((d) => { sum += Number(d.data().rating) || 0; });
  return { average: Math.round((sum / snap.docs.length) * 10) / 10, count: snap.docs.length };
}

// --------------------------------------------------------------- AI Chats
export async function saveAiChatTurn(question, answer) {
  const u = uid();
  if (!u) return;
  await addDoc(collection(db, "users", u, "aiChats"), {
    question, answer, at: serverTimestamp(),
  });
  await logActivity("ai_chat", question.slice(0, 80));
}

export async function listMyAiChats() {
  const u = uid();
  if (!u) return [];
  const snap = await getDocs(query(collection(db, "users", u, "aiChats"), orderBy("at", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ----------------------------------------------------------- Resume checks
export async function saveResumeCheck(score, summary, raw) {
  const u = uid();
  if (!u) return;
  await addDoc(collection(db, "users", u, "resumeChecks"), {
    score, summary, raw, at: serverTimestamp(),
  });
  await logActivity("resume_check", `Score: ${score}/100`);
}

export async function listMyResumeChecks() {
  const u = uid();
  if (!u) return [];
  const snap = await getDocs(query(collection(db, "users", u, "resumeChecks"), orderBy("at", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ------------------------------------------------------- Admin-wide reads
// collectionGroup reads used only by the admin Data Records screen.
export async function adminListAllActivity() {
  const snap = await getDocs(query(collection(db, "activity"), orderBy("at", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function adminCountAiChatsByUser() {
  const snap = await getDocs(collectionGroup(db, "aiChats"));
  const counts = {};
  snap.docs.forEach((d) => {
    const uidPath = d.ref.parent.parent.id;
    counts[uidPath] = (counts[uidPath] || 0) + 1;
  });
  return counts;
}

export async function adminCountResumeChecksByUser() {
  const snap = await getDocs(collectionGroup(db, "resumeChecks"));
  const counts = {};
  snap.docs.forEach((d) => {
    const uidPath = d.ref.parent.parent.id;
    counts[uidPath] = (counts[uidPath] || 0) + 1;
  });
  return counts;
}

export async function adminListAllCertificates() {
  const snap = await getDocs(collection(db, "certificates"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Every student's progress doc, across every user — used to compute
// real per-course completion percentages for the admin Overview chart.
export async function adminListAllProgress() {
  const snap = await getDocs(collectionGroup(db, "progress"));
  return snap.docs.map((d) => ({ id: d.id, uid: d.ref.parent.parent.id, ...d.data() }));
}
