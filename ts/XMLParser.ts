/*******************************************************************************
 * Copyright (c) 2022 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { readFile } from 'fs';
import { Attribute } from './Attribute';
import { Document } from "./Document";

export class XMLParser {

    source: string;
    pointer: number;
    document: Document;
    xmlVersion: string;
    xmlEncoding: string;
    xmlStandalone: string;
    inProlog: boolean;

    constructor() {
        this.source = '';
        this.pointer = 0;
    }

    parseString(source: string): Document {
        this.source = source;
        this.readProlog();
        this.readDocument();
        return this.document;
    }

    parseFile(file: string): Document {
        // TODO get encoding from BOM
        readFile(file, 'utf8', (error: NodeJS.ErrnoException, data: string) => {
            if (error) {
                throw error;
            }
            this.parseString(data);
        });
        return this.document;
    }

    readProlog(): void {
        this.inProlog = true;
        while (this.inProlog) {
            if (this.lookingAt('<?xml')) {
                this.parseXMLDecl();
                continue;
            }
            if (this.lookingAt('<!DOCTYPE')) {
                // TODO
                continue;
            }
            if (this.lookingAt('<?') && !this.lookingAt('<?xml')) {
                // TODO
                continue;
            }
            if (this.lookingAt('<!--')) {
                // TODO
                continue;
            }
            let char: string = this.source.charAt(this.pointer);
            if (this.isSpace(char)) {
                this.pointer++;
                continue;
            }
            this.inProlog = false;
        }
    }

    readDocument(): void {
        // TODO
    }

    lookingAt(text: string): boolean {
        for (let i = 0; i < text.length; i++) {
            if (this.source[this.pointer + i] !== text[i]) {
                return false;
            }
        }
        return true;
    }

    parseXMLDecl(): void {
        let index: number = this.source.indexOf('?>', this.pointer);
        if (index === -1) {
            throw new Error('Malformed XML declaration');
        }
        let xmlDeclaration = this.source.substring(this.pointer, this.pointer + index + '?>'.length);
        this.pointer += xmlDeclaration.length;
        try {
            let attributesPortion = xmlDeclaration.substring('<?xml'.length, xmlDeclaration.length - '?>'.length);
            let atts: Map<string, Attribute> = this.parseAttributes(attributesPortion);
            if (atts.has('version')) {
                this.xmlVersion = atts.get('version').getValue();
            }
            if (atts.has('encoding')) {
                this.xmlEncoding = atts.get('encoding').getValue();
            }
            if (atts.has('standalone')) {
                this.xmlStandalone = atts.get('standalone').getValue();
            }
        } catch (e) {
            throw new Error("Malformed XML declaration: " + xmlDeclaration);
        }
    }

    parseAttributes(original: string): Map<string, Attribute> {
        let attributes: Map<string, Attribute> = new Map();
        let text: string = original.trim();
        let pairs: string[] = [];
        let inName = true;
        let separator: string = '';
        for (let i = 0; i < text.length; i++) {
            let char = text[i];
            if (inName && !(this.isSpace(char) || '=' === char)) {
                // still in name
                continue;
            }
            inName = false;
            if (char !== separator) {
                //still in value
                if (separator === '' && ('\'' === char || '"' === char)) {
                    separator = char;
                }
                continue;
            }
            // end of value
            pairs.push(text.substring(0, i + 1).trim());
            text = text.substring(i + 1).trim();
        }
        for (let i = 0; i < pairs.length; i++) {
            let pair: string = pairs[i];
            let index = pair.indexOf('=');
            if (index === -1) {
                throw new Error('Malformed attribute');
            }
            let name = pair.substring(0, index).trim();
            let value = pair.substring(index + 1).trim();
            attributes.set(name, new Attribute(name, value.substring(1, value.length - 1)));
        }
        return attributes;
    }

    isSpace(char: string): boolean {
        return char.charCodeAt(0) === 0x20 || char.charCodeAt(0) === 0x9 || char.charCodeAt(0) === 0xA;
    }
}