// assets/js/ai-tutor.js
// Drives the "AI Study Assistant" panel: text chat + voice input (mic) +
// voice output (TTS) + Markdown formatting + Quick Prompt Chips.
// Secure backend dispatch via /api/ask with resilient academic AI engine.

import { saveAiChatTurn } from "./data.js";
import { apiAskAi } from "./user-api.js";

function formatMarkdown(raw) {
  if (!raw) return "";
  let html = raw
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/```([a-zA-Z0-9]*)\n?([\s\S]*?)```/g, '<pre style="background:#0f172a; color:#f8fafc; padding:12px 14px; border-radius:8px; overflow-x:auto; margin:8px 0; font-family:monospace; font-size:12.5px; border:1px solid #334155;"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(99,102,241,0.12); color:#4f46e5; padding:2px 6px; border-radius:4px; font-family:monospace; font-weight:600;">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/\n• /g, '<br>• ')
    .replace(/\n- /g, '<br>• ')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
  return html;
}

function cleanForSpeech(raw) {
  return raw
    .replace(/```[\s\S]*?```/g, "Code block omitted.")
    .replace(/`[^`]+`/g, "")
    .replace(/[*#_~]/g, "")
    .replace(/•/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function initAiTutor({
  inputId = "aiInput",
  sendBtnId = "aiSendBtn",
  micBtnId = "aiMicBtn",
  speakerBtnId = "aiSpeakerBtn",
  boxId = "aiChatBox",
} = {}) {
  const input = document.getElementById(inputId);
  const sendBtn = document.getElementById(sendBtnId);
  const micBtn = document.getElementById(micBtnId);
  const speakerBtn = document.getElementById(speakerBtnId);
  const box = document.getElementById(boxId);
  if (!input || !box) return null;

  const transcript = [];
  let voiceOn = true;

  function appendLine(who, text, isRaw = false, meta = null) {
    const div = document.createElement("div");
    div.style.margin = "10px 0";
    div.style.lineHeight = "1.55";
    div.style.fontSize = "14px";
    
    if (who === "You") {
      div.style.textAlign = "right";
      div.innerHTML = `
        <div style="display:inline-block; max-width:85%; background:var(--accent-color, #4f46e5); color:#fff; padding:9px 14px; border-radius:14px 14px 2px 14px; text-align:left; box-shadow:0 2px 6px rgba(79,70,229,0.2);">
          <b>You:</b> ${formatMarkdown(text)}
        </div>
      `;
    } else {
      div.style.textAlign = "left";
      const isLive = meta && meta.isLiveGemini;
      const modelLabel = (meta && meta.model) ? meta.model : "Google Gemini";
      const badgeHtml = isLive
        ? `<span style="font-size:11px; font-weight:700; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">● Live Gemini (${modelLabel})</span>`
        : `<span style="font-size:11px; font-weight:700; background:#eef2ff; color:#4f46e5; border:1px solid #c7d2fe; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">✨ Linked with Google Gemini</span>`;

      div.innerHTML = `
        <div style="display:inline-block; max-width:92%; background:var(--card-bg, #ffffff); border:1px solid var(--border-color, #e2e8f0); color:var(--text-color, #0f172a); padding:12px 16px; border-radius:14px 14px 14px 2px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <div style="font-weight:700; color:var(--accent-color, #4f46e5); margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span>🤖</span> ${who}
            </div>
            ${badgeHtml}
          </div>
          <div style="color:var(--text-color, #1e293b);">${isRaw ? text : formatMarkdown(text)}</div>
        </div>
      `;
    }

    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  function speak(text) {
    if (!voiceOn || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(cleanForSpeech(text).slice(0, 400));
      utter.lang = "en-US";
      utter.rate = 1;
      window.speechSynthesis.speak(utter);
    } catch (_) {}
  }

  async function askQuery(customText = null) {
    const text = (customText || input.value || "").trim();
    if (!text) return;
    appendLine("You", text);
    if (!customText) input.value = "";

    const loadingDiv = appendLine("AI Assistant", "Thinking and consulting Google Gemini...", true);
    loadingDiv.style.opacity = "0.75";

    try {
      const data = await apiAskAi(text);
      loadingDiv.remove();

      const answer = data.answer || "I am ready to assist! Ask any question regarding your syllabus or programming concepts.";
      appendLine("AI Assistant", answer, false, {
        model: data.model,
        isLiveGemini: data.isLiveGemini,
        poweredBy: data.poweredBy
      });
      speak(answer);
      transcript.push({ question: text, answer: answer });
      saveAiChatTurn(text, answer).catch((err) => console.warn("Save chat history warning:", err));
    } catch (err) {
      loadingDiv.remove();
      appendLine("AI Assistant", `⚠️ ${err.message || "Couldn't reach the AI service right now. Please try again."}`);
      console.error(err);
    }
  }

  if (sendBtn) {
    sendBtn.onclick = () => askQuery();
  }
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") askQuery();
  });

  // Voice input
  if (micBtn) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      micBtn.disabled = true;
      micBtn.title = "Voice input isn't supported in this browser";
    } else {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = false;

      micBtn.addEventListener("click", () => {
        micBtn.classList.add("listening");
        recognition.start();
      });
      recognition.onresult = (event) => {
        const transcriptText = event.results[0][0].transcript;
        input.value = transcriptText;
        askQuery(transcriptText);
      };
      recognition.onend = () => micBtn.classList.remove("listening");
      recognition.onerror = () => micBtn.classList.remove("listening");
    }
  }

  // Voice output toggle
  if (speakerBtn) {
    const sync = () => {
      speakerBtn.textContent = voiceOn ? "🔊" : "🔇";
      speakerBtn.title = voiceOn ? "Voice replies: on (click to mute)" : "Voice replies: off (click to unmute)";
    };
    sync();
    speakerBtn.addEventListener("click", () => {
      voiceOn = !voiceOn;
      if (!voiceOn) window.speechSynthesis?.cancel();
      sync();
    });
  }

  window.sendAiPrompt = function(promptText) {
    askQuery(promptText);
  };

  return {
    getTranscript: () => transcript,
    askQuery,
  };
}
