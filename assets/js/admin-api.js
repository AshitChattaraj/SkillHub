// assets/js/admin-api.js
// Thin wrapper around fetch() for talking to the real Flask backend
// (app.py). Every call attaches the signed-in admin's Firebase ID token
// so the backend can verify who's calling (see require_admin in app.py).

import { auth } from "./firebase.js";

async function authedFetch(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const idToken = await user.getIdToken();

  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${idToken}`,
    },
  });

  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    /* no JSON body */
  }

  if (!res.ok) {
    throw new Error((body && body.error) || `Request failed (${res.status})`);
  }
  return body;
}

// ---- Users (students + instructors) ----
export function apiListUsers(role) {
  const qs = role ? `?role=${encodeURIComponent(role)}` : "";
  return authedFetch(`/api/admin/users${qs}`);
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

export function apiEditUser(uid, updates) {
  return authedFetch(`/api/admin/users/${uid}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export function apiToggleBlock(uid) {
  return authedFetch(`/api/admin/users/${uid}/block`, { method: "POST" });
}

export function apiDeleteUser(uid) {
  return authedFetch(`/api/admin/users/${uid}`, { method: "DELETE" });
}

// ---- Video uploads (drag & drop, replaces YouTube-link-only flow) ----
export async function apiUploadVideo(file, meta, onProgress) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const idToken = await user.getIdToken();

  const form = new FormData();
  form.append("file", file);
  form.append("title", meta.title || file.name);
  form.append("description", meta.description || "");
  form.append("section", meta.section || "General");
  form.append("branch", meta.branch || "");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/videos/upload");
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
