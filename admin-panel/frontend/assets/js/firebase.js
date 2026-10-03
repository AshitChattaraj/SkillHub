// assets/js/firebase.js
// Firebase client for Admin Panel

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCJgr1ZLZkonX0yji2PYjK4rb3bP3v06qU",
  authDomain: "skill-hub-df744.firebaseapp.com",
  projectId: "skill-hub-df744",
  storageBucket: "skill-hub-df744.firebasestorage.app",
  messagingSenderId: "969807464845",
  appId: "1:969807464845:web:d2ab4c049baca02fd5d5c4",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export async function getUserProfile(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  return null;
}

// Gate a page to admins only.
export function requireAdmin(onReady, { loginPage = "admin-login.html" } = {}) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = loginPage;
      return;
    }
    const profile = await getUserProfile(user.uid);
    if (!profile || profile.role !== "admin") {
      alert("403 Forbidden: Administrator access required.");
      await signOut(auth);
      window.location.href = loginPage;
      return;
    }
    if (profile.status === "blocked") {
      alert("This administrator account is blocked.");
      await signOut(auth);
      window.location.href = loginPage;
      return;
    }
    onReady(user, profile);
  });
}

export async function doLogout(redirectTo = "admin-login.html") {
  await signOut(auth);
  window.location.href = redirectTo;
}

export const doAdminLogout = doLogout;

export async function setUserStatus(uid, status) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, { status, updatedAt: serverTimestamp() }, { merge: true });
}
