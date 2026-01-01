/*******************************************************************************
 * Copyright (c) 2023-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { Catalog } from "../Catalog";
import { ContentHandler } from "../ContentHandler";
import { Grammar } from "../grammar/Grammar";
import { XMLAttribute } from "../XMLAttribute";
import { JsonAttributeDescriptor, JsonNodeEvent } from "./JsonNodeReader";

export class JsonEventCollector implements ContentHandler {

    private events: Array<JsonNodeEvent>;
    private catalog: Catalog | undefined;
    private grammar: Grammar | undefined;

    constructor() {
        this.events = new Array<JsonNodeEvent>();
    }

    initialize(): void {
        this.events = new Array<JsonNodeEvent>();
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

    getEvents(): Array<JsonNodeEvent> {
        return this.events;
    }

    startDocument(): void {
        this.events.push({ type: "startDocument" });
    }

    endDocument(): void {
        this.events.push({ type: "endDocument" });
    }

    xmlDeclaration(version: string, encoding: string, standalone: string | undefined): void {
        this.events.push({
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
        this.events.push({
            type: "startElement",
            name: name,
            attributes: attributes
        });
    }

    endElement(name: string): void {
        this.events.push({
            type: "endElement",
            name: name
        });
    }

    internalSubset(declaration: string): void {
        this.events.push({
            type: "internalSubset",
            declaration: declaration
        });
    }

    characters(ch: string): void {
        this.events.push({
            type: "characters",
            value: ch
        });
    }

    ignorableWhitespace(ch: string): void {
        this.events.push({
            type: "ignorableWhitespace",
            value: ch
        });
    }

    comment(ch: string): void {
        this.events.push({
            type: "comment",
            value: ch
        });
    }

    processingInstruction(target: string, data: string): void {
        this.events.push({
            type: "processingInstruction",
            target: target,
            data: data
        });
    }

    startCDATA(): void {
        this.events.push({ type: "startCDATA" });
    }

    endCDATA(): void {
        this.events.push({ type: "endCDATA" });
    }

    startDTD(name: string, publicId: string, systemId: string): void {
        this.events.push({
            type: "startDTD",
            name: name,
            publicId: publicId,
            systemId: systemId
        });
    }

    endDTD(): void {
        this.events.push({ type: "endDTD" });
    }

    skippedEntity(name: string): void {
        this.events.push({
            type: "skippedEntity",
            name: name
        });
    }
}
