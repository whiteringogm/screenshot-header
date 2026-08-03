"use strict";

const COVER_COLORS = [
  { value: "#111111", label: "黒" },
  { value: "#34363a", label: "墨グレー" },
  { value: "#36414a", label: "青灰" },
  { value: "#443d4c", label: "紫灰" },
  { value: "#4b3b3d", label: "赤灰" },
  { value: "#39453f", label: "緑灰" },
  { value: "#494039", label: "茶灰" },
];

const STORAGE_KEY = "screenshot-header-personas-v1";
const LAST_KEY = "screenshot-header-last-persona";
const initialPersona = { id: "default", name: "アシスタント", model: "Model X", badge: "✨", icon: "" };

const state = {
  personas: [initialPersona], activeId: initialPersona.id, icon: "", shots: [], covers: [],
  coverWidth: 2, coverColor: COVER_COLORS[0].value, coverMode: false, saving: false,
};

const $ = (id) => document.getElementById(id);
const canvas = $("resultCanvas");
const ctx = canvas.getContext("2d");
let noticeTimer = 0;

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function flash(message) {
  clearTimeout(noticeTimer);
  $("notice").textContent = message;
  $("notice").classList.add("show");
  noticeTimer = setTimeout(() => $("notice").classList.remove("show"), 2600);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function currentPersona() {
  return {
    id: state.activeId === "default" ? makeId() : state.activeId,
    name: $("nameInput").value.trim() || "名前なし",
    model: $("modelInput").value.trim(),
    badge: $("badgeInput").value.trim(),
    icon: state.icon,
  };
}

function renderPersonaSelect() {
  const select = $("personaSelect");
  select.replaceChildren(...state.personas.map((persona) => {
    const option = document.createElement("option");
    option.value = persona.id;
    option.textContent = `${persona.badge ? `${persona.badge} ` : ""}${persona.name || "新しいプロフィール"}${persona.model ? ` · ${persona.model}` : ""}`;
    return option;
  }));
  select.value = state.activeId;
  $("deletePersonaButton").disabled = state.personas.length <= 1;
}

function choosePersona(persona, remember = true) {
  state.activeId = persona.id;
  state.icon = persona.icon || "";
  $("nameInput").value = persona.name || "";
  $("modelInput").value = persona.model || "";
  $("badgeInput").value = persona.badge || "";
  updateIconPreview();
  renderPersonaSelect();
  if (remember) localStorage.setItem(LAST_KEY, persona.id);
  void drawResult();
}

function updateIconPreview() {
  $("iconPreview").src = state.icon;
  $("iconPreview").hidden = !state.icon;
  $("iconPlaceholder").hidden = Boolean(state.icon);
}

function persistPersonas() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.personas));
    localStorage.setItem(LAST_KEY, state.activeId);
    return true;
  } catch {
    flash("端末へ保存できませんでした。小さめのアイコン画像でお試しください");
    return false;
  }
}

function savePersona() {
  const persona = currentPersona();
  const exists = state.personas.some((item) => item.id === persona.id);
  state.personas = exists
    ? state.personas.map((item) => item.id === persona.id ? persona : item)
    : [...state.personas.filter((item) => item.id !== "default"), persona];
  state.activeId = persona.id;
  renderPersonaSelect();
  if (persistPersonas()) flash("このプロフィールを端末に保存しました");
}

function newPersona() {
  const persona = { id: makeId(), name: "", model: "", badge: "", icon: "" };
  state.personas.push(persona);
  choosePersona(persona);
}

function deletePersona() {
  if (state.personas.length <= 1) return;
  state.personas = state.personas.filter((item) => item.id !== state.activeId);
  choosePersona(state.personas[0]);
  persistPersonas();
}

async function addShots(files) {
  const imageFiles = [...files].filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) return;
  try {
    const added = await Promise.all(imageFiles.map(async (file) => {
      const src = await fileToDataUrl(file);
      const image = await loadImage(src);
      return { id: makeId(), src, name: file.name.replace(/\.[^.]+$/, "") || "screenshot", width: image.naturalWidth, height: image.naturalHeight };
    }));
    state.shots.push(...added);
    renderShots();
    await drawResult();
  } catch {
    flash("画像を読み込めませんでした");
  }
}

function moveShot(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.shots.length) return;
  [state.shots[index], state.shots[target]] = [state.shots[target], state.shots[index]];
  state.covers = [];
  renderShots();
  void drawResult();
}

function removeShot(id) {
  state.shots = state.shots.filter((shot) => shot.id !== id);
  state.covers = [];
  renderShots();
  void drawResult();
}

