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

import { Attribute } from './Attribute';
import { CData } from './CData';
import { Comment } from './Comment';
import { Document } from "./Document";
import { Element } from './Element';
import { ProcessingInstruction } from './ProcessingInstruction';
import { TextNode } from './TextNode';
import { XMLDeclaration } from './XMLDeclaration';
import { XMLNode } from './XMLNode';
import { XMLUtils } from './XMLUtils';

export class XMLParser {

    private source: string;
    private pointer: number;
    private document: Document;
    private inProlog: boolean;
    private prologContent: Array<XMLNode>;
    private xmlDeclaration: XMLDeclaration;
    private stack: Element[];
    private currentElement: Element;

    constructor() {
        this.source = '';
        this.pointer = 0;
        this.stack = [];
    }

    parse(source: string): Document {
        this.source = source;
        this.readProlog();
        this.readDocument();
        return this.document;
    }

    readProlog(): void {
        this.inProlog = true;
        this.prologContent = new Array<XMLNode>();
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
            if (XMLUtils.isXmlSpace(char)) {
                this.prologContent.push(new TextNode(char));
                this.pointer++;
                continue;
            }
            this.inProlog = false;
        }
    }

    readDocument(): void {
        let inDocument: boolean = true;
        while (inDocument) {
            if (this.lookingAt('<!--')) {
                this.parseComment();
                continue;
            }
            if (this.lookingAt('<?')) {
                this.parseProcessingInstruction();
                continue;
            }
            if (this.lookingAt('<')) {
                this.parseRoot();
                continue;
            }
            let char: string = this.source.charAt(this.pointer);
            if (XMLUtils.isXmlSpace(char)) {
                this.document.addTextNode(new TextNode(char));
                this.pointer++;
                continue;
            }
            inDocument = false;
        }
    }

    lookingAt(text: string): boolean {
        for (let i = 0; i < text.length; i++) {
            if (this.source[this.pointer + i] !== text[i]) {
                return false;
            }
        }
        return true;
    }

    parseRoot(): void {
        let rootName: string = '';
        let i = this.pointer + 1;
        for (; !(XMLUtils.isXmlSpace(this.source[i]) || this.source[i] === '/' || this.source[i] === '>'); i++) {
            rootName += this.source[i];
        }
        this.document = new Document(rootName, this.xmlDeclaration, this.prologContent);
        let attributesPortion: string = '';
        for (; !(this.source[i] === '/' || this.source[i] === '>'); i++) {
            attributesPortion += this.source[i];
        }
        let atts: Map<string, Attribute> = this.parseAttributes(attributesPortion);
        atts.forEach((value: Attribute) => {
            this.document.getRoot().setAttribute(value);
        });
        this.pointer = this.source.indexOf('>', this.pointer) + 1;
        let isEmpty: boolean = this.source[this.pointer - 1] === '/';
        if (!isEmpty) {
            this.stack.push(this.document.getRoot());
            this.currentElement = this.document.getRoot();
            this.parseElement();
        }
    }

    startElement() {
        let name: string = '';
        let i = this.pointer + 1;
        for (; !(XMLUtils.isXmlSpace(this.source[i]) || this.source[i] === '/' || this.source[i] === '>'); i++) {
            name += this.source[i];
        }
        let element: Element = new Element(name);
        let attributesPortion: string = '';
        for (; !(this.source[i] === '/' || this.source[i] === '>'); i++) {
            attributesPortion += this.source[i];
        }
        let atts: Map<string, Attribute> = this.parseAttributes(attributesPortion);
        atts.forEach((value: Attribute) => {
            element.setAttribute(value);
        });
        this.currentElement.addElement(element);
        this.pointer = this.source.indexOf('>', this.pointer) + 1;
        let isEmpty: boolean = this.source[this.pointer - 2] === '/';
        if (!isEmpty) {
            this.stack.push(element);
            this.currentElement = element;
            this.parseElement();
        }
    }

    parseElement(): void {
        let inElement: boolean = true;
        while (inElement) {
            if (this.lookingAt('</')) {
                this.endElement();
                return;
            }
            if (this.lookingAt('<!--')) {
                this.parseComment();
                continue;
            }
            if (this.lookingAt('<?')) {
                this.parseProcessingInstruction();
                continue;
            }
            if (this.lookingAt('<![CDATA[')) {
                this.parseCData();
                continue;
            }
            if (this.lookingAt('<')) {
                this.startElement();
                continue;
            }
            if (this.pointer < this.source.length) {
                let index = this.source.indexOf('<', this.pointer);
                if (index !== -1) {
                    let text: string = this.source.substring(this.pointer, index);
                    this.currentElement.addString(text);
                    this.pointer += text.length
                    continue;
                }
            }
            inElement = false;
        }
        throw new Error('Error parsing element');
    }

    endElement(): void {
        if (this.lookingAt('</' + this.currentElement.getName() + '>')) {
            this.pointer += ('</' + this.currentElement.getName() + '>').length;
            this.stack.pop(); // get rid of the element we are closing
            if (this.stack.length > 0) {
                this.currentElement = this.stack[this.stack.length - 1];
            }
            return;
        }
        throw new Error('Malformed element');
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
        let content: string = this.source.substring(this.pointer, index + '-->'.length);
        this.pointer += content.length;
        let comment: Comment = new Comment(content.substring('<!--'.length, content.length - '-->'.length));
        if (this.inProlog) {
            this.prologContent.push(comment);
        } else {
            if (this.stack.length === 0) {
                this.document.addComment(comment);
            } else {
                this.currentElement.addComment(comment);
            }
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
            if (XMLUtils.isXmlSpace(char)) {
                break;
            }
            target += char;
        }
        for (; instructionText.length; i++) {
            let char: string = instructionText[i];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        let value: string = instructionText.substring(i);
        let pi: ProcessingInstruction = new ProcessingInstruction(target, value);
        if (this.inProlog) {
            this.prologContent.push(pi);
        } else {
            if (this.stack.length === 0) {
                this.document.addProcessingInstruction(pi);
            } else {
                this.currentElement.addProcessingInstruction(pi);
            }
        }
    }

    parseAttributes(original: string): Map<string, Attribute> {
        let attributes: Map<string, Attribute> = new Map();
        let text: string = original.trim();
        let pairs: string[] = [];
        let separator: string = '';
        while (text.indexOf('=') != -1) {
            let i: number = 0;
            for (; i < text.length; i++) {
                let char = text[i];
                if (XMLUtils.isXmlSpace(char) || '=' === char) {
                    break;
                }
            }
            for (; i < text.length; i++) {
                let char = text[i];
                if (separator === '' && ('\'' === char || '"' === char)) {
                    separator = char;
                    continue;
                }
                if (char === separator) {
                    break;
                }
            }
            // end of value
            let pair = text.substring(0, i + 1).trim();
            pairs.push(pair);
            text = text.substring(pair.length).trim();
            separator = '';
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

    parseCData(): void {
        let index: number = this.source.indexOf(']]>', this.pointer);
        if (index === -1) {
            throw new Error('Malformed CData');
        }
        let instructionText = this.source.substring(this.pointer, this.pointer + index + ']]>'.length);
        this.pointer += instructionText.length;
        instructionText = instructionText.substring('<![CDATA['.length, instructionText.length - ']]>'.length);
        this.currentElement.addCData(new CData(instructionText));
    }
}