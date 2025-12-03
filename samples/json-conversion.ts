// @ts-nocheck

import typesxml from "typesxml";

const { jsonObjectToXmlDocument, xmlStringToJsonObject } = typesxml as Record<string, unknown> as {
    jsonObjectToXmlDocument: (json: any, rootName?: string) => any;
    xmlStringToJsonObject: (xml: string, options?: any) => any;
};

function demoJsonToXml(): void {
    const simpleJson: any = {
        library: {
            _attributes: { category: "memo" },
            _text: "painters"
        },
        books: ["DaVinci", "VanGogh", "Rubens"]
    };

    const document = jsonObjectToXmlDocument(simpleJson, "libraryCatalog");
    console.log("JSON → XML (simple structure):");
    console.log(document.toString());
}

function demoXmlToJson(): void {
    const xmlSource: string = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!--Before root-->",
        "<libraryCatalog>",
        "  <library category=\"memo\">painters</library>",
        "  <books>",
        "    <book>DaVinci</book>",
        "    <book>VanGogh</book>",
        "    <book>Rubens</book>",
        "  </books>",
        "</libraryCatalog>"
    ].join("\n");

    const simpleJson: any = xmlStringToJsonObject(xmlSource);
    console.log("\nXML → JSON (simple mode):");
    console.log(JSON.stringify(simpleJson, null, 2));

    const roundTripJson: any = xmlStringToJsonObject(xmlSource, { mode: "roundtrip" });
    console.log("\nXML → JSON (roundtrip mode):");
    console.log(JSON.stringify(roundTripJson, null, 2));

    const rebuilt = jsonObjectToXmlDocument(roundTripJson);
    console.log("\nRoundtrip JSON back to XML:");
    console.log(rebuilt.toString());
}

function main(): void {
    demoJsonToXml();
    demoXmlToJson();
}

main();
