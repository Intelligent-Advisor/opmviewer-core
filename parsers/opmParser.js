// opmParser.js
// Pure JS version of OPM Data Model parser (entities, relationships, custom functions)
// Ensures a 'global' entity is always created even if empty.

self.parseOpmDataModel = function (xmlText) {
  const xml = parseXmlString(xmlText);
  if (!xml) return { entities: [], relationships: [], customFunctions: [] };

  const entities = [];
  const relationships = [];
  const customFunctions = [];

  // --- Parse Entities ---
  const entityNodes = xml.getElementsByTagName("entity");
  for (let i = 0; i < entityNodes.length; i++) {
    const eNode = entityNodes[i];
    const entityRef = eNode.getAttribute("ref") || "";
    const isGlobalEntity = entityRef === "global";
    const entity = {
      id:
        eNode.getAttribute("id") ||
        entityRef || // handle <entity ref="global">
        `ent${i}`,
      name:
        (isGlobalEntity ? "global" : "") ||
        eNode.getAttribute("name") ||
        entityRef ||
        `Entity ${i + 1}`,
      attributes: [],
    };

    // --- Attributes ---
    const attrNodes = eNode.getElementsByTagName("attribute");
    for (let j = 0; j < attrNodes.length; j++) {
      const aNode = attrNodes[j];
      const attr = {
        id:
          aNode.getAttribute("id") ||
          aNode.getAttribute("name") ||
          `attr${j}`,
        type: aNode.getAttribute("type") || "text",
        baseText:
          aNode.getElementsByTagName("base")[0]?.textContent?.trim() || "",
        publicName: aNode.getAttribute("public-name") || "",
        enumRef:
          aNode.getElementsByTagName("enumeration-list")[0]?.getAttribute("ref-id") ||
          null,
      };
      entity.attributes.push(attr);
    }

    // --- Embedded Custom Functions ---
    const fnNodes = eNode.getElementsByTagName("custom-function");
    for (let f = 0; f < fnNodes.length; f++) {
      const fNode = fnNodes[f];
      const fnName = fNode.getAttribute("name") || `CustomFunction${f + 1}`;
      const returnAttr =
        fNode.getAttribute("return-attr-name") ||
        fNode.getAttribute("return-type") ||
        "";

      const argNodes = fNode.getElementsByTagName("argument");
      const args = [];
      for (let a = 0; a < argNodes.length; a++) {
        const aNode = argNodes[a];
        args.push({
          name: aNode.getAttribute("name") || `arg${a + 1}`,
          attrName: aNode.getAttribute("attr-name") || "",
        });
      }

      customFunctions.push({
        name: fnName,
        parentEntity: entity.name,
        returnAttr,
        arguments: args,
        type: "custom-function",
      });
    }

    // --- Always include entity, even if empty (e.g., global) ---
    if (!entity.name || entity.name.trim().length === 0) {
      entity.name = entity.id || `Entity ${i + 1}`;
    }
    entities.push(entity);
  }

  // --- Parse Relationships ---
  const relNodes = xml.getElementsByTagName("relationship");
  for (let i = 0; i < relNodes.length; i++) {
    const rNode = relNodes[i];
    relationships.push({
      id:
        rNode.getAttribute("relationship-id") ||
        rNode.getAttribute("id") ||
        `rel${i}`,
      source:
        rNode.getAttribute("source") ||
        rNode.getAttribute("source-entity-id") ||
        "",
      target:
        rNode.getAttribute("target") ||
        rNode.getAttribute("target-entity-id") ||
        "",
      type: rNode.getAttribute("type") || "",
      text: rNode.getAttribute("text") || "",
    });
  }

  // --- Guarantee presence of 'global' entity ---
  const hasGlobal = entities.some(
    (e) => e.id === "global" || e.name === "global"
  );
  if (!hasGlobal) {
    entities.unshift({
      id: "global",
      name: "global",
      attributes: [],
    });
    console.warn("[opmParser] Added missing global entity placeholder.");
  }

  console.log(
    `[opmParser] Parsed ${entities.length} entities, ${relationships.length} relationships, ${customFunctions.length} custom functions.`
  );

  return { entities, relationships, customFunctions };
};
