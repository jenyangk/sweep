import { el, clear, on } from "./lib/dom";
import { toggleTheme } from "./lib/theme";
import { describeType, type ParsedQr } from "./lib/parse-qr";
import {
  downloadCsv,
  downloadTxt,
  copyResults,
  type ScanRecord,
} from "./lib/output";
import {
  startCamera,
  decodeImageFile,
  decodeBase64Image,
  decodeImageUrl,
  enumerateCameras,
  type ScanHandle,
  type ScanStatus,
} from "./lib/scan";
import { icons } from "./icons";
import {
  connectSession,
  joinUrl,
  sessionIdFromUrl,
  parseJoinUrl,
  type SyncHandle,
  type SyncMessage,
  type SyncStatus,
} from "./lib/sync";
import { renderQrSvg } from "./lib/qr";

interface AppState {
  records: ScanRecord[];
  scanHandle: ScanHandle | null;
  status: ScanStatus;
  errorMsg: string;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarize(parsed: ParsedQr): string {
  switch (parsed.type) {
    case "url":
      return parsed.fields.url ?? parsed.raw;
    case "wifi":
      return parsed.fields.S ?? parsed.raw;
    case "vcard":
      return parsed.fields.name ?? parsed.raw.slice(0, 60);
    case "email":
      return parsed.fields.email ?? parsed.raw;
    case "phone":
    case "sms":
      return parsed.fields.phone ?? parsed.raw;
    case "base64":
      return parsed.fields.decoded ?? parsed.raw;
    default:
      return parsed.raw.slice(0, 80);
  }
}

export function initApp(): void {
  const root = document.getElementById("root");
  if (!root) return;
  clear(root);

  const state: AppState = {
    records: [],
    scanHandle: null,
    status: "idle",
    errorMsg: "",
  };
  let currentDeviceId: string | undefined;

  // ----- Header -----
  const muMark = el("a", { class: "mu-mark", href: "https://muniee.com", ariaLabel: "muniee" }, "μ");
  const logo = el("a", { class: "logo", href: "/" }, "sweep");
  const themeBtn = el(
    "button",
    {
      class: "btn btn-ghost btn-sm theme-toggle",
      ariaLabel: "Toggle theme",
      onClick: () => {
        toggleTheme();
        themeBtn.classList.add("icon-spin");
        setTimeout(() => themeBtn.classList.remove("icon-spin"), 500);
      },
    },
    "◐",
  );
  const header = el("header", { class: "sr-header" }, [muMark, logo, themeBtn]);

  // ----- Hero -----
  const h1 = el("h1", {}, "scan QR codes.");
  const subhead = el(
    "p",
    { style: { maxWidth: "560px", color: "var(--muted)", marginTop: "10px" } },
    "camera, image upload, base64, or URL. runs in your browser. no server.",
  );

  const startBtn = el(
    "button",
    {
      class: "btn",
      id: "start-camera",
      onClick: () => openScanner(),
    },
    [icons.camera, "Start camera"],
  );

  const fileInput = el("input", {
    type: "file",
    id: "image-upload",
    accept: "image/*",
    multiple: true,
    onChange: (e) => handleFiles(e),
  });

  const uploadBtn = el(
    "button",
    {
      class: "btn btn-ghost",
      ariaLabel: "Upload image files to decode",
      onClick: () => fileInput.click(),
    },
    [icons.upload, "Upload image"],
  );

  const base64Btn = el(
    "button",
    {
      class: "btn btn-ghost",
      id: "base64-btn",
      onClick: () => openBase64(),
    },
    [icons.clipboard, "Paste base64"],
  );

  const pasteUrlBtn = el(
    "button",
    {
      class: "btn btn-ghost",
      id: "paste-url-btn",
      onClick: () => openPasteUrl(),
    },
    [icons.link, "Paste URL"],
  );

  const actions = el("div", { class: "actions" }, [
    startBtn,
    uploadBtn,
    base64Btn,
    pasteUrlBtn,
    fileInput,
  ]);

  const hero = el("section", { class: "page-enter" }, [h1, subhead, actions]);

  // ----- Session sync (pair device) -----
  const syncStatusPill = el(
    "span",
    { class: "pill", dataset: { status: "idle" } },
    [el("span", { class: "dot" }), "Off"],
  );
  const syncLog = el("div", { class: "sync-log", ariaLive: "polite" });
  const pairBtn = el(
    "button",
    {
      class: "btn btn-ghost btn-sm",
      id: "pair-device",
      onClick: () => pairDevice(),
    },
    [icons.qr, "Pair device"],
  );
  const qrBox = el("div", { class: "qr-box" });
  const pairedBox = el(
    "div",
    { class: "paired-box" },
    [
      el("span", { html: icons.devices }),
      el("span", {}, "Paired with a device"),
    ],
  );
  qrBox.hidden = true;
  pairedBox.hidden = true;
  const syncPanel = el("div", { class: "panel sync-panel" }, [
    el("div", { class: "row", style: { justifyContent: "space-between" } }, [
      el("span", { class: "label" }, "session relay"),
      syncStatusPill,
    ]),
    el("div", { class: "row", style: { marginTop: "12px" } }, [pairBtn]),
    qrBox,
    pairedBox,
    syncLog,
  ]);
  const syncSection = el("section", { class: "section-gap" }, [
    el("p", { class: "section-label" }, "// pair"),
    syncPanel,
  ]);

  // ----- Scanner section (hidden until opened) -----
  const video = el("video", {
    ariaLabel: "Camera preview for QR scanning",
  }) as HTMLVideoElement;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;

  const reticle = el("div", { class: "scanner-reticle" });
  const overlay = el("div", { class: "scanner-overlay" }, reticle);
  const viewport = el("div", { class: "scanner-viewport" }, [video, overlay]);

  const stopBtn = el(
    "button",
    { class: "btn btn-danger", onClick: () => closeScanner() },
    [icons.stop, "Stop"],
  );

  const cameraSelect = el("select", {
    ariaLabel: "Choose camera",
    style: { maxWidth: "200px" },
    onChange: (e) => switchCamera((e.target as HTMLSelectElement).value),
  });

  const statusPill = el(
    "span",
    { class: "pill", dataset: { status: "idle" } },
    [el("span", { class: "dot" }), "Idle"],
  );

  const errorPar = el("p", {
    style: { marginTop: "12px", fontSize: "12px", color: "var(--danger)" },
  });

  const scannerControls = el("div", { class: "row", style: { marginTop: "16px" } }, [
    stopBtn,
    statusPill,
    cameraSelect,
  ]);

  const scannerPanel = el("div", { class: "panel" }, [
    viewport,
    scannerControls,
    errorPar,
  ]);
  const scannerSection = el("section", { id: "scanner", class: "section-gap" }, [
    el("p", { class: "section-label" }, "// scanner"),
    scannerPanel,
  ]);
  scannerSection.hidden = true;

  // ----- Results section -----
  const countSpan = el("span", { ariaLive: "polite" });
  const resultsHeading = el("p", { class: "section-label" }, ["// results ", countSpan]);

  const exportCsvBtn = el(
    "button",
    {
      class: "btn btn-ghost btn-sm",
      onClick: () => downloadCsv(state.records),
    },
    [icons.download, "CSV"],
  );
  const exportTxtBtn = el(
    "button",
    {
      class: "btn btn-ghost btn-sm",
      onClick: () => downloadTxt(state.records),
    },
    [icons.download, "TXT"],
  );
  const copyBtn = el(
    "button",
    {
      class: "btn btn-ghost btn-sm",
      onClick: async () => {
        const ok = await copyResults(state.records);
        flashBtn(copyBtn, ok ? "Copied" : "Failed");
      },
    },
    [icons.clipboard, "Copy"],
  );
  const clearBtn = el(
    "button",
    {
      class: "btn btn-ghost btn-sm",
      ariaLabel: "Clear all results",
      onClick: () => clearAll(),
    },
    [icons.trash, "Clear"],
  );
  const resultsActions = el("div", { class: "row" }, [
    exportCsvBtn,
    exportTxtBtn,
    copyBtn,
    clearBtn,
  ]);
  resultsActions.hidden = true;

  const resultsHeader = el(
    "div",
    { class: "row", style: { justifyContent: "space-between", marginBottom: "12px" } },
    [resultsHeading, resultsActions],
  );

  const emptyState = el(
    "div",
    { class: "ghost-row" },
    [
      el("span", { class: "ghost-cell ghost-num" }, "—"),
      el("span", { class: "ghost-cell ghost-time" }, "00:00:00"),
      el("span", { class: "ghost-cell" }, "type"),
      el("span", { class: "ghost-cell ghost-content" }, "scanned content appears here"),
      el("span", { class: "ghost-cell" }, ""),
    ],
  );

  const tableWrap = el("div", { class: "panel results-scroll" });
  tableWrap.hidden = true;

  const resultsSection = el("section", { class: "page-enter section-gap" }, [
    resultsHeader,
    emptyState,
    tableWrap,
  ]);

  const main = el("main", {}, [
    hero,
    syncSection,
    scannerSection,
    resultsSection,
  ]);

  root.append(header, main);

  // ----- State mutations -----
  function addScan(parsed: ParsedQr): void {
    const record: ScanRecord = {
      id: newId(),
      timestamp: Date.now(),
      parsed,
    };
    state.records.unshift(record);
    renderResults();
    flashReticle();
  }

  function flashReticle(): void {
    viewport.classList.add("is-hit");
    setTimeout(() => viewport.classList.remove("is-hit"), 220);
  }

  function flashBtn(btn: HTMLButtonElement, label: string): void {
    const original = btn.innerHTML;
    btn.innerHTML = "";
    btn.append(document.createTextNode(label));
    setTimeout(() => {
      btn.innerHTML = original;
    }, 1200);
  }

  function removeRecord(id: string): void {
    state.records = state.records.filter((r) => r.id !== id);
    renderResults();
  }

  function clearAll(): void {
    state.records = [];
    renderResults();
  }

  function renderResults(): void {
    countSpan.textContent = state.records.length > 0 ? `(${state.records.length})` : "";
    const has = state.records.length > 0;
    resultsActions.hidden = !has;
    emptyState.hidden = has;
    tableWrap.hidden = !has;
    if (!has) {
      clear(tableWrap);
      return;
    }
    const table = el("table", {}, [
      el("thead", {}, el("tr", {}, [
        el("th", {}, "#"),
        el("th", {}, "Time"),
        el("th", {}, "Type"),
        el("th", {}, "Content"),
        el("th", { style: { width: "1px" } }),
      ])),
      el("tbody", {}, state.records.map((r, i) => makeRow(r, i))),
    ]);
    clear(tableWrap);
    tableWrap.append(table);
  }

  function makeRow(r: ScanRecord, index: number): HTMLTableRowElement {
    const removeBtn = el(
      "button",
      {
        class: "btn btn-ghost btn-sm",
        ariaLabel: "Remove this result",
        onClick: () => removeRecord(r.id),
        style: { padding: "4px 8px", minHeight: "auto" },
      },
      icons.close,
    );
    const row = el("tr", { class: "row-enter" }, [
      el("td", {}, String(state.records.length - index)),
      el("td", { style: { whiteSpace: "nowrap" } }, new Date(r.timestamp).toLocaleTimeString()),
      el("td", {}, el("span", { class: "type-tag", dataset: { type: r.parsed.type } }, describeType(r.parsed.type))),
      el("td", {}, summarize(r.parsed)),
      el("td", {}, removeBtn),
    ]);
    return row;
  }

  function setStartButton(label: string, disabled: boolean): void {
    startBtn.disabled = disabled;
    startBtn.innerHTML = "";
    startBtn.insertAdjacentHTML("beforeend", icons.camera);
    startBtn.append(document.createTextNode(label));
  }

  // ----- Scanner -----
  async function openScanner(): Promise<void> {
    scannerSection.hidden = false;
    scannerSection.classList.add("scanner-enter");
    setStartButton("Starting", true);
    state.scanHandle = await startCamera(
      video,
      (text, parsed) => {
        // A scan of sweep's own join URL pairs instead of recording.
        // Other QRs scan normally.
        if (joinFromScan(text)) return;
        addScan(parsed);
      },
      (msg) => {
        state.errorMsg = msg;
        errorPar.textContent = msg;
        setStartButton("Start camera", false);
      },
      (s) => {
        updateStatus(s);
        if (s === "scanning") setStartButton("Scanning", true);
        else if (s === "idle" || s === "error") setStartButton("Start camera", false);
      },
      currentDeviceId,
    );
    // populate camera select after permission
    const cams = await enumerateCameras();
    if (cams.length > 1) {
      clear(cameraSelect);
      cameraSelect.append(
        ...cams.map((c) => {
          const opt = el("option", { value: c.deviceId }, c.label || `Camera ${c.deviceId.slice(0, 6)}`);
          return opt;
        }),
      );
    }
    setTimeout(() => scannerSection.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  function closeScanner(): void {
    state.scanHandle?.stop();
    state.scanHandle = null;
    scannerSection.hidden = true;
    setStartButton("Start camera", false);
    errorPar.textContent = "";
  }

  function switchCamera(deviceId: string): void {
    if (!deviceId || deviceId === currentDeviceId) return;
    currentDeviceId = deviceId;
    if (state.scanHandle) {
      state.scanHandle.stop();
      state.scanHandle = null;
      openScanner();
    }
  }

  function updateStatus(s: ScanStatus): void {
    state.status = s;
    statusPill.dataset.status = s;
    const label = s === "scanning" ? "Scanning" : s === "error" ? "Error" : s === "starting" ? "Starting" : "Idle";
    clear(statusPill);
    statusPill.append(el("span", { class: "dot" }), document.createTextNode(label));
  }

  // ----- File upload -----
  async function handleFiles(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!files.length) return;
    for (const file of files) {
      try {
        const parsed = await decodeImageFile(file);
        if (parsed) addScan(parsed);
      } catch {
        /* skip unreadable file */
      }
    }
  }

  // ----- Base64 dialog -----
  function openBase64(): void {
    const dialog = el("dialog", {}, [
      el("h2", { style: { marginBottom: "8px" } }, "Paste base64 image"),
      el("p", { style: { fontSize: "13px", color: "var(--muted)", marginBottom: "16px" } }, "Paste a base64-encoded image string."),
    ]);
    const ta = el("textarea", { ariaLabel: "Base64 image text" });
    const close = () => {
      dialog.close();
      dialog.remove();
      base64Btn.focus();
    };
    const decodeBtn = el(
      "button",
      {
        class: "btn",
        onClick: async () => {
          const text = ta.value;
          if (!text.trim()) return;
          decodeBtn.disabled = true;
          decodeBtn.textContent = "Decoding";
          try {
            const parsed = await decodeBase64Image(text);
            if (parsed) {
              addScan(parsed);
              close();
            } else {
              err.textContent = "No QR code found in that image.";
            }
          } catch {
            err.textContent = "Could not read that base64 image.";
          } finally {
            decodeBtn.disabled = false;
            decodeBtn.innerHTML = "";
            decodeBtn.append(document.createTextNode("Decode"));
          }
        },
      },
      "Decode",
    );
    const cancelBtn = el("button", { class: "btn btn-ghost", onClick: close }, "Cancel");
    const err = el("p", { style: { fontSize: "12px", color: "var(--danger)", marginTop: "8px" } });
    const btnRow = el("div", { class: "row", style: { justifyContent: "flex-end", marginTop: "16px" } }, [cancelBtn, decodeBtn]);
    dialog.append(ta, btnRow, err);
    document.body.append(dialog);
    dialog.showModal();
    ta.focus();
    on(dialog, "cancel", close);
  }

  // ----- Paste URL dialog -----
  function openPasteUrl(): void {
    const dialog = el("dialog", {}, [
      el("h2", { style: { marginBottom: "8px" } }, "Paste image URL"),
      el("p", { style: { fontSize: "13px", color: "var(--muted)", marginBottom: "16px" } }, "Paste a direct image URL. sweep fetches and decodes it."),
    ]);
    const input = el("input", {
      type: "url",
      ariaLabel: "Image URL",
      placeholder: "https://example.com/qr.png",
    });
    const close = () => {
      dialog.close();
      dialog.remove();
      pasteUrlBtn.focus();
    };
    const decodeBtn = el(
      "button",
      {
        class: "btn",
        onClick: async () => {
          const url = input.value.trim();
          if (!url) return;
          decodeBtn.disabled = true;
          decodeBtn.textContent = "Fetching";
          try {
            const parsed = await decodeImageUrl(url);
            if (parsed) {
              addScan(parsed);
              close();
            } else {
              err.textContent = "No QR code found in that image.";
            }
          } catch {
            err.textContent = "Could not fetch that image. Some sites block cross-origin requests.";
          } finally {
            decodeBtn.disabled = false;
            decodeBtn.innerHTML = "";
            decodeBtn.append(document.createTextNode("Decode"));
          }
        },
      },
      "Decode",
    );
    const cancelBtn = el("button", { class: "btn btn-ghost", onClick: close }, "Cancel");
    const err = el("p", { style: { fontSize: "12px", color: "var(--danger)", marginTop: "8px" } });
    const btnRow = el("div", { class: "row", style: { justifyContent: "flex-end", marginTop: "16px" } }, [cancelBtn, decodeBtn]);
    dialog.append(input, btnRow, err);
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
    on(dialog, "cancel", close);
  }

  // ----- Session sync -----
  let syncHandle: SyncHandle | null = null;
  // Which pairing panel to show:
  //   waiting — host's QR is up, waiting for the first peer
  //   paired  — the session reached 1:1, show "Paired with a device"
  //   ended   — the peer left (or this socket was rejected): nothing to
  //             show — the session is ephemeral, the user re-pairs
  //   idle    — no pairing panel shown
  let pairState: "idle" | "waiting" | "paired" | "ended" = "idle";

  function setSyncStatus(status: SyncStatus): void {
    syncStatusPill.dataset.status = status;
    const label =
      status === "connected"
        ? "Connected"
        : status === "connecting"
          ? "Connecting"
          : status === "closed"
            ? "Disconnected"
            : "Off";
    clear(syncStatusPill);
    syncStatusPill.append(el("span", { class: "dot" }), document.createTextNode(label));
  }

  function renderPairPanel(): void {
    qrBox.hidden = pairState !== "waiting";
    pairedBox.hidden = pairState !== "paired";
  }

  function logSync(text: string): void {
    const line = el("div", { class: "sync-line" }, text);
    syncLog.append(line);
    syncLog.scrollTop = syncLog.scrollHeight;
  }

  function handleSyncMessage(message: SyncMessage): void {
    if (message.type === "hello") {
      logSync(`hello from ${String(message.peerId).slice(0, 8)}`);
      // A peer's hello proves the session reached 1:1 even if the relay's
      // peer-joined notification raced ahead of us.
      pairState = "paired";
      renderPairPanel();
    } else if (message.type === "peer-joined") {
      // The relay announces the session reached 1:1 (second socket
      // accepted). Reliable in both connection orders, so the host's QR
      // auto-hides even when the peer connected first.
      pairState = "paired";
      logSync("peer joined — session is 1:1");
      renderPairPanel();
    } else if (message.type === "peer-left") {
      // The other device disconnected (its socket closing is not visible
      // locally). The session is ephemeral — no reconnect, re-pair instead.
      pairState = "ended";
      logSync("peer left — session ended");
      renderPairPanel();
    }
  }

  function startSync(sessionId: string): void {
    if (syncHandle) syncHandle.close();
    pairState = "idle";
    clear(syncLog);
    setSyncStatus("connecting");
    renderPairPanel();
    syncHandle = connectSession(sessionId, {
      onMessage: handleSyncMessage,
      onStatus: setSyncStatus,
      onRejected: (code, reason) => {
        logSync(`rejected (${code}): ${reason} — this session already has two devices`);
        pairState = "ended";
        renderPairPanel();
      },
    });
    logSync(`joined session ${sessionId.slice(0, 8)}`);
  }

  // Join a session from a scanned join URL. Returns true when the URL was
  // a sweep join URL and a join was initiated, false otherwise.
  function joinFromScan(raw: string): boolean {
    const parsed = parseJoinUrl(raw, window.location.origin);
    if (!parsed) return false;
    startSync(parsed.sessionId);
    // #3 (crypto) will read parsed.extra.k here to encrypt the session.
    closeScanner();
    logSync(`joined session from scan: ${parsed.sessionId.slice(0, 8)}`);
    return true;
  }

  function pairDevice(): void {
    const sessionId = crypto.randomUUID();
    startSync(sessionId);
    const url = joinUrl(sessionId);
    clear(qrBox);
    const svg = el("div", { class: "qr-svg" });
    svg.append(renderQrSvg(url));
    qrBox.append(
      svg,
      el("p", { class: "qr-hint" }, "scan with sweep on another device"),
    );
    pairState = "waiting";
    renderPairPanel();
    logSync(`share this link to pair: ${url}`);
  }

  // Auto-join a session from the URL (?s=<session-id>).
  const urlSessionId = sessionIdFromUrl();
  if (urlSessionId) startSync(urlSessionId);

  renderResults();
}
