// app.js – Main controller for OPM Viewer (pure JS version)
// Developer Console + progress bar + full-diagram printing.
// Includes real fix for zoom blur by watching zoomFactor.

var diagram, diagramView;

document.addEventListener("DOMContentLoaded", function () {
  if (typeof MindFusion === "undefined" || !MindFusion.Diagramming) {
    console.error("❌ MindFusion not found. Check libs/MindFusion.Diagramming.js path.");
    return;
  }
  console.log("✅ MindFusion loaded successfully:", MindFusion);

  var Diagramming = MindFusion.Diagramming;
  var Graphs = MindFusion.Graphs;
  var DiagramView = Diagramming.DiagramView;
  var LayeredLayout = Graphs.LayeredLayout;

  // === Canvas setup ===
  const canvas = document.getElementById("canvasContainer");
  diagramView = DiagramView.create(canvas);
  diagram = diagramView.diagram;
  diagramView.behavior = MindFusion.Diagramming.Behavior.MoveNodes;

  // --- Real fix for zoom blur ---
  (function watchZoomChanges() {
    let lastZoom = diagramView.zoomFactor;
    function tick() {
      const currentZoom = diagramView.zoomFactor;
      if (currentZoom !== lastZoom) {
        lastZoom = currentZoom;
        diagram.repaint();
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();

  // --- Dynamic crisp resizing (no CSS stretch) ---
  function resizeDiagramCanvas() {
    const zoomWidth = 100; // reserve horizontal space for zoom control
    const consoleHeight = 120; // reserve vertical space for debug console
    const deviceRatio = window.devicePixelRatio || 1;

    const wrapper = document.getElementById("canvasWrapper");
    const wrapperRect = wrapper.getBoundingClientRect();

    const newWidth = wrapperRect.width - zoomWidth;
    const newHeight = window.innerHeight - consoleHeight - wrapperRect.top - 20;

    // Set both internal buffer size and CSS size (avoid blur)
    canvas.width = newWidth * deviceRatio;
    canvas.height = newHeight * deviceRatio;
    canvas.style.width = newWidth + "px";
    canvas.style.height = newHeight + "px";

    // Keep zoom proportional on HiDPI screens
    diagramView.zoomFactor = 100 * deviceRatio;

    // Redraw / arrange as needed
    diagram.resizeToFitItems(20, false, true);
  }

 // window.addEventListener("resize", resizeDiagramCanvas);
  //resizeDiagramCanvas();

  // === Zoom Control ===
  const zoomCanvas = document.getElementById("zoomCanvas");
  zoomCanvas.width = 70;
  zoomCanvas.height = 250;

  const ZoomControl = MindFusion.Controls.ZoomControl;
  const zoomControl = ZoomControl.create(zoomCanvas);
  zoomControl.target = diagramView;
  zoomControl.rounded = true;
  zoomControl.allowPan = true;
  zoomControl.showZoomFactor = true;
  zoomControl.borderColor = "transparent";
  zoomControl.backColor = "transparent";
  zoomControl.fill = "#3c64a0";

  diagram.arrange(new LayeredLayout());
  diagram.resizeToFitItems();
  console.log("✅ Diagram initialized.");

  // === File Upload ===
  const fileInput = document.getElementById("fileInput");
  const fileNameSpan = document.getElementById("fileName");

  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    fileNameSpan.textContent = file.name;

    if (file.name.toLowerCase().endsWith(".zip")) {
      await handleZipFile(file);
    } else {
      console.warn("Unsupported file type:", file.name);
    }
  });

  // === Layout Selector ===
  const layoutSelect = document.getElementById("layoutSelect");
  const applyLayoutBtn = document.getElementById("applyLayoutBtn");

  if (layoutSelect && applyLayoutBtn) {
    applyLayoutBtn.addEventListener("click", () => {
      const choice = layoutSelect.value;
      try {
        const layout = new Graphs[choice]();

        if ("direction" in layout)
          layout.direction = Graphs.LayoutDirection.TopToBottom;
        if ("linkType" in layout)
          layout.linkType = Graphs.TreeLayoutLinkType.Cascading;
        if ("nodeDistance" in layout) layout.nodeDistance = 25;
        if ("levelDistance" in layout) layout.levelDistance = 45;

        diagram.arrange(layout);
        diagram.resizeToFitItems(0, false, true);
        console.log(`[Layout] Applied ${choice}.`);
      } catch (err) {
        console.error("❌ Failed to apply layout:", err);
      }
    });
  }

  // === PDF Export (print full diagram) ===
  const exportPdfBtn = document.getElementById("exportPdfBtn");

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", () => {
      try {
        // --- Ensure the diagram fits all items ---
        diagram.resizeToFitItems(20, false, true);

        const contentBounds = diagram.getContentBounds();
        const printPadding = 16;
        const printArea = new MindFusion.Drawing.Rect(
          contentBounds.x - printPadding,
          contentBounds.y - printPadding,
          contentBounds.width + printPadding * 2,
          contentBounds.height + printPadding * 2
        );
        const pageSize = {
          width: Math.max(1, Math.ceil(printArea.width)),
          height: Math.max(1, Math.ceil(printArea.height))
        };

        // --- Use MindFusion's built-in print (full diagram) ---
        diagramView.print({
          printArea: printArea,
          pageSize: pageSize,
          margin: 0,
          scaleMode: "FitToPage",
          background: true,
          title: "OPM Viewer Export"
        });

        console.log(
          "🖨️ Print preview opened. Use 'Save as PDF' to export the full diagram."
        );
      } catch (err) {
        console.error("❌ PDF export failed:", err);
        alert("Unable to print or export. Check console for details.");
      }
    });
  }
});

