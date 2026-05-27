const HOST = "https://ollama.com";

const $ = (sel) => document.querySelector(sel);

const LS = {
  apiKey: "grok_ollama_api_key",
  systemOverride: "grok_system_override",
  temperature: "grok_temperature",
  topP: "grok_top_p",
  maxTokens: "grok_max_tokens",
  stream: "grok_stream",
  useContext: "grok_use_context",
  deepEnabled: "grok_deep_enabled",
  deepDepth: "grok_deep_depth",
  deepTurns: "grok_deep_turns",
  deepStyle: "grok_deep_style",
  deepAssumptions: "grok_deep_assumptions",
  model: "grok_selected_model"
};

let state = {
  messages: [],
  controller: null,
  stopRequested: false
};

function nowTime(){
  return new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
}

function escapeHtml(str){
  return str.replace(/[&<>"']/g, (m) => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#039;"
  })[m]);
}

function renderMessage({role, content}, index){
  const msg = document.createElement("div");
  msg.className = `msg ${role === "user" ? "user" : ""}`;
  msg.dataset.index = String(index);

  const badge = role === "user" ? "USER" : (role === "assistant" ? "ASSISTANT" : "SYSTEM");
  msg.innerHTML = `
    <div class="meta">
      <div class="badge">${escapeHtml(badge)}</div>
      <div class="tiny">${escapeHtml(nowTime())}</div>
    </div>
    <div class="content">${escapeHtml(content)}</div>
  `;
  return msg;
}

function scrollToBottom(){
  const sc = $("#chatScroll");
  requestAnimationFrame(() => { sc.scrollTop = sc.scrollHeight; });
}

