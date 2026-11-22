"use strict";

const state = {
  participantId: "",
  materials: [],
  practice: [],
  main: [],
  queue: [],
  phase: "practice",
  trialIndex: 0,
  results: [],
  startedAt: null,
  trialStartedAt: null,
  audioContext: null,
  currentSources: [],
  usedMaskerOffsets: {},
};

const $ = (id) => document.getElementById(id);
const screens = [...document.querySelectorAll(".screen")];
const keywordInputs = [...document.querySelectorAll(".keyword-input")];

function showScreen(name) {
  screens.forEach((screen) => { screen.hidden = screen.id !== `screen-${name}`; });
  $("app").focus();
}

function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value); value = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift().map((header) => header.trim());
  return rows.map((cells) => Object.fromEntries(headers.map((header, i) => [header, (cells[i] || "").trim()])));
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function assignMaskers(items) {
  const flexible = items.filter((item) => !item.forced_masker);
  const conditions = shuffle(flexible.map((_, index) => index % 2 === 0 ? "SSN" : "CompetingSpeech"));
  let conditionIndex = 0;
  return shuffle(items).map((item) => ({
    ...item,
    assigned_masker: item.forced_masker || conditions[conditionIndex++],
  }));
}

function maskerSettings(trial) {
  if (trial.assigned_masker === "SSN") {
    return { condition: "SSN", path: trial.ssn_audio, snrDb: Number(trial.ssn_snr_db) };
  }
  return { condition: "CompetingSpeech", path: trial.competing_speech_audio, snrDb: Number(trial.competing_speech_snr_db) };
}

async function loadMaterials() {
  const response = await fetch("materials.csv", { cache: "no-store" });
  if (!response.ok) throw new Error(`materials.csv returned ${response.status}`);
  const materials = parseCsv(await response.text());
  const required = ["id", "phase", "sentence", "keyword_1", "keyword_2", "keyword_3", "keyword_4", "keyword_5", "sentence_audio", "ssn_audio", "ssn_snr_db", "competing_speech_audio", "competing_speech_snr_db", "forced_masker"];
  if (!materials.length || required.some((key) => !(key in materials[0]))) throw new Error("materials.csv is empty or is missing a required column.");
  state.materials = materials;
  state.practice = assignMaskers(materials.filter((item) => item.phase.toLowerCase() === "practice"));
  state.main = assignMaskers(materials.filter((item) => item.phase.toLowerCase() === "main"));
  if (!state.practice.length || !state.main.length) throw new Error("Add at least one practice row and one main row to materials.csv.");
}

function getAudioContext() {
  if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  return state.audioContext;
}

