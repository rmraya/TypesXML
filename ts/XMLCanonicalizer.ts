/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { Readable } from "stream";
import { DOMBuilder } from "./DOMBuilder";
import { SAXParser, ParseSourceOptions, StreamParseOptions } from "./SAXParser";
import { XMLDocument } from "./XMLDocument";
import { XMLNode } from "./XMLNode";
import { XMLDeclaration } from "./XMLDeclaration";
import { ProcessingInstruction } from "./ProcessingInstruction";
import { XMLElement } from "./XMLElement";
import { XMLAttribute } from "./XMLAttribute";
import { TextNode } from "./TextNode";
import { CData } from "./CData";
import { XMLComment } from "./XMLComment";
import { XMLDocumentType } from "./XMLDocumentType";

/**
 * Generates the canonical XML representation defined by the W3C XML Test Suite.
 *
 * Canonicalization rules:
 *  - Attribute order is lexical (Unicode code point order).
 *  - Character data is escaped using the Datachar productions (&amp;, &lt;, &gt;, &quot;, &#9;, &#10;, &#13;).
 *  - CDATA sections are treated as their character content.
 *  - Comments and document type declarations are omitted.
 *  - Processing instructions are preserved in document order with their data escaped as Datachar.
 */
export class XMLCanonicalizer {

    private document: XMLDocument | undefined;

    parseFile(path: string, encoding?: BufferEncoding): void {
        const builder: DOMBuilder = new DOMBuilder();
        const parser: SAXParser = new SAXParser();
        parser.setContentHandler(builder);
        parser.parseFile(path, encoding);
        this.document = builder.getDocument();
    }

    parseString(xml: string, options?: ParseSourceOptions): void {
        const builder: DOMBuilder = new DOMBuilder();
        const parser: SAXParser = new SAXParser();
        parser.setContentHandler(builder);
        parser.parseString(xml, options);
        this.document = builder.getDocument();
    }

    async parseStream(stream: Readable, options?: StreamParseOptions): Promise<void> {
        const builder: DOMBuilder = new DOMBuilder();
        const parser: SAXParser = new SAXParser();
        parser.setContentHandler(builder);
        await parser.parseStream(stream, options);
        this.document = builder.getDocument();
    }

    setDocument(document: XMLDocument): void {
        this.document = document;
    }

    getDocument(): XMLDocument | undefined {
        return this.document;
    }

    toString(): string {
        if (!this.document) {
            throw new Error("Canonicalizer has no document. Parse an XML source first.");
        }
        return this.renderDocument(this.document);
    }

    private renderDocument(document: XMLDocument): string {
        const parts: string[] = [];
        for (const node of document.contentIterator()) {
            parts.push(this.renderTopLevelNode(node));
        }
        return parts.join("");
    }

    private renderTopLevelNode(node: XMLNode): string {
        if (node instanceof XMLDeclaration || node instanceof XMLComment || node instanceof XMLDocumentType) {
            return ""; // omitted from canonical form
        }
        if (node instanceof ProcessingInstruction) {
            return this.renderProcessingInstruction(node);
        }
        if (node instanceof XMLElement) {
            return this.renderElement(node);
        }
        if (node instanceof TextNode || node instanceof CData) {
            return this.escapeData(this.getNodeValue(node));
        }
        return "";
    }

    private renderElement(element: XMLElement): string {
        const builder: string[] = [];
        builder.push("<" + element.getName());
        const attributes: XMLAttribute[] = [...element.getAttributes()].sort((a: XMLAttribute, b: XMLAttribute) => a.getName().localeCompare(b.getName()));
        attributes.forEach((attribute: XMLAttribute) => {
            builder.push(" " + attribute.getName() + "=\"" + this.escapeData(attribute.getValue()) + "\"");
        });
        builder.push(">");
        element.getContent().forEach((child: XMLNode) => {
            if (child instanceof XMLElement) {
                builder.push(this.renderElement(child));
            } else if (child instanceof TextNode || child instanceof CData) {
                builder.push(this.escapeData(this.getNodeValue(child)));
            } else if (child instanceof ProcessingInstruction) {
                builder.push(this.renderProcessingInstruction(child));
            }
            // comments and other node types are ignored in canonical form
        });
        builder.push("</" + element.getName() + ">");
        return builder.join("");
    }

    private renderProcessingInstruction(pi: ProcessingInstruction): string {
        const data: string = this.escapeData(pi.getData());
        return `<?${pi.getTarget()} ${data}?>`;
    }

    private getNodeValue(node: TextNode | CData): string {
        if (node instanceof TextNode) {
            return node.getValue();
        }
        return node.getValue();
    }

    private escapeData(data: string): string {
        let result: string = "";
        for (let i: number = 0; i < data.length; i++) {
            const char: string = data.charAt(i);
            switch (char) {
                case "&":
                    result += "&amp;";
                    break;
                case "<":
                    result += "&lt;";
                    break;
                case ">":
                    result += "&gt;";
                    break;
                case '"':
                    result += "&quot;";
                    break;
                case "\t":
                    result += "&#9;";
                    break;
                case "\n":
                    result += "&#10;";
                    break;
                case "\r":
                    result += "&#13;";
                    break;
                default:
                    result += char;
            }
        }
        return result;
    }
}
