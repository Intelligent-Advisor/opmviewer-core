// enumParser.js
// Parses both flat and hierarchical OPM enumerations (compatible with fast-xml-parser DOM shim)

self.parseEnumerations = function (xmlText) {
  const xml = parseXmlString(xmlText);
  if (!xml) return {};

  const enumerations = {};
  const enumNodes = xml.getElementsByTagName("project-enum");

  for (let i = 0; i < enumNodes.length; i++) {
    const eNode = enumNodes[i];
    const id = eNode.getAttribute("id") || `enum${i}`;
    const name = eNode.getAttribute("name") || `Enum ${i + 1}`;
    const type = eNode.getAttribute("type") || "text";
    const childEnumId = eNode.getAttribute("child-enum-id") || null;
    const childEnumType = eNode.getAttribute("child-enum-type") || null;

    const valueNodes = eNode.getElementsByTagName("enum-val");
    const values = [];

    for (let j = 0; j < valueNodes.length; j++) {
      const vNode = valueNodes[j];
      const val = vNode.getAttribute("value") || "";
      const desc = vNode.getAttribute("description") || "";
      const uncertain = (vNode.getAttribute("is-uncertain") || "").toLowerCase() === "true";

      // Skip "uncertain" placeholder with no value
      if (uncertain && !val) continue;

      // --- Check for child hierarchy ---
      const childVals = [];
      const childNodes = vNode.getElementsByTagName("child-val");
      for (let k = 0; k < childNodes.length; k++) {
        const childVal = childNodes[k].textContent?.trim() || "";
        if (childVal) childVals.push(childVal);
      }

      values.push({
        value: val,
        description: desc,
        isUncertain: uncertain,
        childVals: childVals.length ? childVals : null
      });
    }

    enumerations[id] = {
      id,
      name,
      type,
      childEnumId,
      childEnumType,
      values
    };
  }

  // --- Logging summary ---
  const count = Object.keys(enumerations).length;
  console.log(`[enumParser] Parsed ${count} enumerations.`);

  // Identify hierarchical enums (for debugging / reference)
  const withChildren = Object.values(enumerations).filter((e) =>
    e.values.some((v) => v.childVals && v.childVals.length)
  );
  if (withChildren.length > 0) {
    console.log(
      `[enumParser] Found ${withChildren.length} hierarchical enumerations:`,
      withChildren.map((e) => e.name)
    );
  }

  return enumerations;
};
