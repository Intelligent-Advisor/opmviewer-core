// diagramRenderer.js
// Renders entities, enums, functions, and decision services (.ref files)
// Adds color coding, auto-linking, and italic text for XGEN-only attributes.

window.renderDiagram = function (diagram, diagramView, data) {
  const { entities, relationships, enumerations, customFunctions, services } = data || {};
  if (!entities || entities.length === 0) {
    console.warn("[diagramRenderer] No entities to render.");
    return;
  }

  const { Diagramming, Drawing, Graphs } = MindFusion;
  const TableNode = Diagramming.TableNode;

  diagram.clearAll();
  const entityMap = new Map();

  // === ENTITIES / FUNCTIONS / ENUMS ===
  entities.forEach((entity, i) => {
    const node = new TableNode(diagram);
    node.bounds = new Drawing.Rect(0, 0, 340, 80);
    node.text = entity.name || `Entity ${i + 1}`;

    // --- Determine node type for coloring ---
    const isFunction = Array.isArray(customFunctions)
      ? customFunctions.some((f) => f.parentEntity?.trim() === entity.name.trim())
      : false;

    const isEnum = enumerations && enumerations[entity.id];
    const enumObj = isEnum ? enumerations[entity.id] : null;
    const isNestedEnum = enumObj && enumObj.childEnumId;

    if (isFunction) {
      node.brush = "#eef7f5"; node.captionBackBrush = "#347a5e";
    } else if (isNestedEnum) {
      node.brush = "#fff3d6"; node.captionBackBrush = "#d29300";
    } else if (isEnum) {
      node.brush = "#f9f5ef"; node.captionBackBrush = "#b48b48";
    } else {
      node.brush = "#ffffff"; node.captionBackBrush = "#3c64a0";
    }

    node.shadowOffsetX = 2; node.shadowOffsetY = 2; node.shadowColor = "#aaa";

    const attrCount = Array.isArray(entity.attributes) ? entity.attributes.length : 0;
    node.redimTable(3, attrCount + 1);
    const headers = ["Text", "Type", "Public Name"];
    for (let c = 0; c < 3; c++) {
      const h = node.getCell(c, 0);
      if (h) { h.text = headers[c]; h.brush = node.captionBackBrush; h.textColor = "#fff"; }
    }

    // === Attribute rows ===
    if (attrCount > 0) {
      for (let r = 0; r < attrCount; r++) {
        const attr = entity.attributes[r];
        const baseText = (attr?.baseText || "").trim();
        const type = (attr?.type || "").trim();
        const publicName =
          attr?.publicName && attr.publicName.trim().length > 0
            ? attr.publicName.trim()
            : "No Public Name";

        const c0 = node.getCell(0, r + 1);
        const c1 = node.getCell(1, r + 1);
        const c2 = node.getCell(2, r + 1);

        if (c0) c0.text = baseText;
        if (c1) c1.text = type;
        if (c2) c2.text = publicName;

        // --- Italicize XGEN-only attributes ---
        if (attr.isDocumentAttribute === true) {
          [c0, c1, c2].forEach((cell) => {
            if (cell) {
              cell.font = new Drawing.Font("Arial", 4, false, true, false, false);
            }
          });
        }
      }
    }

    node.resizeToFitText(false, false);
    diagram.addItem(node);

    const key =
      (entity.id?.trim()) || (entity.ref?.trim()) || (entity.name?.trim()) || "global";
    entityMap.set(key, node);
  });

  // === ENUMS ===
  if (enumerations && Object.keys(enumerations).length > 0) {
    Object.values(enumerations).forEach((enumObj, idx) => {
      const node = new TableNode(diagram);
      node.bounds = new Drawing.Rect(0, 0, 260, 60);
      node.text = `${enumObj.name || `Enum ${idx + 1}`} (${enumObj.type || "text"})`;
      const isNestedEnum = !!enumObj.childEnumId;
      node.brush = isNestedEnum ? "#fff3d6" : "#f9f5ef";
      node.captionBackBrush = isNestedEnum ? "#d29300" : "#b48b48";
      node.shadowOffsetX = 2; node.shadowOffsetY = 2; node.shadowColor = "#aaa";

      const values = enumObj.values || [];
      node.redimTable(1, Math.min(values.length, 100) + 1);
      const header = node.getCell(0, 0);
      if (header) { header.text = "Values"; header.brush = node.captionBackBrush; header.textColor = "#fff"; }

      for (let r = 0; r < Math.min(values.length, 100); r++) {
        node.getCell(0, r + 1).text = values[r].value || "";
      }

      node.resizeToFitText(false, false);
      diagram.addItem(node);
      entityMap.set(enumObj.id, node);
    });

    Object.values(enumerations).forEach((enumObj) => {
      if (enumObj.childEnumId) {
        const src = entityMap.get(enumObj.id);
        const tgt = entityMap.get(enumObj.childEnumId);
        if (src && tgt) {
          const link = diagram.factory.createDiagramLink(src, tgt);
          link.text = "Child Enum"; link.pen = "#888"; link.textBrush = "#444";
        }
      }
    });
  }

  // === DECISION SERVICE (.ref) NODES ===
  if (Array.isArray(services) && services.length > 0) {
    services.forEach((svc, i) => {
      const rows = svc.schemaRows || [];
      const node = new TableNode(diagram);
      node.bounds = new Drawing.Rect(0, 0, 480, 80);
      node.text = svc.name || `Decision Service ${i + 1}`;
      node.brush = "#edf1fc"; node.captionBackBrush = "#415db4";
      node.shadowOffsetX = 2; node.shadowOffsetY = 2; node.shadowColor = "#aaa";

      node.redimTable(3, Math.max(rows.length, 1) + 1);
      const headers = ["Direction", "Item", "Details"];
      for (let c = 0; c < 3; c++) {
        const h = node.getCell(c, 0);
        if (h) { h.text = headers[c]; h.brush = node.captionBackBrush; h.textColor = "#fff"; }
      }

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const indent = row.item?.startsWith("(") ? "   " : "";
        node.getCell(0, r + 1).text = row.direction || "";
        node.getCell(1, r + 1).text = `${indent}${row.item || ""}`;
        node.getCell(2, r + 1).text = row.details || "";
      }

      node.resizeToFitText(false, false);
      diagram.addItem(node);
      entityMap.set(svc.name, node);
    });
  }

  // === RELATIONSHIPS (standard) ===
  if (Array.isArray(relationships)) {
    relationships.forEach((rel) => {
      const src = entityMap.get(rel.source);
      const tgt = entityMap.get(rel.target);
      if (src && tgt) {
        const link = diagram.factory.createDiagramLink(src, tgt);
        const relName = (rel.text || "").trim();
        const relType = (rel.type || "").trim();
        link.text =
          relName && relType
            ? `${relName} (${relType})`
            : relName || relType || "";
        link.pen = "#666"; link.textBrush = "#444";
      }
    });
  }

  // === AUTO-LINK Decision Services → Entities ===
  if (Array.isArray(services)) {
    services.forEach((svc) => {
      const srcNode = entityMap.get(svc.name);
      if (!srcNode) return;
      (svc.schemaRows || []).forEach((row) => {
        const opaName = row.details?.match(/\(([^)]+)\)/)?.[1]?.trim();
        if (!opaName) return;

        const tgtEntity = entities.find((e) =>
          e.attributes?.some(
            (a) =>
              a.baseText?.trim() === opaName ||
              a.publicName?.trim() === opaName
          )
        );
        if (tgtEntity) {
          const tgtNode =
            entityMap.get(tgtEntity.id) || entityMap.get(tgtEntity.name);
          if (tgtNode) {
            const link = diagram.factory.createDiagramLink(srcNode, tgtNode);
            link.text = row.direction === "Input" ? "uses" : "produces";
            link.pen = "#4169e1";
            link.textBrush = "#4169e1";
          }
        }
      });
    });
  }

  // === AUTO-LINK Entities → Enums ===
  entities.forEach((entity) => {
    (entity.attributes || []).forEach((attr) => {
      if (attr.enumRef && entityMap.has(attr.enumRef)) {
        const srcNode = entityMap.get(entity.id) || entityMap.get(entity.name);
        const tgtNode = entityMap.get(attr.enumRef);
        if (srcNode && tgtNode) {
          const enumName =
            (enumerations?.[attr.enumRef]?.name || tgtNode.text || attr.enumRef || "").trim();
          const attrText =
            (attr.baseText || attr.publicName || attr.type || "attribute").trim();
          const link = diagram.factory.createDiagramLink(srcNode, tgtNode);
          link.text = "uses enum";
          link.tooltip = `${attrText} uses enum ${enumName}`;
          link.pen = "#b48b48";
          link.textBrush = "#b48b48";
        }
      }
    });
  });

  // === Ensure Global node visible ===
  const globalNode =
    entityMap.get("global") || entityMap.get("Global") || entityMap.get("GLOBAL");
  if (globalNode) {
    const links = diagram.links.filter(
      (l) => l.origin === globalNode || l.destination === globalNode
    );
    if (links.length === 0) {
      globalNode.bounds = new Drawing.Rect(500, 40, 340, 80);
      globalNode.locked = true;
      console.warn("[diagramRenderer] Pinned global node to top center (no links).");
    }
  }

  // === Layout ===
  const layout = new Graphs.TreeLayout();
  layout.direction = Graphs.LayoutDirection.TopToBottom;
  layout.linkType = Graphs.TreeLayoutLinkType.Cascading;
  layout.nodeDistance = 25;
  layout.levelDistance = 45;
  diagram.arrange(layout);
  diagram.resizeToFitItems(0, false, true);

  console.log(
    `[diagramRenderer] Rendered ${entities.length} entities, ${Object.keys(enumerations || {}).length} enums, ${(services || []).length} services.`
  );
};
