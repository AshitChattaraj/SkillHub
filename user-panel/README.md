# SkillHub User Panel (Student Frontend)

Independently deployable student portal application for SkillHub Pro.

## Features
- **Modern Clean Light Theme** (Tailored for students: `#F8FAFC`, Indigo/Purple primary accents, subtle shadows, rounded cards)
- **Mandatory Student Onboarding Flow**:
  - Automatically verifies `profileCompleted` status on login/signup.
  - Redirects incomplete accounts to `profile-setup.html`.
  - Blocks access to `dashboard.html` until required fields (Name, Registration No., Branch, Year, Semester, Mobile) are completed.
- **Student Dashboard**:
  - Profile view & update (with device avatar upload, connected directly to Shared Backend & Firestore).
  - Video and PDF library resources.
  - Course progress tracking and bookmarks.
  - AI Tutor assistance powered by Gemini.

## Local Development
Run the local dev server on port 5001:
```bash
python serve.py
```
Open [http://localhost:5001](http://localhost:5001) in your browser.

## Deployment
Can be deployed to Netlify, Vercel, Firebase Hosting, Cloudflare Pages, or AWS S3.
Ensure the `API_BASE_URL` in `assets/js/api-config.js` or `window.SKILLHUB_API_URL` points to your deployed backend API URL (e.g., `https://api.yourdomain.com`).
