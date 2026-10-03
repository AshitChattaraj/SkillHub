// assets/js/courses.js
// Data layer for: Courses -> Folders -> Materials (notes / videos / links).
// Used by both dashboard.html (read-only browsing) and admindashboard.html
// (full CRUD). Keeping this in one file means student and admin views can
// never drift apart in how data is shaped.

import { db, auth } from "./firebase.js";
import { API_BASE_URL } from "./api-config.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const coursesCol = collection(db, "courses");

export function foldersCol(courseId) {
  return collection(db, "courses", courseId, "folders");
}
export function materialsCol(courseId, folderId) {
  return collection(db, "courses", courseId, "folders", folderId, "materials");
}

// ---------------------------------------------------------------- Courses
export async function listCourses() {
  const snap = await getDocs(query(coursesCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// User-facing course list: only fetch published courses. Sorting is done in
// memory to avoid requiring a composite Firestore index for status + date.
export async function listPublishedCourses() {
  try {
    const snap = await getDocs(query(coursesCol, where("status", "==", "published")));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
  } catch (firestoreError) {
    // Use the authenticated backend if the deployed Firestore rules are
    // stale or temporarily deny the browser's direct read.
    const user = auth.currentUser;
    if (!user) throw firestoreError;
    const token = await user.getIdToken();
    const response = await fetch(`${API_BASE_URL}/api/courses`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw firestoreError;
    const data = await response.json();
    return data.courses || [];
  }
}

export async function getCourse(courseId) {
  const snap = await getDoc(doc(db, "courses", courseId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function addCourse(data) {
  const ref = await addDoc(coursesCol, {
    title: data.title,
    category: data.category || "Programming",
    instructor: data.instructor || "Unassigned",
    hours: Number(data.hours) || 0,
    icon: data.icon || "📘",
    thumbnailUrl: data.thumbnailUrl || "",
    // New admin-created courses are immediately visible to students.
    // Admins can still hide them later with the Publish/Unpublish control.
    status: data.status || "published",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCourse(courseId, data) {
  await updateDoc(doc(db, "courses", courseId), data);
}

export async function togglePublish(courseId, currentStatus) {
  await updateDoc(doc(db, "courses", courseId), {
    status: currentStatus === "published" ? "draft" : "published",
  });
}

export async function deleteCourse(courseId) {
  // Note: this deletes the course doc itself. Subcollections (folders /
  // materials) are not auto-deleted by Firestore — for a small admin
  // tool that's an acceptable tradeoff (orphaned data, no broken UI),
  // but if you want true cascade delete, do it from a Cloud Function.
  await deleteDoc(doc(db, "courses", courseId));
}

// ----------------------------------------------------------------- Folders
// Folders can nest inside each other (Drive-style) via `parentId`.
// parentId === null means a top-level folder directly under the course.
export async function listFolders(courseId, parentId = null) {
  const snap = await getDocs(query(foldersCol(courseId), orderBy("createdAt", "asc")));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((f) => (f.parentId ?? null) === (parentId ?? null));
}

export async function addFolder(courseId, name, icon = "📁", parentId = null) {
  const ref = await addDoc(foldersCol(courseId), {
    name,
    icon,
    parentId: parentId ?? null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getFolder(courseId, folderId) {
  const snap = await getDoc(doc(db, "courses", courseId, "folders", folderId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function renameFolder(courseId, folderId, name) {
  await updateDoc(doc(db, "courses", courseId, "folders", folderId), { name });
}

// Deletes a folder and everything inside it (subfolders + materials, at
// any depth) so nothing is left orphaned — real recursive delete, not
// just removing the one doc.
export async function deleteFolder(courseId, folderId) {
  const materials = await listMaterials(courseId, folderId);
  for (const m of materials) await deleteMaterial(courseId, folderId, m.id);

  const children = await listFolders(courseId, folderId);
  for (const child of children) await deleteFolder(courseId, child.id);

  await deleteDoc(doc(db, "courses", courseId, "folders", folderId));
}

// Convenience: make sure a course has the two default folders
// ("Notes" and "Videos") the first time an admin opens it.
export async function ensureDefaultFolders(courseId) {
  const existing = await listFolders(courseId, null);
  const names = existing.map((f) => f.name.toLowerCase());
  if (!names.includes("notes")) await addFolder(courseId, "Notes", "📝", null);
  if (!names.includes("videos")) await addFolder(courseId, "Videos", "🎥", null);
}

// --------------------------------------------------------------- Materials
export async function listMaterials(courseId, folderId) {
  const snap = await getDocs(
    query(materialsCol(courseId, folderId), orderBy("addedAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addMaterial(courseId, folderId, data) {
  const ref = await addDoc(materialsCol(courseId, folderId), {
    title: data.title,
    type: data.type || "note", // "note" | "video" | "link" | "pdf"
    url: data.url || "",
    description: data.description || "",
    addedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteMaterial(courseId, folderId, materialId) {
  await deleteDoc(doc(db, "courses", courseId, "folders", folderId, "materials", materialId));
}

// Flattens every material across every folder of a course — at any
// nesting depth — into one list: [{id, title, folderId, folderName, ...}].
// Used to compute real completion percentages instead of a hardcoded
// number, so nested (Drive-style) subfolders still count correctly.
export async function listAllMaterialsForCourse(courseId) {
  const allFoldersSnap = await getDocs(query(foldersCol(courseId), orderBy("createdAt", "asc")));
  const allFolders = allFoldersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const all = [];
  for (const folder of allFolders) {
    const materials = await listMaterials(courseId, folder.id);
    materials.forEach((m) => all.push({ ...m, folderId: folder.id, folderName: folder.name }));
  }
  return all;
}

// Turns a YouTube watch/share URL into an embeddable URL. Returns null
// for anything that isn't recognizably YouTube, so the caller can fall
// back to a plain link instead of a broken iframe.
export function toEmbedUrl(url) {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return `https://www.youtube.com/embed/${m[1]}`;
  }
  return null;
}
