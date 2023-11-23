/*******************************************************************************
 * Copyright (c) 2023 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { ContentHandler } from "./ContentHandler";
import { FileReader } from "./FileReader";
import { XMLAttribute } from "./XMLAttribute";
import { XMLUtils } from "./XMLUtils";

export class SAXParser {

    contentHandler: ContentHandler;
    reader: FileReader;
    pointer: number;
    buffer: string;
    fileSize: number;
    encoding: BufferEncoding;
    elementStack: number;
    characterRun: string;
    rootParsed: boolean;

    constructor() {
        this.characterRun = '';
        this.elementStack = 0;
        this.pointer = 0;
        this.rootParsed = false;
    }

    setContentHandler(contentHandler: ContentHandler): void {
        this.contentHandler = contentHandler;
    }

    parse(path: string, encoding?: BufferEncoding): void {
        this.encoding = encoding ? encoding : FileReader.detectEncoding(path);
        this.reader = new FileReader(path, encoding);
        this.fileSize = this.reader.getFileSize();
        this.buffer = this.reader.read();
        this.readDocument();
    }

    readDocument(): void {
        this.contentHandler.startDocument();
        while (this.pointer < this.buffer.length) {
            if (this.lookingAt('<?xml ') || this.lookingAt('<?xml\t') || this.lookingAt('<?xml\r') || this.lookingAt('<?xml\n')) {
                this.parseXMLDecl();
                continue;
            }
            if (this.lookingAt('<!DOCTYPE')) {
                this.parseDoctype();
                continue;
            }
            if (this.lookingAt('<!--')) {
                this.parseComment();
                continue;
            }
            if (this.lookingAt('<?')) {
                this.parseProcessingInstruction();
                continue;
            }
            if (this.lookingAt('</')) {
                this.endElement();
                continue;
            }
            if (this.lookingAt('<![CDATA[')) {
                this.startCDATA();
                continue;
            }
            if (this.lookingAt(']]>')) {
                this.endCDATA();
                continue;
            }
            if (this.lookingAt('&')) {
                this.parseEntityReference();
                continue;
            }
            if (this.lookingAt('<')) {
                this.startElement();
                continue;
            }
            let char: string = this.buffer.charAt(this.pointer);
            if (!this.rootParsed && !XMLUtils.isXmlSpace(char)) {
                throw new Error('Malformed XML document: text found in prolog');
            }
            if (this.rootParsed && this.elementStack === 0 && !XMLUtils.isXmlSpace(char)) {
                throw new Error('Malformed XML document: text found after root element');
            }
            this.characterRun += char;
            this.pointer++;
            if (this.pointer > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
            if (this.rootParsed && this.elementStack === 0) {
                this.contentHandler.endDocument();
            }
        }
        if (this.elementStack !== 0) {
            throw new Error('Malformed XML document: unclosed elements');
        }
        this.cleanCharacterRun();
    }

    parseEntityReference() {
        this.cleanCharacterRun();
        this.pointer++; // skip '&'
        let name: string = '';
        while (!this.lookingAt(';')) {
            name += this.buffer.charAt(this.pointer++);
            if (this.pointer > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        if (name === 'lt') {
            this.contentHandler.characters('<');
        } else if (name === 'gt') {
            this.contentHandler.characters('>');
        } else if (name === 'amp') {
            this.contentHandler.characters('&');
        } else if (name === 'apos') {
            this.contentHandler.characters('\'');
        } else if (name === 'quot') {
            this.contentHandler.characters('"');
        } else if (name.startsWith('#x')) {
            let code: number = parseInt(name.substring(2), 16);
            this.contentHandler.characters(String.fromCharCode(code));
        } else if (name.startsWith('#')) {
            let code: number = parseInt(name.substring(1));
            this.contentHandler.characters(String.fromCharCode(code));
        } else {
            this.contentHandler.skippedEntity(name);
        }
        this.pointer++; // skip ';'
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;
    }

    startElement() {
        this.cleanCharacterRun();
        this.pointer++; // skip '<'
        let name: string = '';
        while (!XMLUtils.isXmlSpace(this.buffer.charAt(this.pointer)) && !this.lookingAt('>') && !this.lookingAt('/>')) {
            name += this.buffer.charAt(this.pointer++);
            if (this.pointer > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        let rest: string = '';
        while (!this.lookingAt('>') && !this.lookingAt('/>')) {
            rest += this.buffer.charAt(this.pointer++);
            if (this.pointer > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        rest = rest.trim();
        let attributesMap: Map<string, string> = this.parseAttributes(rest);
        let attributes: Array<XMLAttribute> = [];
        attributesMap.forEach((value: string, key: string) => {
            let attribute: XMLAttribute = new XMLAttribute(key, value);
            attributes.push(attribute);
        });
        this.contentHandler.startElement(name, attributes);
        this.elementStack++;
        if (!this.rootParsed) {
            this.rootParsed = true;
        }
        if (this.lookingAt('/>')) {
            this.contentHandler.endElement(name);
            this.elementStack--;
            this.pointer += 2; // skip '/>'
        } else {
            this.pointer++; // skip '>'
        }
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;
    }

    endElement() {
        this.cleanCharacterRun();
        this.pointer += 2; // skip '</'
        let name: string = '';
        while (!this.lookingAt('>')) {
            name += this.buffer.charAt(this.pointer++);
        }
        this.contentHandler.endElement(name);
        this.elementStack--;
        this.pointer++; // skip '>'
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;
    }

    cleanCharacterRun(): void {
        if (this.characterRun !== '') {
            if (this.rootParsed) {
                if (this.elementStack === 0) {
                    // document ended
                    this.contentHandler.ignorableWhitespace(this.characterRun);
                } else {
                    // in an element
                    this.contentHandler.characters(this.characterRun);
                }
            } else {
                // in prolog
                this.contentHandler.ignorableWhitespace(this.characterRun);
            }
            this.characterRun = '';
        }
    }

    parseComment(): void {
        this.cleanCharacterRun();
        let comment: string = '';
        this.pointer += 4; // skip '<!--'
        while (!this.lookingAt('-->')) {
            comment += this.buffer.charAt(this.pointer++);
        }
        this.buffer = this.buffer.substring(this.pointer + 3); // skip '-->'
        this.pointer = 0;
        this.contentHandler.comment(comment);
    }

    parseProcessingInstruction(): void {
        this.cleanCharacterRun();
        let instructionText: string = '';
        let target: string = '';
        let data: string = '';
        this.pointer += 2; // skip '<?'
        while (!this.lookingAt('?>')) {
            instructionText += this.buffer.charAt(this.pointer++);
        }
        instructionText = instructionText.trim();
        let i: number = 0;
        // read target
        for (; i < instructionText.length; i++) {
            let char: string = instructionText[i];
            if (XMLUtils.isXmlSpace(char)) {
                break;
            }
            target += char;
        }
        // skip spaces
        for (; i < instructionText.length; i++) {
            let char: string = instructionText[i];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        // set data
        data = instructionText.substring(i);
        this.buffer = this.buffer.substring(this.pointer + 2); // skip '?>'
        this.pointer = 0;
        this.contentHandler.processingInstruction(target, data);
    }

    parseDoctype() {
        let declaration: string = '';
        this.pointer += 9; // skip '<!DOCTYPE'
        let i: number = 0;
        // skip spaces before root name
        for (; i < this.buffer.length; i++) {
            let char: string = this.buffer.charAt(this.pointer + i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.pointer + i + 1 >= this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        this.pointer += i;
        i = 0;
        // read name
        let name: string = '';
        for (; i < this.buffer.length; i++) {
            let char: string = this.buffer.charAt(this.pointer + i);
            if (XMLUtils.isXmlSpace(char)) {
                break;
            }
            name += char;
            if (this.pointer + i + 1 >= this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        this.pointer += i;
        i = 0;
        // skip spaces after root name
        for (; i < this.buffer.length; i++) {
            let char: string = this.buffer.charAt(this.pointer + i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.pointer + i + 1 >= this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        this.pointer += i;
        // read the rest of the declaration
        let stack: number = 1;
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char: string = this.buffer[this.pointer];
            if ('<' === char) {
                stack++;
            }
            if ('>' === char) {
                stack--;
                if (stack === 0) {
                    break;
                }
            }
            declaration += char;
            if (this.pointer + 1 > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        this.buffer = this.buffer.substring(this.pointer + 1); // skip '>'
        this.pointer = 0;
        let systemId: string = this.extractSystem(declaration);
        let publicId: string = this.extractPublic(declaration);
        let internalSubset: string = this.extractInternal(declaration);
        this.contentHandler.startDTD(name, publicId, systemId);
        if (internalSubset !== '') {
            this.contentHandler.internalSubset(internalSubset);
        }
        this.contentHandler.endDTD();
    }

    extractInternal(declaration: string): string {
        let index = declaration.indexOf('[');
        if (index === -1) {
            return '';
        }
        let end = declaration.indexOf(']');
        if (end === -1) {
            return '';
        }
        return declaration.substring(index + 1, end);
    }

    extractPublic(declaration: string): string {
        let index = declaration.indexOf('PUBLIC');
        if (index === -1) {
            return '';
        }
        // skip spaces after PUBLIC
        let i: number = 6;
        for (; i < declaration.length; i++) {
            let char = declaration[i];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        let separator: string = '';
        let publicId: string = '';
        for (; i < declaration.length; i++) {
            let char = declaration[i];
            if (separator === '' && ('\'' === char || '"' === char)) {
                separator = char;
                continue;
            }
            if (char === separator) {
                break;
            }
            publicId += char;
        }
        return publicId;
    }

    extractSystem(declaration: string): string {
        let index: number = declaration.indexOf('SYSTEM');
        if (index === -1) {
            return '';
        }
        // skip spaces after SYSTEM
        let i: number = 6;
        for (; i < declaration.length; i++) {
            let char = declaration[i];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        let separator: string = '';
        let systemId: string = '';
        for (; i < declaration.length; i++) {
            let char = declaration[i];
            if (separator === '' && ('\'' === char || '"' === char)) {
                separator = char;
                continue;
            }
            if (char === separator) {
                break;
            }
            systemId += char;
        }
        return systemId;
    }

    parseXMLDecl() {
        let declarationText: string = '';
        this.pointer += 6; // skip '<?xml '
        while (!this.lookingAt('?>')) {
            declarationText += this.buffer.charAt(this.pointer++);
        }
        declarationText = declarationText.trim();
        let attributes: Map<string, string> = this.parseAttributes(declarationText);
        this.buffer = this.buffer.substring(this.pointer + 2); // skip '?>'
        this.pointer = 0;
        this.contentHandler.xmlDeclaration(attributes.get('version'), attributes.get('encoding'), attributes.get('standalone'));
    }

    lookingAt(text: string): boolean {
        let length: number = text.length;
        if (this.pointer + length > this.buffer.length && this.reader.dataAvailable()) {
            this.buffer += this.reader.read();
        }
        if (this.pointer + length > this.buffer.length) {
            return false;
        }
        for (let i = 0; i < length; i++) {
            if (this.buffer[this.pointer + i] !== text[i]) {
                return false;
            }
        }
        return true;
    }

    parseAttributes(text: string): Map<string, string> {
        let map = new Map<string, string>();
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
        pairs.forEach((pair: string) => {
            let index = pair.indexOf('=');
            if (index === -1) {
                throw new Error('Malformed attributes list');
            }
            let name = pair.substring(0, index).trim();
            let value = pair.substring(index + 2, pair.length - 1);
            map.set(name, value);
        });
        return map;
    }

    startCDATA() {
        this.cleanCharacterRun();
        this.pointer += 9; // skip '<![CDATA['
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;
        this.contentHandler.startCDATA();
    }

    endCDATA() {
        this.cleanCharacterRun();
        this.pointer += 3; // skip ']]>'
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;
        this.contentHandler.endCDATA();
    }

}