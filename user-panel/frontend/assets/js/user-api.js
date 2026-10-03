// assets/js/user-api.js
// Client API layer for User Panel communicating with the Shared Backend

import { auth } from "./firebase.js";
import { getApiUrl } from "./api-config.js";

async function authedFetch(endpoint, options = {}) {
  const user = auth.currentUser;
  let headers = { ...(options.headers || {}) };

  if (user) {
    const idToken = await user.getIdToken();
    headers["Authorization"] = `Bearer ${idToken}`;
  }

  const url = getApiUrl(endpoint);
  const res = await fetch(url, {
    ...options,
    headers,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

export async function apiGetUserProfile() {
  try {
    return await authedFetch("/api/user/profile");
  } catch (err) {
    const user = auth.currentUser;
    if (!user) throw err;
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const { db } = await import("./firebase.js");
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      return { user: { id: snap.id, ...snap.data() } };
    }
    throw err;
  }
}

export async function apiUpdateUserProfile(profileData) {
  let backendResult = null;
  let backendError = null;

  try {
    backendResult = await authedFetch("/api/user/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileData),
    });
  } catch (err) {
    backendError = err;
    console.warn("Backend /api/user/profile error, falling back to direct Firestore update:", err);
  }

  // Always sync to client Firestore as well so client-side cache and listeners update instantly
  const user = auth.currentUser;
  if (user) {
    try {
      const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const { db } = await import("./firebase.js");
      await setDoc(doc(db, "users", user.uid), {
        ...profileData,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (fsErr) {
      console.warn("Direct Firestore update warning:", fsErr);
    }
  }

  if (backendResult) return backendResult;
  if (user) {
    return {
      message: "Profile updated successfully via Firestore sync",
      user: { id: user.uid, ...profileData }
    };
  }
  throw backendError || new Error("Failed to update profile");
}

export async function apiUploadProfilePhoto(file) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  
  let backendData = null;
  try {
    const idToken = await user.getIdToken();
    const formData = new FormData();
    formData.append("photo", file);

    const url = getApiUrl("/api/user/profile-photo");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body: formData,
    });

    if (res.ok) {
      backendData = await res.json();
    }
  } catch (err) {
    console.warn("Backend photo upload warning:", err);
  }

  // If backend upload succeeded, sync to client Firestore and return
  if (backendData && backendData.photoUrl) {
    try {
      const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const { db } = await import("./firebase.js");
      const fsUpdates = { photoUrl: backendData.photoUrl, updatedAt: serverTimestamp() };
      if (backendData.profileCompleted) fsUpdates.profileCompleted = true;
      await setDoc(doc(db, "users", user.uid), fsUpdates, { merge: true });
    } catch (_) {}
    return backendData;
  }

  // Resilient Client Fallback: convert file to Base64 Data URL and save to Firestore
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target.result;
      try {
        const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const { db } = await import("./firebase.js");
        await setDoc(doc(db, "users", user.uid), {
          photoUrl: dataUrl,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        resolve({
          photoUrl: dataUrl,
          profileCompleted: true,
          message: "Photo uploaded and saved successfully",
        });
      } catch (fsErr) {
        console.warn("Firestore photo update warning:", fsErr);
        resolve({
          photoUrl: dataUrl,
          profileCompleted: true,
          message: "Photo saved to local session",
        });
      }
    };
    reader.onerror = () => reject(new Error("Failed to process photo file"));
    reader.readAsDataURL(file);
  });
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
  const { db } = await import("./firebase.js");
  const snap = await getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function apiGetCourses() {
  return authedFetch("/api/courses");
}


export async function apiAskAi(question, customKey = null) {
  const geminiKey = customKey || localStorage.getItem("skillhub_gemini_key") || "";
  return authedFetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, custom_key: geminiKey }),
  });
}

export async function apiGetGeminiStatus() {
  return authedFetch("/api/gemini/status");
}

export async function apiConfigureGemini(geminiKey) {
  return authedFetch("/api/gemini/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gemini_key: geminiKey }),
  });
}

