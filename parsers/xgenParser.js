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
      const files = folder.file(/\.xgen$/i) || [];
      for (const file of files) {
        const lower = file.name?.toLowerCase?.() ?? "";
        if (lower.endsWith(".ref.xgen")) continue;

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
function processXgenFile(xmlText, fileName, result) {
  try {
    const xml = parseXmlString(xmlText);
    if (!xml) return;

    // Try to determine entity name for this file
    let entityName = null;

    // 1️⃣ Look for explicit <entity> tag
    const entityNodes = xml.getElementsByTagName("entity");
    if (entityNodes && entityNodes.length > 0) {
      const firstEntity = entityNodes[0];
      entityName =
        firstEntity.getAttribute("name") ||
        firstEntity.getAttribute("id") ||
        firstEntity.getAttribute("ref");
    }

    // 2️⃣ Fallback to global if not found
    if (!entityName || entityName === "UnknownEntity") {
      entityName = "global";
    }

    // Collect attributes
    const attrNodes = xml.getElementsByTagName("attribute");
    if (!attrNodes || attrNodes.length === 0) {
      console.warn(`[xgenParser] No <attribute> nodes in ${fileName}`);
      return;
    }

    const attrs = [];
    for (let i = 0; i < attrNodes.length; i++) {
      const node = attrNodes[i];
      const baseText =
        node.getElementsByTagName("base")?.[0]?.textContent?.trim() ?? "";
      if (!baseText) continue;

      const id = node.getAttribute("name") ?? "";
      const type = node.getAttribute("type") ?? "text";

      const attr = {
        id,
        type,
        baseText,
        publicName: "no public name",
        isDocumentAttribute: true,
      };

      attrs.push(attr);
    }

    if (attrs.length > 0) {
      if (!result.has(entityName)) result.set(entityName, []);
      result.get(entityName).push(...attrs);
      console.log(
        `[xgenParser] Parsed ${attrs.length} attributes for entity "${entityName}"`
      );
    }
  } catch (err) {
    console.warn("[xgenParser] Failed to parse XGEN file:", err);
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
