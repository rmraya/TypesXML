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

import { ContentHandler } from "../ContentHandler";
import { XMLAttribute } from "../XMLAttribute";
import { JsonAttributeDescriptor, JsonNodeEvent, JsonNodeReader } from "./JsonNodeReader";

export class JsonToXmlHandler {

    private readonly handler: ContentHandler;

    constructor(handler: ContentHandler) {
        this.handler = handler;
    }

    process(reader: JsonNodeReader): void {
        let event: JsonNodeEvent | undefined;
        while ((event = reader.readNextEvent()) !== undefined) {
            this.handleEvent(event);
        }
    }

    handleEvent(event: JsonNodeEvent): void {
        switch (event.type) {
            case 'startDocument':
                this.handler.startDocument();
                break;
            case 'endDocument':
                this.handler.endDocument();
                break;
            case 'xmlDeclaration':
                this.handler.xmlDeclaration(event.version, event.encoding, event.standalone);
                break;
            case 'startElement':
                this.handler.startElement(event.name, this.buildAttributes(event.attributes));
                break;
            case 'endElement':
                this.handler.endElement(event.name);
                break;
            case 'characters':
                this.handler.characters(event.value);
                break;
            case 'ignorableWhitespace':
                this.handler.ignorableWhitespace(event.value);
                break;
            case 'comment':
                this.handler.comment(event.value);
                break;
            case 'processingInstruction':
                this.handler.processingInstruction(event.target, event.data);
                break;
            case 'startCDATA':
                this.handler.startCDATA();
                break;
            case 'endCDATA':
                this.handler.endCDATA();
                break;
            case 'startDTD':
                this.handler.startDTD(event.name, event.publicId, event.systemId);
                break;
            case 'internalSubset':
                this.handler.internalSubset(event.declaration);
                break;
            case 'endDTD':
                this.handler.endDTD();
                break;
            case 'skippedEntity':
                this.handler.skippedEntity(event.name);
                break;
            default:
                throw new Error('Unsupported event type: ' + (event as JsonNodeEvent).type);
        }
    }

    private buildAttributes(descriptors: Array<JsonAttributeDescriptor>): Array<XMLAttribute> {
        return descriptors.map((descriptor: JsonAttributeDescriptor) => new XMLAttribute(descriptor.name, descriptor.value));
    }
}