// === Worker ZIP handling ===
async function handleZipFile(file) {
  console.log("📦 Reading ZIP:", file.name);
  showStatusBar();

  const worker = new Worker("worker.js");

  // === Developer Console elements (optional, harmless if absent) ===
  const consoleBox = document.getElementById("consoleContent");
  const clearBtn = document.getElementById("clearConsoleBtn");

  function appendStatusLine(text) {
    if (!consoleBox) return;
    const line = document.createElement("div");
    line.textContent = text;
    consoleBox.appendChild(line);
    while (consoleBox.children.length > 80) {
      consoleBox.removeChild(consoleBox.firstChild);
    }
    consoleBox.parentElement.scrollTop = consoleBox.parentElement.scrollHeight;
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      consoleBox.innerHTML = "";
    });
  }

  // --- Unified worker message handler (no invented API) ---
  worker.onmessage = (e) => {
    const { type, text, current, total, data, message } = e.data;

    if (type === "progress") {
      if (typeof appendStatusLine === "function") {
        appendStatusLine(`[worker] ${text} (${current || 0}/${total || 0})`);
      }
      updateStatusBar(text, current, total);
      return;
    }

    if (type === "complete") {
      if (typeof appendStatusLine === "function") {
        appendStatusLine("[worker] ✅ Parsing complete.");
      }
      hideStatusBar();

      if (data && typeof renderDiagram === "function") {
        renderDiagram(diagram, diagramView, data);
      }
      return;
    }

    if (type === "error") {
      if (typeof appendStatusLine === "function") {
        appendStatusLine(`[worker] ❌ ${message}`);
      }
      hideStatusBar();
      return;
    }

    if (typeof appendStatusLine === "function") {
      appendStatusLine(`[worker] ${JSON.stringify(e.data)}`);
    }
  };

  worker.onerror = (err) => {
    console.error("❌ Worker script error:", err.message);
    hideStatusBar();
  };

  worker.postMessage({ fileData: await file.arrayBuffer() });
}

// === Status bar helpers ===
function showStatusBar() {
  document.getElementById("statusOverlay").style.display = "block";
  updateStatusBar("Initializing...", 0, 1);
}
function updateStatusBar(text, current, total) {
  const percent = Math.min(100, Math.round((current / total) * 100));
  document.getElementById("statusText").textContent = `${text} (${percent}%)`;
  document.getElementById("statusFill").style.width = percent + "%";
}
function hideStatusBar() {
  document.getElementById("statusOverlay").style.display = "none";
}