async function fetchAudio(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Audio file not found: ${path}`);
  return getAudioContext().decodeAudioData(await response.arrayBuffer());
}

function rms(buffer) {
  let sum = 0, samples = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) { sum += data[i] * data[i]; samples += 1; }
  }
  return Math.sqrt(sum / Math.max(samples, 1));
}

async function playMixedAudio(trial) {
  const ctx = getAudioContext();
  await ctx.resume();
  const masker = maskerSettings(trial);
  const [sentenceBuffer, maskerBuffer] = await Promise.all([fetchAudio(trial.sentence_audio), fetchAudio(masker.path)]);
  const sentenceSource = ctx.createBufferSource(), maskerSource = ctx.createBufferSource();
  const sentenceGain = ctx.createGain(), maskerGain = ctx.createGain();
  sentenceSource.buffer = sentenceBuffer;
  maskerSource.buffer = maskerBuffer;
  const segmentDuration = sentenceBuffer.duration + 1;
  if (maskerBuffer.duration < segmentDuration) throw new Error(`${masker.path} must be at least ${segmentDuration.toFixed(1)} seconds long`);
  const speechRms = Math.max(rms(sentenceBuffer), 0.000001);
  const noiseRms = Math.max(rms(maskerBuffer), 0.000001);
  const snrDb = masker.snrDb;
  if (!Number.isFinite(snrDb)) throw new Error(`Invalid SNR for ${masker.condition}`);
  sentenceGain.gain.value = 0.72;
  maskerGain.gain.value = 0.72 * (speechRms / noiseRms) / Math.pow(10, snrDb / 20);
  sentenceSource.connect(sentenceGain).connect(ctx.destination);
  maskerSource.connect(maskerGain).connect(ctx.destination);
  const startAt = ctx.currentTime + 0.08;
  const maximumOffset = maskerBuffer.duration - segmentDuration;
  const previousOffsets = state.usedMaskerOffsets[masker.path] || [];
  let maskerOffset = Math.random() * maximumOffset;
  for (let attempt = 0; attempt < 20 && previousOffsets.some((offset) => Math.abs(offset - maskerOffset) < segmentDuration); attempt += 1) {
    maskerOffset = Math.random() * maximumOffset;
  }
  previousOffsets.push(maskerOffset);
  state.usedMaskerOffsets[masker.path] = previousOffsets;
  maskerSource.start(startAt, maskerOffset, segmentDuration);
  sentenceSource.start(startAt + 0.5);
  state.currentSources = [sentenceSource, maskerSource];
  await new Promise((resolve) => {
    maskerSource.onended = () => {
      state.currentSources = [];
      resolve();
    };
  });
}

function playSetupSound() {
  const ctx = getAudioContext();
  ctx.resume();
  const oscillator = ctx.createOscillator(), gain = ctx.createGain();
  oscillator.type = "sine"; oscillator.frequency.value = 440; gain.gain.value = 0.08;
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(); oscillator.stop(ctx.currentTime + 1.2);
}

function updateProgress() {
  const total = state.practice.length + state.main.length;
  const completed = state.results.length;
  $("progressText").textContent = completed ? `${completed} of ${total} trials complete` : "";
  $("progressBar").style.width = `${total ? (completed / total) * 100 : 0}%`;
}

function currentTrial() { return state.queue[state.trialIndex]; }

function renderTrial() {
  const trial = currentTrial();
  const label = state.phase === "practice" ? "Practice" : "Main study";
  $("phaseLabel").textContent = label;
  $("trialCount").textContent = `${state.trialIndex + 1} of ${state.queue.length}`;
  $("trialHeading").textContent = "Listen to the sentence";
  $("trialStatus").textContent = "Press play when you are ready.";
  $("playButton").disabled = false;
  $("playButton").hidden = false;
  $("responseForm").hidden = true;
  $("effortSlider").value = 50; $("effortValue").value = 50;
  keywordInputs.forEach((input) => { input.value = ""; });
  $("responseError").textContent = "";
  state.trialStartedAt = new Date();
  showScreen("trial"); updateProgress();
  if (!trial) finishExperiment();
}

async function handlePlay() {
  const button = $("playButton");
  button.disabled = true;
  $("trialStatus").textContent = "Loading audio…";
  try {
    $("trialStatus").textContent = "Audio playing…";
    await playMixedAudio(currentTrial());
    button.hidden = true;
    $("trialStatus").textContent = "Audio complete. Enter your response below.";
    $("trialHeading").textContent = "What did you hear?";
    $("responseForm").hidden = false;
    keywordInputs[0].focus();
  } catch (error) {
    button.disabled = false;
    $("trialStatus").textContent = `${error.message}. Ask the researcher to check the audio paths in materials.csv.`;
  }
}

function normalizeWord(word) { return word.toLowerCase().trim().replace(/[^a-z0-9']/g, ""); }

function scoreKeywords(responses, trial) {
  const expected = [1,2,3,4,5].map((n) => normalizeWord(trial[`keyword_${n}`]));
  const remaining = [...expected];
  let score = 0;
  responses.map(normalizeWord).forEach((response) => {
    const index = remaining.indexOf(response);
    if (response && index >= 0) { score += 1; remaining.splice(index, 1); }
  });
  return score;
}

function saveResponse(event) {
  event.preventDefault();
  const responses = keywordInputs.map((input) => input.value.trim());
  if (responses.some((word) => !word)) { $("responseError").textContent = "Please enter all five words. Guess if you are unsure."; return; }
  const trial = currentTrial();
  const endedAt = new Date();
  state.results.push({
    participant_id: state.participantId,
    phase: state.phase,
    presentation_order: state.results.length + 1,
    phase_order: state.trialIndex + 1,
    trial_id: trial.id,
    sentence: trial.sentence,
    sentence_audio: trial.sentence_audio,
    masker_condition: maskerSettings(trial).condition,
    masker_audio: maskerSettings(trial).path,
    snr_db: maskerSettings(trial).snrDb,
    expected_keywords: [1,2,3,4,5].map((n) => trial[`keyword_${n}`]).join(" | "),
    response_keywords: responses.join(" | "),
    keyword_score: scoreKeywords(responses, trial),
    keyword_percent: scoreKeywords(responses, trial) * 20,
    listening_effort: Number($("effortSlider").value),
    response_time_ms: endedAt - state.trialStartedAt,
    source: trial.source || "",
    trial_started_at: state.trialStartedAt.toISOString(),
    trial_ended_at: endedAt.toISOString(),
  });
  state.trialIndex += 1;
  if (state.trialIndex < state.queue.length) renderTrial();
  else if (state.phase === "practice") showScreen("break");
  else finishExperiment();
  updateProgress();
}

function startPhase(phase) {
  state.phase = phase;
  state.queue = phase === "practice" ? state.practice : state.main;
  state.trialIndex = 0;
  renderTrial();
}

function finishExperiment() {
  const mainResults = state.results.filter((row) => row.phase === "main");
  const avgScore = mainResults.length ? mainResults.reduce((sum, row) => sum + row.keyword_percent, 0) / mainResults.length : 0;
  const avgEffort = mainResults.length ? mainResults.reduce((sum, row) => sum + row.listening_effort, 0) / mainResults.length : 0;
  $("summary").innerHTML = `<div><span>Main trials</span><strong>${mainResults.length}</strong></div><div><span>File ID</span><strong>${escapeHtml(state.participantId)}</strong></div>`;
  state.summary = { average_keyword_percent: avgScore, average_listening_effort: avgEffort, completed_at: new Date().toISOString() };
  $("progressText").textContent = "Study complete"; $("progressBar").style.width = "100%";
  showScreen("finish");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function csvEscape(value) {
  const string = value == null ? "" : String(value);
  return /[",\n\r]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function exportCsv() {
  const headers = Object.keys(state.results[0] || {});
  const content = [headers.join(","), ...state.results.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\r\n");
  download(`${state.participantId}_listening_study.csv`, content, "text/csv;charset=utf-8");
}

function exportJson() {
  download(`${state.participantId}_listening_study.json`, JSON.stringify({ participant_id: state.participantId, started_at: state.startedAt, ...state.summary, trials: state.results }, null, 2), "application/json");
}

$("startButton").addEventListener("click", () => {
  const id = $("participantId").value.trim();
  if (!id || !$("consent").checked) { $("welcomeError").textContent = "Enter a participant ID and confirm consent to continue."; return; }
  state.participantId = id; state.startedAt = new Date().toISOString(); showScreen("setup");
});
$("testToneButton").addEventListener("click", playSetupSound);
$("setupContinue").addEventListener("click", () => showScreen("instructions"));
$("instructionsContinue").addEventListener("click", () => startPhase("practice"));
$("playButton").addEventListener("click", handlePlay);
$("responseForm").addEventListener("submit", saveResponse);
$("effortSlider").addEventListener("input", (event) => { $("effortValue").value = event.target.value; });
$("mainContinue").addEventListener("click", () => startPhase("main"));
$("downloadCsv").addEventListener("click", exportCsv);
$("downloadJson").addEventListener("click", exportJson);

loadMaterials().catch((error) => {
  $("fatalError").textContent = `${error.message} Open this site through a web server or GitHub Pages; materials cannot load when index.html is opened directly from a folder.`;
  showScreen("error");
});
