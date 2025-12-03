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
import { JsonAttributeDescriptor, JsonNodeEvent } from "./JsonNodeReader";

export class JsonEventStreamWriter implements ContentHandler {

    private readonly writer: Writable;
    private arrayStarted: boolean;
    private firstEvent: boolean;
    private closed: boolean;
    private catalog: Catalog | undefined;
    private grammar: Grammar | undefined;

    constructor(writer: Writable) {
        this.writer = writer;
        this.arrayStarted = false;
        this.firstEvent = true;
        this.closed = false;
    }

    initialize(): void {
        this.arrayStarted = false;
        this.firstEvent = true;
        this.closed = false;
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
        this.writeEvent({ type: "startDocument" });
    }

    endDocument(): void {
        this.writeEvent({ type: "endDocument" });
        this.closeArray();
    }

    xmlDeclaration(version: string, encoding: string, standalone: string | undefined): void {
        this.writeEvent({
            type: "xmlDeclaration",
            version: version,
            encoding: encoding,
            standalone: standalone
        });
    }

    startElement(name: string, atts: Array<XMLAttribute>): void {
        const attributes: Array<JsonAttributeDescriptor> = new Array<JsonAttributeDescriptor>();
        for (let index: number = 0; index < atts.length; index++) {
            const attribute: XMLAttribute = atts[index];
            const descriptor: JsonAttributeDescriptor = {
                name: attribute.getName(),
                value: attribute.getValue()
            };
            attributes.push(descriptor);
        }
        this.writeEvent({
            type: "startElement",
            name: name,
            attributes: attributes
        });
    }

    endElement(name: string): void {
        this.writeEvent({
            type: "endElement",
            name: name
        });
    }

    internalSubset(declaration: string): void {
        this.writeEvent({
            type: "internalSubset",
            declaration: declaration
        });
    }

    characters(ch: string): void {
        this.writeEvent({
            type: "characters",
            value: ch
        });
    }

    ignorableWhitespace(ch: string): void {
        this.writeEvent({
            type: "ignorableWhitespace",
            value: ch
        });
    }

    comment(ch: string): void {
        this.writeEvent({
            type: "comment",
            value: ch
        });
    }

    processingInstruction(target: string, data: string): void {
        this.writeEvent({
            type: "processingInstruction",
            target: target,
            data: data
        });
    }

    startCDATA(): void {
        this.writeEvent({ type: "startCDATA" });
    }

    endCDATA(): void {
        this.writeEvent({ type: "endCDATA" });
    }

    startDTD(name: string, publicId: string, systemId: string): void {
        this.writeEvent({
            type: "startDTD",
            name: name,
            publicId: publicId,
            systemId: systemId
        });
    }

    endDTD(): void {
        this.writeEvent({ type: "endDTD" });
    }

    skippedEntity(name: string): void {
        this.writeEvent({
            type: "skippedEntity",
            name: name
        });
    }

    private writeEvent(event: JsonNodeEvent): void {
        this.ensureArrayStarted();
        if (!this.firstEvent) {
            this.writer.write(",");
        }
        const payload: string = JSON.stringify(event);
        this.writer.write(payload);
        this.firstEvent = false;
    }

    private closeArray(): void {
        if (this.closed) {
            return;
        }
        if (!this.arrayStarted) {
            this.writer.write("[]");
            this.closed = true;
            return;
        }
        this.writer.write("]");
        this.closed = true;
    }

    private ensureArrayStarted(): void {
        if (this.arrayStarted) {
            return;
        }
        this.writer.write("[");
        this.arrayStarted = true;
    }

}
