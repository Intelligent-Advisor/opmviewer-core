// worker.js – background OPM ZIP parser (pure JS version)
// Combines OPM, ENUM, REF, and XGEN parsing, merges document attributes, and returns data for rendering.

importScripts(
  "libs/jszip.min.js",
  "libs/fast-xml-parser.js",
  "parsers/xml.js",
  "parsers/opmParser.js",
  "parsers/enumParser.js",
  "parsers/refParser.js",
  "parsers/xgenParser.js"
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

      for (const [entityName, attrs] of xgenAttributes.entries()) {
        console.log(`[worker] 🔍 Processing XGEN entity "${entityName}" with ${attrs.length} attributes`);

        const entity = result.entities.find(
          (e) =>
            e.name?.trim().toLowerCase() === entityName.trim().toLowerCase() ||
            e.id?.trim().toLowerCase() === entityName.trim().toLowerCase()
        );

        if (!entity) {
          console.warn(`[worker] ⚠️ No matching OPM entity found for "${entityName}"`);
          continue;
        }

        console.log(`[worker] ✅ Found matching OPM entity: "${entity.name}" (${entity.attributes?.length || 0} existing attributes)`);

        if (!entity.attributes) entity.attributes = [];

        const existingBaseTexts = new Set(
          entity.attributes
            .map((a) => a.baseText?.trim())
            .filter((t) => !!t)
        );

        for (const xAttr of attrs) {
          const baseText = xAttr.baseText?.trim();
          if (!baseText) {
            console.warn(`[worker] ⚠️ XGEN attribute missing baseText, skipping:`, xAttr);
            continue;
          }

          if (existingBaseTexts.has(baseText)) {
            console.log(`[worker] ⏩ Skipping duplicate attribute: "${baseText}"`);
            continue;
          }

          console.log(`[worker] ➕ Adding new XGEN attribute: "${baseText}" to "${entity.name}"`);

          // Mark new XGEN-only attribute
          xAttr.isDocumentAttribute = true;
          if (!xAttr.type) xAttr.type = "text";
          if (!xAttr.publicName) xAttr.publicName = "No Public Name";

          entity.attributes.push(xAttr);
          existingBaseTexts.add(baseText);
          mergedCount++;
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
