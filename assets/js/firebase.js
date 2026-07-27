// assets/js/firebase.js
// Single shared Firebase setup for the whole site: Auth (login/signup) +
// Firestore (roles, courses, folders, materials). Every page imports from
// here instead of pasting its own firebaseConfig, so there is exactly one
// place to update credentials or security logic.

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
  updateDoc,
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

// One-time signup code that grants the "admin" role instead of "student".
// Change this to your own secret before you go live, and only share it
// with people who should get admin access. This is a light gate, not
// bank-grade security — real enforcement lives in Firestore rules
// (see firestore.rules), which stop a student from ever writing
// role: "admin" onto their own profile document.
export const ADMIN_SIGNUP_CODE = "SKILLHUB-ADMIN-2026";

// Creates the Firestore profile doc for a brand new user (called right
// after signup). role is "admin" only if the correct code was supplied.
export async function createUserProfile(uid, { name, email, adminCode }) {
  const role = adminCode && adminCode.trim() === ADMIN_SIGNUP_CODE ? "admin" : "student";
  await setDoc(doc(db, "users", uid), {
    name: name || "",
    email: email || "",
    role,
    status: "active",
    createdAt: serverTimestamp(),
  });
  return role;
}

// Reads a user's profile doc. If it's missing (e.g. account existed
// before roles were added, or was created via "Continue with Google"),
// self-heals by creating a default "student" profile so the rest of the
// app always has something to read.
export async function getOrCreateUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() };

  const profile = {
    name: user.displayName || "",
    email: user.email || "",
    role: "student",
    status: "active",
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return { id: user.uid, ...profile };
}

// Gate a page to signed-in users. Redirects to login.html if nobody is
// signed in. Calls onReady(user, profile) once we know who they are.
export function requireAuth(onReady, { loginPage = "login.html" } = {}) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = loginPage;
      return;
    }
    const profile = await getOrCreateUserProfile(user);
    if (profile.status === "blocked") {
      alert("This account has been blocked. Contact an administrator.");
      await signOut(auth);
      window.location.href = loginPage;
      return;
    }
    onReady(user, profile);
  });
}

// Gate a page to admins only. Non-admins get bounced to the student
// dashboard; signed-out visitors get bounced to the admin login page.
export function requireAdmin(onReady) {
  requireAuth(
    (user, profile) => {
      if (profile.role !== "admin") {
        window.location.href = "dashboard.html";
        return;
      }
      onReady(user, profile);
    },
    { loginPage: "admin-login.html" }
  );
}

export async function setUserRole(uid, role) {
  await updateDoc(doc(db, "users", uid), { role });
}

export async function setUserStatus(uid, status) {
  await updateDoc(doc(db, "users", uid), { status });
}

export async function doLogout(redirectTo = "index.html") {
  await signOut(auth);
  window.location.href = redirectTo;
}
