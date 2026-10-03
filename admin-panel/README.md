# SkillHub Admin Panel (Administrator Frontend)

Independently deployable SaaS administration dashboard for SkillHub Pro.

## Features
- **Professional SaaS Light Theme**:
  - Crisp white sidebar with purple/indigo active navigation states
  - Light gray background (`#F8FAFC`) with subtle card borders and elevated shadows
  - Modern typography powered by Plus Jakarta Sans / Inter
- **User & Student Management (Requirement 9 Table)**:
  - 9-column data table: `Photo | Name | Registration No. | Branch | Year | Semester | Mobile | Status | Action`
  - Instant multi-filtering: Search by name/email/reg/phone, filter by branch, year, semester, and completion status.
  - Interactive **View Details** modal with complete academic profile and one-click account controls.
- **Role-Based Security**:
  - Server-verified administrator access (`role === 'admin'`).
  - Protected API communication with Bearer JWT tokens.
  - Non-administrators are rejected with 403 Forbidden.
- **Content Management**:
  - Courses, modules, and material manager.
  - Library manager (Videos, PDFs, GATE PYQs/Mock tests).
  - Activity monitoring and PDF platform report export.

## Local Development
Run the local dev server on port 5002:
```bash
python serve.py
```
Open [http://localhost:5002](http://localhost:5002) in your browser.

## Deployment
Can be deployed independently to Netlify, Vercel, Firebase Hosting, Cloudflare Pages, or AWS S3.
Ensure the `API_BASE_URL` in `assets/js/api-config.js` or `window.SKILLHUB_API_URL` points to your deployed backend API URL (e.g., `https://api.yourdomain.com`).
