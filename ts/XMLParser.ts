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
import { Comment } from './Comment';
import { Document } from "./Document";
import { ProcessingInstruction } from './ProcessingInstruction';
import { TextNode } from './TextNode';
import { XMLDeclaration } from './XMLDeclaration';
import { XMLNode } from './XMLNode';

export class XMLParser {

    private source: string;
    private pointer: number;
    private document: Document;
    private inProlog: boolean;
    private prologContent: Array<XMLNode>;
    private xmlDeclaration: XMLDeclaration;

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
        this.prologContent = new Array();
        while (this.inProlog) {
            if (this.lookingAt('<?xml')) {
                this.parseXMLDecl();
                continue;
            }
            if (this.lookingAt('<!DOCTYPE')) {
                this.parseDoctype();
                continue;
            }
            if (this.lookingAt('<?') && !this.lookingAt('<?xml')) {
                this.parseProcessingInstruction();
                continue;
            }
            if (this.lookingAt('<!--')) {
                this.parseComment();
                continue;
            }
            let char: string = this.source.charAt(this.pointer);
            if (this.isXmlSpace(char)) {
                this.prologContent.push(new TextNode(char));
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
        let declarationText = this.source.substring(this.pointer, this.pointer + index + '?>'.length);
        this.pointer += declarationText.length;
        this.xmlDeclaration = new XMLDeclaration();
        try {
            let attributesPortion = declarationText.substring('<?xml'.length, declarationText.length - '?>'.length);
            let atts: Map<string, Attribute> = this.parseAttributes(attributesPortion);
            if (atts.has('version')) {
                this.xmlDeclaration.setVersion(atts.get('version').getValue());
            }
            if (atts.has('encoding')) {
                this.xmlDeclaration.setEncoding(atts.get('encoding').getValue());
            }
            if (atts.has('standalone')) {
                this.xmlDeclaration.setStandalone(atts.get('standalone').getValue());
            }
        } catch (e) {
            throw new Error("Malformed XML declaration: " + declarationText);
        }
    }

    parseComment(): void {
        let index: number = this.source.indexOf('-->', this.pointer);
        if (index === -1) {
            throw new Error('Malformed XML comment');
        }
        let content: string = this.source.substring(this.pointer, this.pointer + index + '-->'.length);
        this.pointer += content.length;
        let comment: Comment = new Comment(content.substring('<!--'.length));
        if (this.inProlog) {
            this.prologContent.push(comment);
        } else {
            this.document.addComment(comment);
        }
    }

    parseProcessingInstruction(): void {
        let index: number = this.source.indexOf('?>', this.pointer);
        if (index === -1) {
            throw new Error('Malformed Processing Instruction');
        }
        let instructionText = this.source.substring(this.pointer, this.pointer + index + '?>'.length);
        this.pointer += instructionText.length;
        instructionText.substring('<?'.length);
        let target: string = '';
        let i: number = 0;
        for (; i < instructionText.length; i++) {
            let char: string = instructionText[i];
            if (this.isXmlSpace(char)) {
                break;
            }
            target += char;
        }
        for (; instructionText.length; i++) {
            let char: string = instructionText[i];
            if (!this.isXmlSpace(char)) {
                break;
            }
        }
        let value: string = instructionText.substring(i);
        let pi: ProcessingInstruction = new ProcessingInstruction(target, value);
        if (this.inProlog) {
            this.prologContent.push(pi);
        } else {
            this.document.addProcessingInstrution(pi);
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
            if (inName && !(this.isXmlSpace(char) || '=' === char)) {
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

    parseDoctype(): void {
        let stack: number = 0;
        let i = this.pointer
        for (; i < this.source.length; i++) {
            let char: string = this.source[i];
            if ('<' === char) {
                stack++;
            }
            if ('>' === char) {
                stack--;
                if (stack === 0) {
                    break;
                }
            }
        }
        let declaration: string = this.source.substring(this.pointer, i);
        this.pointer += declaration.length;
        // TODO parse declaration
    }

    isXmlSpace(char: string): boolean {
        return char.charCodeAt(0) === 0x20 || char.charCodeAt(0) === 0x9 || char.charCodeAt(0) === 0xA;
    }
}