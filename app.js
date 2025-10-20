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
  var canvas = document.getElementById("canvasContainer");
  const VIEW_WIDTH = 1200;
  const VIEW_HEIGHT = 740;
  canvas.width = VIEW_WIDTH;
  canvas.height = VIEW_HEIGHT;

  diagramView = DiagramView.create(canvas);
  diagram = diagramView.diagram;
  diagramView.behavior = MindFusion.Diagramming.Behavior.MoveNodes;

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

  // === PDF Export ===
  const exportPdfBtn = document.getElementById("exportPdfBtn");
  const pdfPageSize = document.getElementById("pdfPageSize");

  if (exportPdfBtn && pdfPageSize) {
    exportPdfBtn.addEventListener("click", async () => {
      const { jsPDF } = window.jspdf;
      const format = pdfPageSize.value || "a4";

      const canvasWrapper = document.getElementById("canvasWrapper") || document.body;
      const exportArea = document.getElementById("canvasContainer");

      try {
        const canvasImage = await html2canvas(exportArea, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true
        });

        const imgData = canvasImage.toDataURL("image/png");
        const pdf = new jsPDF({
          orientation: "landscape",
          unit: "mm",
          format
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const pxToMm = (px) => px * 0.264583;
        const imgWidth = pxToMm(canvasImage.width);
        const imgHeight = pxToMm(canvasImage.height);

        const ratio = Math.min(pageWidth / imgWidth, pageHeight / imgHeight, 1);
        const renderWidth = imgWidth * ratio;
        const renderHeight = imgHeight * ratio;

        const x = (pageWidth - renderWidth) / 2;
        const y = (pageHeight - renderHeight) / 2;

        pdf.addImage(imgData, "PNG", x, y, renderWidth, renderHeight);
        const filename = `OPM_Export_${format.toUpperCase()}.pdf`;
        pdf.save(filename);
        console.log(`✅ PDF exported: ${filename}`);
      } catch (err) {
        console.error("❌ PDF export failed:", err);
        alert("PDF export failed. Check console for details.");
      }
    });
  }
});

// === Worker ZIP handling ===
async function handleZipFile(file) {
  console.log("📦 Reading ZIP:", file.name);
  showStatusBar();

  const worker = new Worker("worker.js");
  worker.onmessage = (e) => {
    if (e.data.type === "progress") {
      updateStatusBar(e.data.text, e.data.current, e.data.total);
    } else if (e.data.type === "complete") {
      hideStatusBar();
      const data = e.data.data;
      console.log("Worker result:", data);

      if (typeof renderDiagram === "function") {
        renderDiagram(diagram, diagramView, data);
      } else {
        console.warn("[app.js] renderDiagram() not found.");
      }

      const { entities, enumerations, services, customFunctions } = data;
      const msg = [
        `Parsed ${entities.length} entities`,
        `${Object.keys(enumerations).length} enums`,
        `${services.length} services`,
        `${customFunctions?.length || 0} functions`
      ].join(", ");
      console.log("✅", msg);
    } else if (e.data.type === "error") {
      hideStatusBar();
      console.error("❌ Worker error:", e.data.message);
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