function shotButton(label, text, onClick, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.textContent = text;
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

function renderShots() {
  const list = $("shotList");
  list.replaceChildren(...state.shots.map((shot, index) => {
    const item = document.createElement("div");
    item.className = "shot-item";
    const image = document.createElement("img");
    image.src = shot.src;
    image.alt = "";
    const name = document.createElement("span");
    name.textContent = `${index + 1}. ${shot.name}`;
    const actions = document.createElement("div");
    actions.append(
      shotButton("上へ", "↑", () => moveShot(index, -1), index === 0),
      shotButton("下へ", "↓", () => moveShot(index, 1), index === state.shots.length - 1),
      shotButton("削除", "×", () => removeShot(shot.id)),
    );
    item.append(image, name, actions);
    return item;
  }));
  list.hidden = !state.shots.length;
  $("uploadLabel").textContent = state.shots.length ? "スクショを追加する" : "スクショを選ぶ";
  $("coverModeButton").disabled = !state.shots.length;
  $("saveImageButton").disabled = !state.shots.length || state.saving;
  $("resultSummary").textContent = `${state.shots.length > 1 ? `${state.shots.length}枚を連結中。` : ""}PNGで保存します。`;
  renderCoverControls();
}

function roundedImage(image, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  const scale = Math.max(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height);
  ctx.restore();
}

function fillRoundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

async function drawResult() {
  if (!state.shots.length) {
    canvas.hidden = true;
    $("emptyPreview").hidden = false;
    $("canvasStage").classList.remove("has-image", "placing-cover");
    return;
  }
  try {
    const images = await Promise.all(state.shots.map((shot) => loadImage(shot.src)));
    const width = Math.max(...state.shots.map((shot) => shot.width));
    const scale = width / 750;
    const headerHeight = Math.round(97 * scale);
    const renderedHeights = state.shots.map((shot) => Math.round(shot.height * (width / shot.width)));
    canvas.width = width;
    canvas.height = headerHeight + renderedHeights.reduce((sum, height) => sum + height, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const avatarX = 37 * scale;
    const avatarY = 17 * scale;
    const avatarSize = 58 * scale;
    if (state.icon) {
      roundedImage(await loadImage(state.icon), avatarX, avatarY, avatarSize);
    } else {
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#aaa";
      ctx.font = `${32 * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("＋", avatarX + avatarSize / 2, avatarY + avatarSize / 2);
    }

    let textX = 112 * scale;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const displayName = $("nameInput").value.trim() || "名前なし";
    ctx.font = `700 ${37 * scale}px -apple-system, BlinkMacSystemFont, "Noto Sans JP", sans-serif`;
    ctx.fillStyle = "#f7f7f7";
    ctx.fillText(displayName, textX, 49 * scale);
    textX += ctx.measureText(displayName).width;

    const badge = $("badgeInput").value.trim();
    if (badge) {
      textX += 10 * scale;
      ctx.font = `${39 * scale}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.fillText(badge, textX, 48 * scale);
      textX += ctx.measureText(badge).width;
    }

    const model = $("modelInput").value.trim();
    if (model) {
      textX += 18 * scale;
      ctx.font = `400 ${30 * scale}px -apple-system, BlinkMacSystemFont, "Noto Sans JP", sans-serif`;
      ctx.fillStyle = "#c7c7c7";
      ctx.fillText(model, textX, 49 * scale);
    }

    let y = headerHeight;
    images.forEach((image, index) => {
      ctx.drawImage(image, 0, y, width, renderedHeights[index]);
      y += renderedHeights[index];
    });

    state.covers.forEach((cover) => {
      const fontSize = cover.fontSize * scale;
      ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Noto Sans JP", sans-serif`;
      const paddingX = 5 * scale;
      const boxHeight = fontSize * 1.55;
      const boxWidth = cover.text
        ? Math.max(ctx.measureText(cover.text).width + paddingX * 2, cover.widthChars * fontSize)
        : cover.widthChars * fontSize;
      ctx.fillStyle = cover.color;
      fillRoundedRect(cover.x * width - boxWidth / 2, cover.y * canvas.height - boxHeight / 2, boxWidth, boxHeight, 8 * scale);
      if (cover.text) {
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(cover.text, cover.x * width, cover.y * canvas.height);
      }
    });

    canvas.hidden = false;
    $("emptyPreview").hidden = true;
    $("canvasStage").classList.add("has-image");
  } catch {
    flash("プレビューを作れませんでした。画像を減らしてお試しください");
  }
}

function addCover(event) {
  if (!state.coverMode || !state.shots.length) return;
  const rect = canvas.getBoundingClientRect();
  state.covers.push({
    id: makeId(),
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
    text: $("coverTextInput").value.trim(),
    fontSize: 28,
    widthChars: state.coverWidth,
    color: state.coverColor,
  });
  if (!$("continuousCoverInput").checked) state.coverMode = false;
  renderCoverControls();
  void drawResult();
  flash($("coverTextInput").value.trim() ? "置換文字を追加しました" : "文字を隠しました");
}

function renderCoverControls() {
  $("coverModeButton").classList.toggle("active", state.coverMode);
  $("coverModeButton").textContent = state.coverMode ? "プレビューをタップ" : "置換位置を指定";
  $("canvasStage").classList.toggle("placing-cover", state.coverMode && state.shots.length > 0);
  $("tapHint").hidden = !(state.coverMode && state.shots.length);
  $("tapHint").textContent = `隠したい文字の中央をタップしてください${$("continuousCoverInput").checked ? "（続けて置けます）" : ""}`;
  $("coverActions").hidden = !state.covers.length;
  $("coverCount").textContent = `${state.covers.length}か所を置換中`;
}

function canvasToBlob() {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function saveImage() {
  if (!state.shots.length || state.saving) return;
  state.saving = true;
  $("saveImageButton").disabled = true;
  $("saveImageButton").textContent = "準備中…";
  try {
    await drawResult();
    const blob = await canvasToBlob();
    if (!blob) throw new Error("blob");
    const filename = `${state.shots[0].name}${state.shots.length > 1 ? `-plus-${state.shots.length}` : ""}-header.png`;
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      flash("共有メニューを開きました。「画像を保存」を選べます");
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash("画像をダウンロードしました");
    }
  } catch (error) {
    if (error?.name !== "AbortError") flash("保存できませんでした。もう一度お試しください");
  } finally {
    state.saving = false;
    $("saveImageButton").disabled = !state.shots.length;
    $("saveImageButton").textContent = "保存／共有";
  }
}

function bindEvents() {
  ["nameInput", "modelInput", "badgeInput"].forEach((id) => $(id).addEventListener("input", () => void drawResult()));
  $("personaSelect").addEventListener("change", (event) => {
    const persona = state.personas.find((item) => item.id === event.target.value);
    if (persona) choosePersona(persona);
  });
  $("newPersonaButton").addEventListener("click", newPersona);
  $("savePersonaButton").addEventListener("click", savePersona);
  $("deletePersonaButton").addEventListener("click", deletePersona);
  $("iconInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file?.type.startsWith("image/")) {
      state.icon = await fileToDataUrl(file);
      updateIconPreview();
      await drawResult();
    }
    event.target.value = "";
  });
  $("shotInput").addEventListener("change", async (event) => {
    await addShots(event.target.files || []);
    event.target.value = "";
  });
  const dropZone = $("dropZone");
  dropZone.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("dragging"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
    void addShots(event.dataTransfer?.files || []);
  });
  $("coverModeButton").addEventListener("click", () => { state.coverMode = !state.coverMode; renderCoverControls(); });
  $("continuousCoverInput").addEventListener("change", renderCoverControls);
  document.querySelectorAll("[data-cover-width]").forEach((button) => button.addEventListener("click", () => {
    state.coverWidth = Number(button.dataset.coverWidth);
    document.querySelectorAll("[data-cover-width]").forEach((item) => item.classList.toggle("selected", item === button));
  }));
  canvas.addEventListener("click", addCover);
  $("undoCoverButton").addEventListener("click", () => { state.covers.pop(); renderCoverControls(); void drawResult(); });
  $("clearCoversButton").addEventListener("click", () => { state.covers = []; renderCoverControls(); void drawResult(); });
  $("saveImageButton").addEventListener("click", () => void saveImage());
}

function renderPalette() {
  $("colorPalette").replaceChildren(...COVER_COLORS.map((color, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.title = color.label;
    button.setAttribute("aria-label", color.label);
    button.style.setProperty("--cover-color", color.value);
    button.classList.toggle("selected", index === 0);
    button.addEventListener("click", () => {
      state.coverColor = color.value;
      $("colorPalette").querySelectorAll("button").forEach((item) => item.classList.toggle("selected", item === button));
    });
    return button;
  }));
}

function init() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(saved) && saved.length) state.personas = saved;
  } catch {
    state.personas = [initialPersona];
  }
  const selected = state.personas.find((item) => item.id === localStorage.getItem(LAST_KEY)) || state.personas[0];
  renderPalette();
  bindEvents();
  choosePersona(selected, false);
  renderShots();
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

init();
