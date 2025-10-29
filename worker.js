// worker.js – background OPM ZIP parser (pure JS version)
// Combines OPM, ENUM, REF, and XGEN parsing, merges document attributes, and returns data for rendering.

importScripts(
  "./libs/jszip.min.js",
  "./libs/fast-xml-parser.js",
  "./parsers/xml.js",
  "./parsers/opmParser.js",
  "./parsers/enumParser.js",
  "./parsers/refParser.js",
  "./parsers/xgenParser.js"
);

self.onmessage = async (e) => {
  try {
    const { fileData } = e.data;
    const zip = await JSZip.loadAsync(fileData);
    const entries = Object.keys(zip.files);
    const total = entries.length;
    let processed = 0;

    const result = {
      entities: [],
      relationships: [],
      customFunctions: [],
      enumerations: {},
      services: [],
    };

    // --- Parse projectDataModel.xml ---
    const dataModelPath = entries.find((f) =>
      f.toLowerCase().endsWith("projectdatamodel.xml")
    );
    if (dataModelPath) {
      const xmlText = await zip.files[dataModelPath].async("text");
      const opm = parseOpmDataModel(xmlText);
      result.entities = opm.entities;
      result.relationships = opm.relationships;
      result.customFunctions = opm.customFunctions || [];
      processed++;
      postMessage({
        type: "progress",
        text: "Parsed projectDataModel.xml",
        current: processed,
        total,
      });
    }

    // --- Parse projectEnumerations.xml ---
    const enumPath = entries.find((f) =>
      f.toLowerCase().endsWith("projectenumerations.xml")
    );
    if (enumPath) {
      const xmlText = await zip.files[enumPath].async("text");
      result.enumerations = parseEnumerations(xmlText);
      processed++;
      postMessage({
        type: "progress",
        text: "Parsed projectEnumerations.xml",
        current: processed,
        total,
      });
    }

    // --- Parse REF files (Decision Services) ---
    const refFiles = entries.filter(
      (f) =>
        f.toLowerCase().includes("/rules/") &&
        f.toLowerCase().endsWith(".ref")
    );
    if (refFiles.length) {
      const refs = await parseRefFiles(zip);
      result.services = refs;
      processed += refFiles.length;
      postMessage({
        type: "progress",
        text: "Parsed REF files",
        current: processed,
        total,
      });
    }

// --- Parse XGEN files (/bin/ document attributes) ---
try {
  const xgenAttributes = await parseXgenAttributes(zip);
  const entityNames = [...xgenAttributes.keys()];
  console.log(`[worker] XGEN parsed for ${entityNames.length} entities:`, entityNames);

  let mergedCount = 0;

  // --- Merge each XGEN entity or global section ---
  for (const [entityName, attrs] of xgenAttributes.entries()) {
    console.log(`[worker] 🔍 Processing XGEN entity "${entityName}" with ${attrs.length} attributes`);

    // Find exact case-sensitive match in OPM entities
    const target = result.entities.find(
      (e) => e.name?.trim() === entityName.trim()
    );

    if (!target) {
      console.warn(`[worker] ⚠️ No matching OPM entity found for "${entityName}"`);
      continue;
    }

    if (!target.attributes) target.attributes = [];

    const existingBaseTexts = new Set(
      target.attributes.map((a) => a.baseText?.trim()).filter(Boolean)
    );

    for (const xAttr of attrs) {
      const baseText = xAttr.baseText?.trim();
      if (!baseText) continue;

      // Skip if already present (case-sensitive)
      if (existingBaseTexts.has(baseText)) {
        console.log(`[worker] ⏩ Skipping duplicate attribute "${baseText}" in "${entityName}"`);
        continue;
      }

      // Add new XGEN-only attribute
      const newAttr = {
        ...xAttr,
        isDocumentAttribute: true,
        type: xAttr.type || "text",
        publicName: xAttr.publicName || "No Public Name",
      };

      target.attributes.push(newAttr);
      existingBaseTexts.add(baseText);
      mergedCount++;
      console.log(`[worker] ➕ Added "${baseText}" to "${target.name}"`);
    }
  }

  console.log(`[worker] ✅ XGEN merge complete — added ${mergedCount} new attributes.`);
  processed++;
  postMessage({
    type: "progress",
    text: "Merged XGEN document attributes",
    current: processed,
    total,
  });
} catch (err) {
  console.warn("[worker.js] ❌ XGEN parsing failed:", err);
}


    // --- Done ---
    postMessage({ type: "complete", data: result });
  } catch (err) {
    postMessage({ type: "error", message: err.message || String(err) });
    console.error("[worker.js] Unhandled error:", err);
  }
};
