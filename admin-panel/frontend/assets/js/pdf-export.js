// assets/js/pdf-export.js
// Thin wrappers around jsPDF (loaded via CDN <script> tag — see the
// <script src=".../jspdf.umd.min.js"> tag near the end of dashboard.html
// / admindashboard.html) for the "download my data as PDF" features:
// AI chat transcripts and the admin platform report.

function getJsPDF() {
  const ctor = window.jspdf && window.jspdf.jsPDF;
  if (!ctor) {
    alert("PDF export isn't available right now — please refresh the page and try again.");
    return null;
  }
  return ctor;
}

function wrapText(docPdf, text, x, y, maxWidth, lineHeight) {
  const lines = docPdf.splitTextToSize(text, maxWidth);
  docPdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

export function exportAiChatPdf(turns, studentName = "Student") {
  const JsPDF = getJsPDF();
  if (!JsPDF) return;
  const docPdf = new JsPDF();
  let y = 20;

  docPdf.setFontSize(16);
  docPdf.text("SkillHub — AI Study Assistant Chat History", 15, y);
  y += 8;
  docPdf.setFontSize(10);
  docPdf.setTextColor(120);
  docPdf.text(`${studentName} — exported ${new Date().toLocaleString()}`, 15, y);
  docPdf.setTextColor(0);
  y += 12;

  if (!turns.length) {
    docPdf.setFontSize(11);
    docPdf.text("No chat history yet.", 15, y);
  }

  turns.forEach((t) => {
    if (y > 270) { docPdf.addPage(); y = 20; }
    docPdf.setFontSize(11);
    docPdf.setFont(undefined, "bold");
    y = wrapText(docPdf, `You: ${t.question}`, 15, y, 180, 6);
    y += 2;
    docPdf.setFont(undefined, "normal");
    y = wrapText(docPdf, `AI: ${t.answer}`, 15, y, 180, 6);
    y += 8;
  });

  docPdf.save("skillhub-ai-chat-history.pdf");
}

export function exportAdminReportPdf(report) {
  const JsPDF = getJsPDF();
  if (!JsPDF) return;
  const docPdf = new JsPDF();
  let y = 20;

  docPdf.setFontSize(16);
  docPdf.text("SkillHub — Platform Report", 15, y);
  y += 8;
  docPdf.setFontSize(10);
  docPdf.setTextColor(120);
  docPdf.text(`Generated ${new Date().toLocaleString()}`, 15, y);
  docPdf.setTextColor(0);
  y += 12;

  docPdf.setFontSize(12);
  [
    `Total students: ${report.totalStudents}`,
    `Total courses: ${report.totalCourses} (${report.publishedCourses} published)`,
    `Total AI questions asked: ${report.totalAiChats}`,
  ].forEach((line) => { docPdf.text(line, 15, y); y += 8; });

  y += 6;
  docPdf.setFontSize(13);
  docPdf.text("Course completion overview:", 15, y);
  y += 8;
  docPdf.setFontSize(11);
  report.courseCompletion.forEach((c) => {
    if (y > 270) { docPdf.addPage(); y = 20; }
    docPdf.text(`• ${c.title}: ${c.percent}% avg completion (${c.studentsWithProgress} students tracked)`, 18, y);
    y += 7;
  });

  docPdf.save("skillhub-platform-report.pdf");
}
