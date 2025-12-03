/*******************************************************************************
 * Copyright (c) 2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { Writable } from "node:stream";
import { Catalog } from "../Catalog";
import { ContentHandler } from "../ContentHandler";
import { Grammar } from "../grammar/Grammar";
import { XMLAttribute } from "../XMLAttribute";
import { XMLUtils } from "../XMLUtils";

interface ElementFrame {
    name: string;
    startTagOpen: boolean;
    hasContent: boolean;
}

export class XmlEventStreamWriter implements ContentHandler {

    private readonly output: Writable;
    private readonly encoding: BufferEncoding;
    private readonly autoClose: boolean;
    private elementStack: Array<ElementFrame>;
    private catalog: Catalog | undefined;
    private grammar: Grammar | undefined;
    private xmlVersion: string;
    private inCDATA: boolean;
    private dtdOpen: boolean;
    private dtdHasSubset: boolean;
    private completed: boolean;

    constructor(output: Writable, encoding: BufferEncoding = "utf8", autoClose: boolean = true) {
        this.output = output;
        this.encoding = encoding;
        this.autoClose = autoClose;
        this.elementStack = new Array<ElementFrame>();
        this.xmlVersion = "1.0";
        this.inCDATA = false;
        this.dtdOpen = false;
        this.dtdHasSubset = false;
        this.completed = false;
        this.output.setDefaultEncoding(this.encoding);
    }

    initialize(): void {
        this.elementStack = new Array<ElementFrame>();
        this.xmlVersion = "1.0";
        this.inCDATA = false;
        this.dtdOpen = false;
        this.dtdHasSubset = false;
        this.completed = false;
    }

    setCatalog(catalog: Catalog): void {
        this.catalog = catalog;
    }

    setGrammar(grammar: Grammar | undefined): void {
        this.grammar = grammar;
    }

    getGrammar(): Grammar | undefined {
        return this.grammar;
    }

    startDocument(): void {
        return;
    }

    endDocument(): void {
        this.closePendingStartTag();
        this.elementStack = new Array<ElementFrame>();
        if (this.autoClose && !this.completed) {
            this.completed = true;
            this.output.end();
        }
    }

    xmlDeclaration(version: string, encoding: string, standalone: string | undefined): void {
        this.xmlVersion = version === "" ? "1.0" : version;
        let declaration: string = "<?xml";
        if (version !== "") {
            declaration += " version=\"" + version + "\"";
        }
        if (encoding !== "") {
            declaration += " encoding=\"" + encoding + "\"";
        }
        if (standalone !== undefined) {
            declaration += " standalone=\"" + standalone + "\"";
        }
        declaration += "?>";
        this.write(declaration);
    }

    startElement(name: string, atts: Array<XMLAttribute>): void {
        this.prepareForChildContent();
        let buffer: string = "<" + name;
        for (let index: number = 0; index < atts.length; index++) {
            const attribute: XMLAttribute = atts[index];
            buffer += " " + attribute.toString();
        }
        this.write(buffer);
        const frame: ElementFrame = {
            name: name,
            startTagOpen: true,
            hasContent: false
        };
        this.elementStack.push(frame);
    }

    endElement(name: string): void {
        if (this.elementStack.length === 0) {
            throw new Error("Unexpected endElement event for \"" + name + "\"");
        }
        const frame: ElementFrame = this.elementStack.pop()!;
        if (frame.name !== name) {
            throw new Error("Mismatched endElement event: expected \"" + frame.name + "\" but received \"" + name + "\"");
        }
        if (frame.startTagOpen) {
            this.write("/>");
        } else {
            this.write("</" + name + ">");
        }
    }

    internalSubset(declaration: string): void {
        if (!this.dtdOpen) {
            throw new Error("Internal subset event received outside of DTD");
        }
        this.write(" [" + declaration + "]");
        this.dtdHasSubset = true;
    }

    characters(ch: string): void {
        this.prepareForTextContent();
        if (this.inCDATA) {
            this.write(ch);
            return;
        }
        XMLUtils.ensureValidXmlCharacters(this.xmlVersion, ch, "character data");
        const escaped: string = XMLUtils.cleanString(ch);
        this.write(escaped);
    }

    ignorableWhitespace(ch: string): void {
        this.characters(ch);
    }

    comment(ch: string): void {
        this.prepareForTextContent();
        this.write("<!--" + ch + "-->");
    }

    processingInstruction(target: string, data: string): void {
        this.prepareForTextContent();
        let instruction: string = "<?" + target;
        if (data.length > 0) {
            instruction += " " + data;
        }
        instruction += "?>";
        this.write(instruction);
    }

    startCDATA(): void {
        this.prepareForTextContent();
        this.write("<![CDATA[");
        this.inCDATA = true;
    }

    endCDATA(): void {
        if (!this.inCDATA) {
            throw new Error("endCDATA event received without matching startCDATA");
        }
        this.write("]]>");
        this.inCDATA = false;
    }

    startDTD(name: string, publicId: string, systemId: string): void {
        this.closePendingStartTag();
        let declaration: string = "<!DOCTYPE " + name;
        if (publicId !== "" && systemId !== "") {
            declaration += " PUBLIC \"" + publicId + "\" \"" + systemId + "\"";
        } else if (systemId !== "") {
            declaration += " SYSTEM \"" + systemId + "\"";
        } else if (publicId !== "") {
            declaration += " PUBLIC \"" + publicId + "\"";
        }
        this.write(declaration);
        this.dtdOpen = true;
        this.dtdHasSubset = false;
    }

    endDTD(): void {
        if (!this.dtdOpen) {
            return;
        }
        if (!this.dtdHasSubset) {
            this.write(">");
        } else {
            this.write(">");
        }
        this.dtdOpen = false;
    }

    skippedEntity(name: string): void {
        this.prepareForTextContent();
        this.write("&" + name + ";");
    }

    private prepareForChildContent(): void {
        if (this.elementStack.length === 0) {
            return;
        }
        const current: ElementFrame = this.elementStack[this.elementStack.length - 1];
        if (current.startTagOpen) {
            this.write(">");
            current.startTagOpen = false;
        }
        current.hasContent = true;
    }

    private prepareForTextContent(): void {
        if (this.elementStack.length > 0) {
            const current: ElementFrame = this.elementStack[this.elementStack.length - 1];
            if (current.startTagOpen) {
                this.write(">");
                current.startTagOpen = false;
            }
            current.hasContent = true;
        }
    }

    private closePendingStartTag(): void {
        if (this.elementStack.length === 0) {
            return;
        }
        const current: ElementFrame = this.elementStack[this.elementStack.length - 1];
        if (current.startTagOpen) {
            this.write(">");
            current.startTagOpen = false;
        }
    }

    private write(data: string): void {
        this.output.write(data, this.encoding);
    }
}
