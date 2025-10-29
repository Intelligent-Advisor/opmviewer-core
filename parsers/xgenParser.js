// xgenParser.js
// Parses document attributes from .xgen files under /bin and subfolders.
// Handles both entity-scoped and global-scope XGEN files.
// Skips .ref.xgen and guards against empty or malformed entity nodes.

self.parseXgenAttributes = async function (zip) {
  const result = new Map();

  try {
    async function walk(folder, path) {
      if (!folder) return;

      // Find all .xgen files (except .ref.xgen)
      // Find all .xgen files (skip legacy .js.xgen and .ref.xgen)
const files = folder.file(/\.xgen$/i) || [];
for (const file of files) {
  const lower = file.name?.toLowerCase?.() ?? "";
  if (lower.endsWith(".ref.xgen") || lower.endsWith(".js.xgen")) continue;

        const xmlText = await file.async("text");
        processXgenFile(xmlText, file.name, result);
      }

      // Recurse into subfolders
      const subfolders = folder.folders ? Object.values(folder.folders) : [];
      for (const subfolder of subfolders) {
        if (!subfolder) continue;
        await walk(subfolder, `${path}/${subfolder.name || "unknown"}`);
      }
    }

    // Find the /bin folder within the ZIP
    const baseFolder = Object.keys(zip.files)
      .map((p) => p.split("/")[0])
      .find((n) => n && zip.folder(n)?.file("projectDataModel.xml"));

    const binFolder =
      (baseFolder && zip.folder(`${baseFolder}/bin`)) || zip.folder("bin");

    if (binFolder) await walk(binFolder, "bin");
    else console.warn("[xgenParser] No /bin folder found in ZIP.");
  } catch (err) {
    console.error("[xgenParser] Failed to scan ZIP:", err);
  }

  console.log(
    `[xgenParser] Completed. Parsed document attributes for ${result.size} entities.`
  );

  return result;
};

// --- Helper: Parse a single .xgen XML file and extract attributes ---
// --- Helper: Parse a single .xgen XML file and extract attributes ---
function processXgenFile(xmlText, fileName, result) {
  try {
    if (!xmlText || !xmlText.trim()) return;

    let xml;
    try {
      xml = parseXmlString(xmlText);
    } catch (err) {
      console.warn(`[xgenParser] Malformed or unreadable XGEN file skipped: ${fileName}`);
      return;
    }
    if (!xml || !xml.documentElement) return;

    // Find all <entity> elements under <entities>
    const entityNodes = xml.getElementsByTagName("entity");
    if (!entityNodes || entityNodes.length === 0) {
      console.warn(`[xgenParser] No <entity> nodes in ${fileName}`);
      return;
    }

    // Iterate through every <entity> block
    for (let i = 0; i < entityNodes.length; i++) {
      const eNode = entityNodes[i];

      const refVal  = eNode.getAttribute ? eNode.getAttribute("ref")  : "";
      const nameVal = eNode.getAttribute ? eNode.getAttribute("name") : "";
      const idVal   = eNode.getAttribute ? eNode.getAttribute("id")   : "";

      // Determine correct entity target
      let entityName = null;
      if (refVal && refVal.trim() === "global") {
        entityName = "global";
      } else if (nameVal && nameVal.trim()) {
        entityName = nameVal.trim();
      } else if (idVal && idVal.trim()) {
        entityName = idVal.trim();
      } else {
        continue; // ignore anonymous entities
      }

      // Collect only this entity's own <attribute> children
      const attributes = [];
      const attrNodes = eNode.getElementsByTagName("attribute");
      for (let j = 0; j < attrNodes.length; j++) {
        const aNode = attrNodes[j];
        const base =
          aNode.getElementsByTagName("base")?.[0]?.textContent?.trim() ||
          aNode.getAttribute("name") ||
          "";
        if (!base) continue;

        attributes.push({
          id: aNode.getAttribute("name") || "",
          type: aNode.getAttribute("type") || "text",
          baseText: base.trim(),
          publicName: "no public name",
          isDocumentAttribute: true
        });
      }

      if (attributes.length > 0) {
        if (!result.has(entityName)) result.set(entityName, []);
        result.get(entityName).push(...attributes);
        console.log(
          `[xgenParser] Parsed ${attributes.length} attributes for entity "${entityName}" (${fileName})`
        );
      }
    }
  } catch (err) {
    console.warn("[xgenParser] Failed to parse XGEN file:", fileName, err);
  }
}


// --- Helper (unchanged): Walk up the tree to find nearest <entity> ancestor ---
function findAncestorEntity(node) {
  let current = node.parentElement;
  while (current) {
    if (current.tagName === "entity") {
      const ref = current.getAttribute("ref");
      const name = current.getAttribute("name") || current.getAttribute("id");
      if (ref === "global") {
        current.setAttribute("name", "global");
        current.setAttribute("id", "global");
      } else if (name === "global" || name === "Global") {
        current.setAttribute("id", "global");
      }
      return current;
    }
    current = current.parentElement;
  }
  return null;
}