function appendMessage(role, content){
  const messagesEl = $("#messages");
  const idx = state.messages.length;
  state.messages.push({ role, content });
  const el = renderMessage(state.messages[idx], idx);
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function updateMessageContent(index, newContent){
  const el = document.querySelector(`.msg[data-index="${index}"] .content`);
  if(!el) return;
  el.textContent = newContent;
  scrollToBottom();
}

function setConnStatus(){
  const key = localStorage.getItem(LS.apiKey);
  const dot = $("#connStatus .status-dot");
  const text = $("#connStatus .status-text");
  if(key){
    dot.style.background = "rgba(34,197,94,.85)";
    dot.style.boxShadow = "0 0 0 4px rgba(34,197,94,.16)";
    text.textContent = "API key set";
  }else{
    dot.style.background = "rgba(239,68,68,.85)";
    dot.style.boxShadow = "0 0 0 4px rgba(239,68,68,.15)";
    text.textContent = "API key not set";
  }
}

function openModal(){ $("#settingsModal").hidden = false; }
function closeModal(){ $("#settingsModal").hidden = true; }

function selfCheck(){
  const required = [
    "#modelSelect",
    "#userInput",
    "#messages",
    "#settingsModal",
    "#apiKeyInput",
    "#btnSend",
    "#btnLoadModels",
    "#btnSettings",
    "#deepSearchModeToggle",
    "#streamToggle",
    "#useContextToggle",
  ];

  const missing = [];
  for(const sel of required){
    if(!document.querySelector(sel)) missing.push(sel);
  }

  const keySet = !!localStorage.getItem(LS.apiKey);
  const note = $("#settingsNote");
  note.textContent = "";

  const lines = [];
  lines.push(`Self-check: ${missing.length ? "❌ issues found" : "✅ OK"}`);
  lines.push(`API key in localStorage: ${keySet ? "yes" : "no"}`);
  if(missing.length){
    lines.push("");
    lines.push("Missing elements:");
    for(const m of missing) lines.push(`- ${m}`);
  }else{
    lines.push("");
    lines.push("UI wiring looks good. You can now click “Load models” and send a message.");
  }

  note.textContent = lines.join("\n");
  openModal();
}

function loadSettingsIntoUI(){
  $("#apiKeyInput").value = localStorage.getItem(LS.apiKey) || "";
  $("#systemPromptInput").value = localStorage.getItem(LS.systemOverride) || "";

  if(localStorage.getItem(LS.temperature) !== null) $("#temperatureInput").value = localStorage.getItem(LS.temperature);
  if(localStorage.getItem(LS.topP) !== null) $("#topPInput").value = localStorage.getItem(LS.topP);
  if(localStorage.getItem(LS.maxTokens) !== null) $("#maxTokensInput").value = localStorage.getItem(LS.maxTokens);

  $("#streamToggle").checked = (localStorage.getItem(LS.stream) ?? "true") === "true";
  $("#useContextToggle").checked = (localStorage.getItem(LS.useContext) ?? "true") === "true";

  $("#deepSearchModeToggle").checked = (localStorage.getItem(LS.deepEnabled) ?? "true") === "true";
  $("#deepDepthSelect").value = localStorage.getItem(LS.deepDepth) || "2";
  $("#deepTurnsSelect").value = localStorage.getItem(LS.deepTurns) || "2";
  $("#deepStyleSelect").value = localStorage.getItem(LS.deepStyle) || "structured";
  $("#deepAssumptionsSelect").value = localStorage.getItem(LS.deepAssumptions) || "yes";

  const selectedModel = localStorage.getItem(LS.model);
  if(selectedModel) $("#modelSelect").value = selectedModel;
}

function persistSettingsFromUI(){
  localStorage.setItem(LS.systemOverride, $("#systemPromptInput").value.trim());

  localStorage.setItem(LS.temperature, $("#temperatureInput").value);
  localStorage.setItem(LS.topP, $("#topPInput").value);
  localStorage.setItem(LS.maxTokens, $("#maxTokensInput").value);

  localStorage.setItem(LS.stream, String($("#streamToggle").checked));
  localStorage.setItem(LS.useContext, String($("#useContextToggle").checked));

  localStorage.setItem(LS.deepEnabled, String($("#deepSearchModeToggle").checked));
  localStorage.setItem(LS.deepDepth, $("#deepDepthSelect").value);
  localStorage.setItem(LS.deepTurns, $("#deepTurnsSelect").value);
  localStorage.setItem(LS.deepStyle, $("#deepStyleSelect").value);
  localStorage.setItem(LS.deepAssumptions, $("#deepAssumptionsSelect").value);

  if($("#modelSelect").value) localStorage.setItem(LS.model, $("#modelSelect").value);
}

function getSystemPrompt(){
  const preset = $("#systemPreset").value;
  const override = $("#systemPromptInput").value.trim();
  if(override) return override;
  if(preset) return preset;
  return null;
}

function setButtonsForStreaming(isStreaming){
  $("#btnSend").disabled = isStreaming;
  $("#btnStop").disabled = !isStreaming;
}

function getGenerationOptions(){
  const temperature = Number($("#temperatureInput").value);
  const top_p = Number($("#topPInput").value);
  const num_predict = Number($("#maxTokensInput").value);

  return {
    temperature,
    top_p,
    num_predict,
    max_tokens: num_predict
  };
}

function buildOllamaMessages(userText, systemPrompt, includeContext){
  const messages = [];
  if(systemPrompt) messages.push({ role: "system", content: systemPrompt });

  if(includeContext){
    for(const m of state.messages){
      if(m.role === "user" || m.role === "assistant"){
        messages.push({ role: m.role, content: m.content });
      }
    }
  }

  messages.push({ role: "user", content: userText });
  return messages;
}

async function fetchModels(){
  const apiKey = localStorage.getItem(LS.apiKey);
  const res = await fetch(`${HOST}/api/tags`, {
    method: "GET",
    headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}
  });

  if(!res.ok){
    const t = await res.text().catch(()=>null);
    throw new Error(`Failed to load models: ${res.status} ${t || ""}`.trim());
  }

  const data = await res.json();
  const models = (data.models || []).map(m => m.name).filter(Boolean);
  models.sort((a,b)=>a.localeCompare(b));
  return models;
}

