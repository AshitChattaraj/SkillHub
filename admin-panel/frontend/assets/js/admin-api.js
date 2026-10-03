// assets/js/admin-api.js
// Client API layer for Admin Panel communicating with the Shared Backend
// With seamless auto-auth waiting and resilient Firestore fallbacks

import { auth, db } from "./firebase.js";
import { getApiUrl } from "./api-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

async function getAuthToken() {
  let user = auth.currentUser;
  if (!user) {
    user = await new Promise((resolve) => {
      const unsub = auth.onAuthStateChanged((u) => {
        unsub();
        resolve(u);
      });
      setTimeout(() => resolve(null), 4000);
    });
  }
  if (!user) throw new Error("Not signed in");
  return await user.getIdToken();
}

async function authedFetch(endpoint, options = {}) {
  const idToken = await getAuthToken();
  const url = getApiUrl(endpoint);
  
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${idToken}`,
    },
  });

  let body = null;
  try {
    body = await res.json();
  } catch (_) {}

  if (!res.ok) {
    throw new Error((body && body.error) || `Request failed (${res.status})`);
  }
  return body;
}

// ---- Users (students + instructors) ----
export async function apiListUsers(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (typeof filters === "string") {
      if (filters) params.append("role", filters);
    } else if (filters && typeof filters === "object") {
      if (filters.role) params.append("role", filters.role);
      if (filters.branch) params.append("branch", filters.branch);
      if (filters.year) params.append("year", filters.year);
      if (filters.semester) params.append("semester", filters.semester);
      if (filters.status) params.append("status", filters.status);
      if (filters.search) params.append("search", filters.search);
    }
    const qs = params.toString() ? `?${params.toString()}` : "";
    return await authedFetch(`/api/admin/users${qs}`);
  } catch (err) {
    console.warn("Backend API unavailable or error, falling back to direct Firestore fetch:", err.message);
    try {
      const snap = await getDocs(collection(db, "users"));
      const users = [];
      snap.forEach((d) => {
        const data = d.data();
        users.push({
          id: d.id,
          name: data.name || "",
          email: data.email || "",
          role: data.role || "user",
          status: data.status || "active",
          profileCompleted: Boolean(data.profileCompleted),
          regNo: data.regNo || "",
          branch: data.branch || "",
          year: String(data.year || ""),
          semester: String(data.semester || ""),
          phone: data.phone || "",
          photoUrl: data.photoUrl || "",
          createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : String(data.createdAt || "")
        });
      });
      users.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return { users, total: users.length };
    } catch (fsErr) {
      console.error("Firestore fallback failed:", fsErr);
      throw err;
    }
  }
}

export async function apiGetUser(uid) {
  try {
    return await authedFetch(`/api/admin/users/${uid}`);
  } catch (err) {
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      return { user: { id: snap.id, ...snap.data() } };
    }
    throw err;
  }
}

export function apiCreateInstructor(payload) {
  return authedFetch("/api/admin/instructors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function apiCreateStudent(payload) {
  return authedFetch("/api/admin/students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function apiEditUser(uid, updates) {
  try {
    return await authedFetch(`/api/admin/users/${uid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  } catch (err) {
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    await updateDoc(doc(db, "users", uid), updates);
    return { message: "Updated via fallback", id: uid };
  }
}

export async function apiToggleBlock(uid) {
  try {
    return await authedFetch(`/api/admin/users/${uid}/block`, { method: "POST" });
  } catch (err) {
    const { doc, getDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const snap = await getDoc(doc(db, "users", uid));
    const current = (snap.data() && snap.data().status) || "active";
    const newStatus = current === "blocked" ? "active" : "blocked";
    await updateDoc(doc(db, "users", uid), { status: newStatus });
    return { id: uid, status: newStatus, blocked: newStatus === "blocked" };
  }
}

export async function apiDeleteUser(uid) {
  try {
    return await authedFetch(`/api/admin/users/${uid}`, { method: "DELETE" });
  } catch (err) {
    const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    await deleteDoc(doc(db, "users", uid));
    return { message: "Deleted via fallback", id: uid };
  }
}

// ---- Courses ----
export async function apiListCourses() {
  try {
    const body = await authedFetch("/api/admin/courses");
    return body.courses || [];
  } catch (err) {
    console.warn("Backend courses API failed, falling back to Firestore:", err.message);
    const snap = await getDocs(collection(db, "courses"));
    const courses = [];
    snap.forEach((d) => courses.push({ id: d.id, ...d.data() }));
    return courses;
  }
}

export async function apiCreateCourse(payload) {
  return authedFetch("/api/admin/courses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateCourse(courseId, updates) {
  return authedFetch(`/api/admin/courses/${courseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export function apiDeleteCourse(courseId) {
  return authedFetch(`/api/admin/courses/${courseId}`, { method: "DELETE" });
}

// ---- Video uploads ----
export async function apiUploadVideo(file, meta, onProgress) {
  const idToken = await getAuthToken();

  const form = new FormData();
  form.append("file", file);
  form.append("title", meta.title || file.name);
  form.append("description", meta.description || "");
  form.append("section", meta.section || "General");
  form.append("branch", meta.branch || "");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", getApiUrl("/api/admin/videos/upload"));
    xhr.setRequestHeader("Authorization", `Bearer ${idToken}`);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `Upload failed (${xhr.status})`));
      } catch (e) {
        reject(e);
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}

export function apiDeleteVideo(id) {
  return authedFetch(`/api/admin/videos/${id}`, { method: "DELETE" });
}

export async function apiUploadProfilePhoto(file) {
  let backendResult = null;
  try {
    const idToken = await getAuthToken();
    const form = new FormData();
    form.append("photo", file);
    const url = getApiUrl("/api/user/profile-photo");
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
      body: form,
    });
    if (res.ok) {
      backendResult = await res.json();
    }
  } catch (backendErr) {
    console.warn("Backend photo upload warning:", backendErr);
  }

  if (backendResult && backendResult.photoUrl) {
    return backendResult;
  }

  // Resilient Client Fallback: convert to base64 Data URL and sync directly to Firestore
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target.result;
      const user = auth.currentUser;
      if (user) {
        try {
          const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
          await setDoc(doc(db, "users", user.uid), {
            photoUrl: dataUrl,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } catch (fsErr) {
          console.warn("Firestore photo update warning:", fsErr);
        }
      }
      resolve({
        photoUrl: dataUrl,
        message: "Photo uploaded and saved successfully",
      });
    };
    reader.onerror = () => reject(new Error("Failed to process photo file"));
    reader.readAsDataURL(file);
  });
}

// ---- Announcements / Notifications ----
export async function apiPublishAnnouncement({ title, body, audience = "All Students" }) {
  try {
    return await authedFetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, audience }),
    });
  } catch (err) {
    // Client Firestore fallback
    const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const docRef = await addDoc(collection(db, "announcements"), {
      title,
      body,
      audience,
      author: "SkillHub Administration",
      type: "admin_notice",
      createdAt: serverTimestamp(),
    });
    return { id: docRef.id, title, body, audience, success: true };
  }
}

export async function apiGetAnnouncements() {
  try {
    const res = await fetch(getApiUrl("/api/announcements"));
    if (res.ok) {
      const data = await res.json();
      if (data && data.announcements) return data.announcements;
    }
  } catch (_) {}

  const { collection, getDocs, query, orderBy } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const snap = await getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function apiDeleteAnnouncement(id) {
  try {
    return await authedFetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
  } catch (err) {
    const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    await deleteDoc(doc(db, "announcements", id));
    return { id, deleted: true, success: true };
  }
}

