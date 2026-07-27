// assets/js/resume-checker.js
// Drives the "Resume Checker" panel: paste resume text -> server-side
// Gemini analysis (/api/resume-check) -> ATS-style score + feedback.
// Saves each check to Firestore (data.js) so it shows up in the
// student's history and the admin's Data Records screen.

import { saveResumeCheck } from "./data.js";

export function initResumeChecker({
  textareaId = "resumeText",
  btnId = "resumeCheckBtn",
  resultId = "resumeResult",
  dropZoneId = "resumeDropZone",
  fileInputId = "resumeFileInput",
  fileStatusId = "resumeFileStatus",
} = {}) {
  const textarea = document.getElementById(textareaId);
  const btn = document.getElementById(btnId);
  const result = document.getElementById(resultId);
  if (!textarea || !btn || !result) return;

  initFileUpload({ textarea, dropZoneId, fileInputId, fileStatusId });

  btn.addEventListener("click", async () => {
    const resumeText = textarea.value.trim();
    if (resumeText.length < 50) {
      alert("Paste your full resume text first (at least a few sentences).");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Analyzing...";
    result.innerHTML = `<p style="opacity:0.7;">Reading your resume like an ATS would...</p>`;

    try {
      const res = await fetch("/api/resume-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText }),
      });
      const data = await res.json();

      if (!res.ok) {
        result.innerHTML = `<p style="color:#f87171;">⚠️ ${data.error || "Something went wrong."}</p>`;
        return;
      }

      renderResult(result, data);
      await saveResumeCheck(data.score, data.summary, data);
    } catch (err) {
      console.error(err);
      result.innerHTML = `<p style="color:#f87171;">❌ Couldn't reach the AI server. Is server.js running?</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Check My Resume";
    }
  });
}

function scoreColor(score) {
  if (score >= 80) return "#22c55e";
  if (score >= 55) return "#eab308";
  return "#ef4444";
}

function listHTML(title, items) {
  if (!items || !items.length) return "";
  return `
    <div style="margin-top:14px;">
      <h4 style="margin:0 0 6px;">${title}</h4>
      <ul style="margin:0; padding-left:20px; opacity:0.9;">
        ${items.map((i) => `<li style="margin-bottom:4px;">${i}</li>`).join("")}
      </ul>
    </div>`;
}

function renderResult(container, data) {
  const color = scoreColor(data.score);
  container.innerHTML = `
    <div class="chart-card" style="max-width:100%;">
      <div style="display:flex; align-items:center; gap:24px; flex-wrap:wrap;">
        <div class="donut-chart" style="background: conic-gradient(${color} 0% ${data.score}%, rgba(255,255,255,0.1) ${data.score}% 100%); width:140px; height:140px;">
          <div class="donut-center" style="width:100px; height:100px;">
            ${data.score}
            <span>/ 100</span>
          </div>
        </div>
        <div style="flex:1; min-width:220px;">
          <h3 style="margin:0 0 6px;">Resume Score</h3>
          <p style="opacity:0.85; margin:0;">${data.summary || ""}</p>
        </div>
      </div>
      ${listHTML("✅ Strengths", data.strengths)}
      ${listHTML("⚠️ Weaknesses", data.weaknesses)}
      ${listHTML("💡 Suggestions", data.suggestions)}
    </div>`;
}

// ---------------------------------------------------------------------
// File upload: drag-and-drop or click-to-browse, with real text
// extraction for PDF (pdf.js), DOCX (mammoth) and plain TXT — all
// loaded via CDN <script> tags in dashboard.html, so this just uses
// whatever's on window.
// ---------------------------------------------------------------------
function initFileUpload({ textarea, dropZoneId, fileInputId, fileStatusId }) {
  const dropZone = document.getElementById(dropZoneId);
  const fileInput = document.getElementById(fileInputId);
  const status = document.getElementById(fileStatusId);
  if (!dropZone || !fileInput) return;

  dropZone.addEventListener("click", () => fileInput.click());

  ["dragenter", "dragover"].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "#a855f7";
      dropZone.style.background = "rgba(168,85,247,0.08)";
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "rgba(255,255,255,0.25)";
      dropZone.style.background = "transparent";
    });
  });
  dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) handleFile(file);
  });

  async function handleFile(file) {
    const name = file.name.toLowerCase();
    if (status) status.textContent = `Reading "${file.name}"...`;

    try {
      let text = "";
      if (name.endsWith(".pdf")) {
        text = await extractPdfText(file);
      } else if (name.endsWith(".docx")) {
        text = await extractDocxText(file);
      } else if (name.endsWith(".txt")) {
        text = await file.text();
      } else {
        if (status) status.textContent = "Unsupported file type — please use PDF, DOCX, or TXT.";
        return;
      }

      if (!text.trim()) {
        if (status) status.textContent = "Couldn't find any text in that file — try pasting it manually instead.";
        return;
      }

      textarea.value = text.trim();
      if (status) status.textContent = `✅ Loaded "${file.name}" (${text.trim().split(/\s+/).length} words). Review below, then click "Check My Resume".`;
    } catch (err) {
      console.error(err);
      if (status) status.textContent = `Couldn't read "${file.name}" — try pasting the text manually instead.`;
    }
  }
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error("pdf.js not loaded");
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text;
}

async function extractDocxText(file) {
  if (!window.mammoth) throw new Error("mammoth not loaded");
  const buffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value || "";
}
