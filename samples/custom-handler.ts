import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog, ContentHandler, Grammar, XMLAttribute } from "typesxml";
import { SAXParser } from "typesxml";

class LoggingHandler implements ContentHandler {
    initialize(): void {
        console.log("Handler initialised");
    }

    setCatalog(_catalog: Catalog): void {
        // No catalog usage for logging-only handler.
    }

    setGrammar(_grammar: Grammar | undefined): void {
        // Grammars are not cached for this handler.
    }

    getGrammar(): Grammar | undefined {
        return undefined;
    }

    startDocument(): void {
        console.log("Start document");
    }

    endDocument(): void {
        console.log("End document");
    }

    xmlDeclaration(version: string, encoding: string, standalone: string | undefined): void {
        console.log(`XML v${version} encoding=${encoding} standalone=${standalone}`);
    }

    startElement(name: string, atts: XMLAttribute[]): void {
        const attributes = atts.map((att) => `${att.getName()}="${att.getValue()}"`).join(" ");
        console.log(`<${name}${attributes ? " " + attributes : ""}>`);
    }

    endElement(name: string): void {
        console.log(`</${name}>`);
    }

    internalSubset(declaration: string): void {
        if (declaration.trim()) {
            console.log(`<![INTERNAL SUBSET ${declaration}]>`);
        }
    }

    characters(text: string): void {
        const collapsed = text.trim();
        if (collapsed) {
            console.log(`TEXT: ${collapsed}`);
        }
    }

    ignorableWhitespace(text: string): void {
        if (text.length > 0) {
            console.log(`WHITESPACE(${text.length})`);
        }
    }

    comment(text: string): void {
        console.log(`<!-- ${text} -->`);
    }

    processingInstruction(target: string, data: string): void {
        console.log(`<?${target} ${data}?>`);
    }

    startCDATA(): void {
        console.log("<![CDATA[");
    }

    endCDATA(): void {
        console.log("]]>");
    }

    startDTD(name: string, publicId: string, systemId: string): void {
        console.log(`<!DOCTYPE ${name} PUBLIC "${publicId}" "${systemId}">`);
    }

    endDTD(): void {
        // No extra logging for end of DTD.
    }

    skippedEntity(name: string): void {
        console.warn(`Skipped entity ${name}`);
    }
}

const parser = new SAXParser();
parser.setContentHandler(new LoggingHandler());

const sampleRoot = fileURLToPath(new URL("..", import.meta.url));
parser.parseFile(resolve(sampleRoot, "resources/xml/library.xml"));
