// assets/js/ai-tutor.js
// Drives the "AI Study Assistant" panel: text chat + voice input (mic) +
// voice output (speaks the reply back). The actual Gemini call happens on
// server.js (POST /api/ask) so the API key never touches the browser —
// the previous version of dashboard.html had a live key hardcoded in the
// page source, which is a real leak. Don't put it back here.
//
// initAiTutor({ inputId, sendBtnId, micBtnId, speakerBtnId, boxId })

import { saveAiChatTurn } from "./data.js";

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
  if (!input || !box) return; // panel not on this page

  const transcript = []; // { question, answer } — used for the PDF export button
  let voiceOn = true; // spoken replies on by default; toggled by speakerBtn

  function appendLine(who, text) {
    const p = document.createElement("p");
    p.style.margin = "5px 0";
    p.style.color = who === "You" ? "#fff" : "#a78bfa";
    p.innerHTML = `<b>${who}:</b> ${text}`;
    box.appendChild(p);
    box.scrollTop = box.scrollHeight;
    return p;
  }

  function speak(text) {
    if (!voiceOn || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 1;
    window.speechSynthesis.speak(utter);
  }

  async function ask() {
    const text = input.value.trim();
    if (!text) return;
    appendLine("You", text);
    input.value = "";

    const loading = appendLine("AI Assistant", "Thinking...");
    loading.style.fontStyle = "italic";

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      loading.remove();

      if (!res.ok) {
        appendLine("AI Assistant", `⚠️ ${data.answer || "Something went wrong."}`);
        return;
      }
      appendLine("AI Assistant", data.answer);
      speak(data.answer);
      transcript.push({ question: text, answer: data.answer });
      saveAiChatTurn(text, data.answer).catch((err) => console.error("Couldn't save chat history:", err));
    } catch (err) {
      loading.remove();
      appendLine("AI Assistant", "❌ Couldn't reach the AI server. Is server.js running?");
      console.error(err);
    }
  }

  if (sendBtn) sendBtn.onclick = ask;
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") ask();
  });

  // Voice input (speech-to-text)
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
        input.value = event.results[0][0].transcript;
        ask();
      };
      recognition.onend = () => micBtn.classList.remove("listening");
      recognition.onerror = () => micBtn.classList.remove("listening");
    }
  }

  // Voice output toggle (text-to-speech on/off)
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

  return { getTranscript: () => transcript };
}
