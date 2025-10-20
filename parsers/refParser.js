// refParser.js
// Parses Decision Service .ref files into flat Input/Output schema rows
// Compatible with Web Worker + JSZip

self.parseRefFiles = async function (zip) {
  const services = [];

  // --- Helper: recursively flatten schema into rows ---
  function flattenSchema(schema, direction, result = []) {
    if (!schema || typeof schema !== "object") return result;

    if (schema.properties) {
      for (const [propName, propVal] of Object.entries(schema.properties)) {
        const type = propVal.type || "unknown";
        const opa = propVal.opaAttribute ? ` (${propVal.opaAttribute})` : "";
        result.push({
          direction,
          item: propName,
          details: `${type}${opa}`
        });

        // handle nested objects or arrays
        if (propVal.type === "array") {
          result.push({
            direction,
            item: "(array)",
            details: `object${opa}`
          });
        }

        // recurse into children
        if (propVal.items) flattenSchema(propVal.items, direction, result);
        if (propVal.properties) flattenSchema(propVal, direction, result);
      }
    }

    if (schema.items && schema.items.properties) {
      flattenSchema(schema.items, direction, result);
    }

    return result;
  }

  try {
    const fileNames = Object.keys(zip.files).filter(
      (f) =>
        f.toLowerCase().includes("/rules/") &&
        f.toLowerCase().endsWith(".ref")
    );

    console.log(`[refParser] Found ${fileNames.length} .ref files in /Rules/ folders.`);

    for (const name of fileNames) {
      try {
        const text = await zip.files[name].async("text");
        const json = JSON.parse(text);

        const svcName =
          json.serviceName ||
          json.name ||
          json.decisionServiceName ||
          name.split("/").pop().replace(/\.ref$/i, "");

        const svc = {
          fileName: name,
          name: svcName,
          schemaRows: []
        };

        // --- Extract Input schema ---
        if (json.inputSchema) {
          flattenSchema(json.inputSchema, "Input", svc.schemaRows);
        }

        // --- Extract Output schema ---
        if (json.outputSchema) {
          flattenSchema(json.outputSchema, "Output", svc.schemaRows);
        }

        // Fallback: flat inputs/outputs (legacy)
        if (
          svc.schemaRows.length === 0 &&
          (Array.isArray(json.inputs) || Array.isArray(json.outputs))
        ) {
          if (Array.isArray(json.inputs)) {
            json.inputs.forEach((i) =>
              svc.schemaRows.push({
                direction: "Input",
                item: i.attribute || i.entity || i.name || "",
                details: i.type || ""
              })
            );
          }
          if (Array.isArray(json.outputs)) {
            json.outputs.forEach((o) =>
              svc.schemaRows.push({
                direction: "Output",
                item: o.attribute || o.entity || o.name || "",
                details: o.type || ""
              })
            );
          }
        }

        console.log(
          `[refParser] Parsed ${svc.schemaRows.length} schema rows for ${svc.name}.`
        );

        services.push(svc);
      } catch (err) {
        console.warn(`[refParser] Failed to parse file: ${name}`, err);
      }
    }

    console.log(`[refParser] Parsed ${services.length} REF files.`);
  } catch (err) {
    console.error("[refParser] Error scanning ZIP:", err);
  }

  return services;
};
