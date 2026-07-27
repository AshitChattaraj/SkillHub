# SkillHub — Setup Guide

This project uses **Firebase** (Authentication + Firestore) for accounts, roles,
and course content, and a **tiny Node/Express server** for exactly one job:
proxying AI Tutor requests to Gemini so your API key never sits in the browser.

## What changed in this update

1. **Admin panel is now actually connected to real accounts, with a separate login.**
   - Everyone signs up through `signup.html` (or Google). New accounts get a
     `role: "student"` profile in Firestore automatically.
   - To create an **admin** account, enter the Admin Access Code on the signup
     form (default: `SKILLHUB-ADMIN-2026` — **change this**, see below).
   - Admins sign in at the separate `admin-login.html` page (linked from the
     bottom of the regular login page). That page checks the account's role
     and refuses non-admins.
   - `admindashboard.html` now requires you to be signed in **and** have the
     admin role — previously it had no login check at all.
   - Real enforcement lives in `firestore.rules`, not just the frontend code.

2. **AI Tutor now has voice, and is built into the main dashboard.**
   - In Student Dashboard → "🤖 AI Help": type a question or tap 🎙 to speak
     it. Replies are read aloud (toggle with the 🔊 button).
   - Requests go through the new `server.js` `/api/ask` route, which calls
     Gemini using a key stored server-side in `.env`.
   - **Security note:** the previous version of `dashboard.html` had a live
     Gemini key hardcoded in the page's JavaScript, visible to anyone who
     viewed the page source. Treat that old key as leaked — rotate/delete it
     in Google AI Studio if you haven't already. It is not used anywhere in
     this update.

3. **Courses → Folders → Materials.**
   - Clicking a course on the student dashboard opens its **folders**
     (e.g. Notes, Videos, or anything custom you add).
   - Clicking a folder shows the **materials** inside it — notes, YouTube
     videos (auto-embedded), links, or PDF/file links.
   - From the admin dashboard, Courses → "Manage Content" lets you add
     folders (two defaults — Notes and Videos — are created automatically
     the first time you open a course) and add materials to any folder.
   - All of this is stored in Firestore: `courses/{id}/folders/{id}/materials/{id}`.

4. **Course thumbnails, YouTube/PW-style cards.**
   - When adding a course, paste an image URL as the thumbnail. Course
     cards on both the student and admin side show a real 16:9 thumbnail
     (like YouTube/PW course cards) instead of a giant emoji tile — if no
     thumbnail is set, it falls back to the category emoji.

5. **Real progress tracking + real completion graphs (not fake numbers).**
   - Every material has a "Mark complete" checkbox. Checking it writes to
     `users/{uid}/progress/{materialId}` in Firestore.
   - The student **Progress** tab shows a real overall-completion donut
     and a real per-course breakdown, computed from that data — not
     hardcoded percentages.
   - Course cards show a real "% complete" badge once you've started them.
   - The admin **Overview** tab shows real totals (students, published
     courses, AI questions asked, resume checks run) and a real
     "completion by course" chart, averaged across every student who has
     touched that course.
   - Completing 100% of a course's materials automatically issues a
     certificate (visible in the student's Certificates tab, downloadable
     as a PDF).

6. **Video Library / PDF Library / GATE resource management (admin).**
   - New admin sidebar entry: **🎬 Library (Video/PDF/GATE)**, with three
     tabs:
     - **Videos** — add a title + YouTube URL (+ optional thumbnail),
       tag it "General" or "GATE". Shows up in the student Video Library.
     - **PDFs** — add a title + file URL, a tag (PYQs, Mock Tests, Formula
       Sheet, Revision Notes, Book List, Roadmap, Notes), and section
       (General/GATE). Shows up in the student PDF Library.
     - **GATE Resources** — a filtered view of the PDF tab (section =
       "GATE") — these are exactly what populate the GATE page's resource
       cards on the student side (previously those 4 cards were just
       static, non-functional text; now they're real, admin-managed,
       downloadable resources).
   - On first load, the PDF library auto-seeds itself with the 6 real
     PDF files that already ship in `/pdfs`, tagged as GATE resources, so
     nothing that used to work is lost.

7. **AI Resume Checker with a real ATS-style score.**
   - New student tab: **🧾 Resume Checker**. Paste resume text, click
     "Check My Resume", and the server (`/api/resume-check`, using the
     same Gemini key as the AI Tutor) returns a 0–100 score, a summary,
     strengths, weaknesses, and concrete suggestions.
   - Each check is saved to `users/{uid}/resumeChecks` and counted in the
     admin Data Records screen.

8. **Real activity records + PDF/CSV exports.**
   - Every download, video watched, AI question asked, resume check, and
     completed material is logged to a Firestore `activity` collection.
   - Student side: **Downloads** tab shows a real history of what you've
     opened; **AI Help** has a "⬇ Download Chat as PDF" button that
     exports your actual conversation.
   - Admin side: new **🗂 Data Records** tab lists every student with real
     counts (AI questions asked, resume checks run, certificates earned)
     and two export buttons — **CSV** (all students) and **PDF** (a
     platform summary report, also available from Overview). The
     **Activity Logs** and **Certificate Management** tabs now show real
     data instead of placeholder rows too.