async function chatOnce({ model, userText, systemPrompt, includeContext, stream }){
  const apiKey = localStorage.getItem(LS.apiKey);
  if(!apiKey) throw new Error("API key is not set.");

  const payload = {
    model,
    messages: buildOllamaMessages(userText, systemPrompt, includeContext),
    stream: Boolean(stream),
    options: getGenerationOptions()
  };

  state.controller = new AbortController();
  state.stopRequested = false;

  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload),
    signal: state.controller.signal
  });

  if(!res.ok){
    const t = await res.text().catch(()=>null);
    throw new Error(`Chat failed: ${res.status} ${t || ""}`.trim());
  }

  if(!stream){
    const data = await res.json();
    return data?.message?.content ?? "";
  }

  // Streaming: attempt to parse SSE-ish "data:" lines with JSON chunks.
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let fullText = "";

  while(true){
    if(state.stopRequested) break;
    const { value, done } = await reader.read();
    if(done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").map(s => s.trim()).filter(Boolean);

    for(const line of lines){
      if(state.stopRequested) break;

      let jsonStr = line;
      if(line.startsWith("data:")) jsonStr = line.slice(5).trim();
      if(!jsonStr || jsonStr === "[DONE]") continue;

      try{
        const obj = JSON.parse(jsonStr);
        const part = obj?.message?.content;
        if(typeof part === "string" && part.length){
          fullText += part;
        }
      }catch{
        // ignore
      }
    }
  }

  return fullText;
}

function buildFinalAnswerPrompt(original, plan, style, includeAssumptions, intermediate){
  let styleInstr = "";
  if(style === "structured") styleInstr = "Answer with: Summary → Main points → Examples/edge-cases → Next steps.";
  if(style === "concise") styleInstr = "Answer concisely with only the most important details.";
  if(style === "bullet") styleInstr = "Answer primarily in bullets with short explanations.";

  const assumptionsInstr = includeAssumptions
    ? `Include an "Assumptions" section when relevant.`
    : `Do NOT include an "Assumptions" section.`;

  if(intermediate){
    return (
      `You are an expert assistant. Use the research plan to answer the user's question.\n`+
      `No external browsing. Use reasoning only.\n\n`+
      `STYLE:\n${styleInstr}\n${assumptionsInstr}\n\n`+
      `RESEARCH PLAN:\n${plan}\n\n`+
      `EXPANDED NOTES:\n${intermediate}\n\n`+
      `USER QUESTION:\n${original}`
    );
  }

  return (
    `You are an expert assistant. Use the research plan to answer the user's question.\n`+
    `No external browsing. Use reasoning only.\n\n`+
    `STYLE:\n${styleInstr}\n${assumptionsInstr}\n\n`+
    `RESEARCH PLAN:\n${plan}\n\n`+
    `USER QUESTION:\n${original}`
  );
}

async function deepSearchUserPrompt(original, model, systemPrompt){
  if(!$("#deepSearchModeToggle").checked) return original;

  const depth = Number($("#deepDepthSelect").value); // 1..3
  const turns = Number($("#deepTurnsSelect").value); // 2 or 3
  const style = $("#deepStyleSelect").value;
  const includeAssumptions = $("#deepAssumptionsSelect").value === "yes";

  const baseSystem = systemPrompt ? `${systemPrompt}\n\n` : "";

  const planPrompt =
    `You are a deep research assistant.\n`+
    `Create a high-quality plan to answer the user's question.\n`+
    `Constraints: no external browsing. Use reasoning only.\n\n`+
    `Return exactly:\n`+
    `1) Key interpretations (2-4 bullets)\n`+
    `2) Assumptions${includeAssumptions ? " (if any)" : " (omit if none)"}\n`+
    `3) Research steps (in order, ${depth} level(s))\n`+
    `4) What to compute/derive\n`+
    `5) Final outline (sections)\n\n`+
    `USER QUESTION:\n${original}`;

  const plan = await chatOnce({
    model,
    userText: planPrompt,
    systemPrompt: `${baseSystem}You only produce the requested plan format.`,
    includeContext: false,
    stream: false
  });

  if(turns === 2){
    return buildFinalAnswerPrompt(original, plan, style, includeAssumptions);
  }

  const intermediatePrompt =
    `Using the following research plan, expand key points, derive necessary facts, and draft a refined outline.\n\n`+
    `RESEARCH PLAN:\n${plan}\n\n`+
    `OUTPUT FORMAT:\n- Expanded outline (with bullets)\n- Derived facts / computed pieces\n- Potential pitfalls & how to avoid them\n`;

  const intermediate = await chatOnce({
    model,
    userText: intermediatePrompt,
    systemPrompt: `${baseSystem}You produce only the requested content.`,
    includeContext: false,
    stream: false
  });

  return buildFinalAnswerPrompt(original, plan, style, includeAssumptions, intermediate);
}

