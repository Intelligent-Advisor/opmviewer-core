// xml.js — DOM-like wrapper for fast-xml-parser output
// Provides compatibility for existing parsers that expect DOMParser API
// Works both in main thread and Web Worker

self.parseXmlString = function (xmlText) {
  try {
    // ✅ 1️⃣ Use native DOMParser if available (main thread)
    if (typeof DOMParser !== "undefined") {
      const parser = new DOMParser();
      return parser.parseFromString(xmlText, "text/xml");
    }

    // ✅ 2️⃣ Use fast-xml-parser inside Worker
    if (typeof self.XMLParser !== "undefined") {
      const parser = new self.XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
        allowBooleanAttributes: true,
        ignoreDeclaration: true,
        trimValues: true
      });

      const json = parser.parse(xmlText);
      if (!json || typeof json !== "object") {
        console.warn("[xml.js] Empty or invalid XML structure.");
        return { getElementsByTagName: () => [] };
      }

      // --- Internal helper to create a DOM-like element shim ---
      const makeElement = (obj, tagName) => ({
        tagName,
        _obj: obj,

        getAttribute(name) {
          if (!obj || typeof obj !== "object") return null;
          return name in obj ? obj[name] : null;
        },

        getAttributeNode(name) {
          const val = this.getAttribute(name);
          return val ? { name, value: val } : null;
        },

        getElementsByTagName(target) {
          const results = [];
          const search = (node) => {
            if (!node || typeof node !== "object") return;
            for (const key in node) {
              if (!Object.hasOwn(node, key)) continue;
              const child = node[key];
              if (key === target) {
                if (Array.isArray(child))
                  child.forEach((c) => results.push(makeElement(c, key)));
                else results.push(makeElement(child, key));
              }
              if (typeof child === "object") search(child);
            }
          };
          search(obj);
          return results;
        },

        // Namespace-insensitive search
        getElementsByTagNameNS(ns, localName) {
          return this.getElementsByTagName(localName);
        },

        get textContent() {
          if (typeof obj === "string") return obj;
          if (typeof obj === "object" && "#text" in obj) return obj["#text"];
          return "";
        },
      });

      // --- Root shim ---
      const rootTag = Object.keys(json)[0];
      const root = makeElement(json[rootTag], rootTag);

      console.log("[xml.js] Parsed XML using fast-xml-parser. Root:", rootTag);

      return {
        documentElement: root,
        getElementsByTagName: root.getElementsByTagName,
      };
    }

    throw new Error("No XML parser available (DOMParser or fast-xml-parser missing).");
  } catch (err) {
    console.error("[xml.js] Failed to parse XML:", err);
    return { getElementsByTagName: () => [] };
  }
};