## What's still a placeholder (be upfront about this)
To keep scope sane, a few admin screens were **not** rewired this round
and still show illustrative/static numbers: **Analytics** (category
enrollment %, revenue target), **Reports** (moderation queue), and
**Instructors** (the instructor-accounts table). None of these were part
of this update's requested feature set — flag it if you want them made
real next, since a couple (e.g. revenue) would need a payments
integration to be genuinely real rather than just "read from Firestore."

## One-time setup

### 1. Firebase Console
The project already points at a Firebase project (`skill-hub-df744`) via
`assets/js/firebase.js`. If that's your project:
- **Authentication** → Sign-in method → enable **Email/Password** and
  **Google**.
- **Firestore Database** → create a database (production mode is fine).
- **Firestore Database → Rules** → paste the contents of `firestore.rules`
  from this project and publish.

If it's *not* your project, replace the `firebaseConfig` object in
`assets/js/firebase.js` with your own (Project settings → your web app).

### 2. Change the admin signup code
Open `assets/js/firebase.js` and change:
```js
export const ADMIN_SIGNUP_CODE = "SKILLHUB-ADMIN-2026";
```
to your own secret. Only share it with people who should get admin access.
This is a convenience gate on signup — `firestore.rules` is what actually
stops a student from granting themselves the admin role afterward.

### 3. Create your first admin account
Go to `signup.html`, fill in the form, and put your new code in the
"Admin Access Code" field. That account can now sign in at
`admin-login.html`. (Every admin account after that can also be created the
same way, or you can promote a student manually by editing their `users/{uid}`
document in the Firestore console and setting `role: "admin"`.)

### 4. Run the server
```bash
npm install
cp .env.example .env
# edit .env and set GEMINI_API_KEY=your_key   (get one at aistudio.google.com)
npm start
```
Then open **http://localhost:5000** (not `file://...` — the AI Tutor calls
`/api/ask` on the same origin, so the site needs to be served, not opened
directly as a file).

Without a `GEMINI_API_KEY` set, everything else works — the AI Tutor will
just reply with a message asking an admin to configure it.

## Adding your first courses
1. Log in as admin → Courses → **+ Add Course** → fill in title/category/
   instructor/hours → Save as Draft.
2. Click **Publish** on the course card so students can see it.
3. Click **Manage Content** → open the **Notes** or **Videos** folder (or
   add your own, e.g. "Assignments") → use the form to add materials.
   - For videos, paste a YouTube link — it's embedded automatically on the
     student side.
4. Students will see it under Dashboard → Courses.

## Project structure
```
index.html              Landing page
login.html               Student/admin login (routes by role after sign-in)
admin-login.html          Separate admin-only login
signup.html                Account creation (+ optional admin code)
dashboard.html            Student dashboard (courses, AI tutor, DSA tracker, etc.)
admindashboard.html      Admin dashboard (students, courses, content manager)
assets/js/firebase.js      Shared Firebase config + auth/role helpers
assets/js/courses.js       Firestore CRUD: courses → folders → materials
assets/js/library.js       Firestore CRUD: Video Library / PDF Library / GATE resources
assets/js/data.js          Progress, activity log, bookmarks, certificates, ratings, AI chat + resume history
assets/js/ai-tutor.js      Voice-enabled AI tutor client logic
assets/js/resume-checker.js Resume Checker client logic
assets/js/pdf-export.js    jsPDF wrappers: chat transcripts, certificates, admin reports
server.js                 Static file server + /api/ask and /api/resume-check Gemini proxies
firestore.rules           Firestore security rules (paste into Firebase console)
legacy-unused/             Old, disconnected Flask backend + duplicate pages
                          kept for reference only — nothing in the live site
                          links to this folder.
```

## Notes / known limitations
- PDF exports (chat history, certificates, admin reports) use jsPDF loaded
  from a CDN (`cdnjs.cloudflare.com`) — no extra npm install needed, but
  it does mean those buttons need internet access to work.
- Deleting a course from the admin dashboard removes the course document but
  not its `folders`/`materials` subcollections (Firestore doesn't cascade
  deletes). Harmless — they just become unreachable — but for a fully clean
  delete you'd want a Cloud Function.
- "Block" on a student sets their Firestore status to `blocked` and signs
  them out on next load; it doesn't disable their Firebase Auth account
  directly (that requires the Firebase Admin SDK / a Cloud Function, which
  needs a server you deploy — out of scope for this static + tiny-proxy
  setup).
- The dashboard's stats (progress %, revenue, engagement charts, etc.) are
  still placeholder numbers — wiring those to real data would be a good
  next step once you have real usage.