async function handleSend(){
  const userText = $("#userInput").value.trim();
  if(!userText) return;

  const model = $("#modelSelect").value;
  if(!model){
    alert("Select a model first (Load models).");
    return;
  }

  if(!localStorage.getItem(LS.apiKey)){
    alert("Set your Ollama Cloud API key in More options.");
    openModal();
    return;
  }

  $("#userInput").value = "";

  const includeContext = $("#useContextToggle").checked;
  const stream = $("#streamToggle").checked;
  const systemPrompt = getSystemPrompt();

  setButtonsForStreaming(true);

  appendMessage("user", userText);

  const assistantIndex = state.messages.length;
  appendMessage("assistant", "");
  updateMessageContent(assistantIndex, "");

  let finalText = "";

  try{
    let promptToUse = userText;
    if($("#deepSearchModeToggle").checked){
      promptToUse = await deepSearchUserPrompt(userText, model, systemPrompt);
    }

    finalText = await chatOnce({
      model,
      userText: promptToUse,
      systemPrompt,
      includeContext,
      stream
    });

    updateMessageContent(assistantIndex, finalText);
  }catch(err){
    const msg = err?.message ? String(err.message) : String(err);
    updateMessageContent(assistantIndex, `Error: ${msg}`);
  }finally{
    setButtonsForStreaming(false);
    state.controller = null;
  }
}

function stopGeneration(){
  state.stopRequested = true;
  if(state.controller){
    try { state.controller.abort(); } catch {}
  }
  setButtonsForStreaming(false);
}

function wireEvents(){
  $("#btnSend").addEventListener("click", handleSend);
  $("#btnStop").addEventListener("click", stopGeneration);
  $("#btnSelfCheck")?.addEventListener("click", selfCheck);

  $("#userInput").addEventListener("keydown", (e) => {
    if(e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      handleSend();
    }
  });

  $("#btnSettings").addEventListener("click", () => {
    persistSettingsFromUI();
    $("#settingsNote").textContent = "";
    openModal();
  });

  $("#btnCloseSettings").addEventListener("click", closeModal);
  document.querySelector("#settingsModal .modal-backdrop")?.addEventListener("click", (e) => {
    if(e.target?.dataset?.close === "true") closeModal();
  });

  $("#btnApplySettings").addEventListener("click", () => {
    persistSettingsFromUI();
    setConnStatus();
    closeModal();
  });

  $("#btnSaveKey").addEventListener("click", () => {
    const v = $("#apiKeyInput").value.trim();
    if(!v){
      $("#settingsNote").textContent = "Key is empty.";
      return;
    }
    localStorage.setItem(LS.apiKey, v);
    setConnStatus();
    $("#settingsNote").textContent = "Key saved.";
  });

  $("#btnClearKey").addEventListener("click", () => {
    localStorage.removeItem(LS.apiKey);
    $("#apiKeyInput").value = "";
    setConnStatus();
    $("#settingsNote").textContent = "Key cleared.";
  });

  $("#btnNewChat").addEventListener("click", () => {
    state.messages = [];
    $("#messages").innerHTML = "";
  });

  $("#btnClearChat").addEventListener("click", () => {
    state.messages = [];
    $("#messages").innerHTML = "";
  });

  $("#btnExport").addEventListener("click", () => {
    const data = {
      exportedAt: new Date().toISOString(),
      model: $("#modelSelect").value,
      messages: state.messages
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grok-chat-export.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  $("#btnLoadModels").addEventListener("click", async () => {
    try{
      $("#btnLoadModels").disabled = true;
      $("#btnLoadModels").textContent = "Loading…";
      const models = await fetchModels();

      const sel = $("#modelSelect");
      sel.innerHTML = "";

      for(const name of models){
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      }

      if(models.length){
        // persist current selection
        localStorage.setItem(LS.model, sel.value);
      }
    }catch(err){
      alert(err?.message ? String(err.message) : String(err));
    }finally{
      $("#btnLoadModels").disabled = false;
      $("#btnLoadModels").textContent = "Load models";
    }
  });
}

function init(){
  // initial UI state
  loadSettingsIntoUI();
  setConnStatus();

  // default: stop button disabled
  $("#btnStop").disabled = true;

  wireEvents();

  // Auto-load models if key exists
  if(localStorage.getItem(LS.apiKey)){
    $("#btnLoadModels").click();
  }
}

init();
