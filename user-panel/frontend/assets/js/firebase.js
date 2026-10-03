// assets/js/firebase.js
// Firebase client for User Panel: Auth + Firestore

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

// Creates the Firestore profile doc for a new user with profileCompleted=false
export async function createUserProfile(uid, { name, email }) {
  const role = "user";
  const profile = {
    name: name || "",
    email: email || "",
    role,
    status: "active",
    profileCompleted: false,
    regNo: "",
    branch: "",
    year: "",
    semester: "",
    phone: "",
    photoUrl: "",
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, "users", uid), profile);
  return profile;
}

// Reads a user's profile doc. Self-heals with default role="user" & profileCompleted=false
export async function getOrCreateUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    return { id: snap.id, ...data };
  }

  const profile = {
    name: user.displayName || "",
    email: user.email || "",
    role: "user",
    status: "active",
    profileCompleted: false,
    regNo: "",
    branch: "",
    year: "",
    semester: "",
    phone: "",
    photoUrl: user.photoURL || "",
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return { id: user.uid, ...profile };
}

// Gate a page to signed-in students.
// If checkProfileCompletion=true, redirects incomplete profiles to profile-setup.html
export function requireAuth(onReady, { loginPage = "login.html", checkProfileCompletion = true } = {}) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = loginPage;
      return;
    }
    const profile = await getOrCreateUserProfile(user);
    if (profile.status === "blocked") {
      alert("This account has been suspended. Please contact an administrator.");
      await signOut(auth);
      window.location.href = loginPage;
      return;
    }

    const hasPhoto = Boolean(profile.photoUrl && !profile.photoUrl.includes("flaticon.com"));
    if (checkProfileCompletion && (profile.profileCompleted === false || !hasPhoto)) {
      if (!window.location.pathname.endsWith("profile-setup.html")) {
        window.location.href = "profile-setup.html";
        return;
      }
    }

    onReady(user, profile);
  });
}

export async function doLogout(redirectTo = "index.html") {
  await signOut(auth);
  window.location.href = redirectTo;
}
