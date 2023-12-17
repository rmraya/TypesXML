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
import { StringReader } from "./StringReader";
import { XMLAttribute } from "./XMLAttribute";
import { XMLReader } from "./XMLReader";
import { XMLUtils } from "./XMLUtils";

export class SAXParser {

    contentHandler: ContentHandler;
    reader: XMLReader;
    pointer: number;
    buffer: string;
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

    parseFile(path: string, encoding?: BufferEncoding): void {
        if (!this.contentHandler) {
            throw new Error('ContentHandler not set');
        }
        if (!encoding) {
            encoding = FileReader.detectEncoding(path);
        }
        this.reader = new FileReader(path, encoding);
        this.buffer = this.reader.read();
        this.contentHandler.initialize();
        this.readDocument();
    }

    parseString(string: string): void {
        if (!this.contentHandler) {
            throw new Error('ContentHandler not set');
        }
        this.reader = new StringReader(string);
        this.buffer = this.reader.read();
        this.contentHandler.initialize();
        this.readDocument();
    }

    readDocument(): void {
        this.contentHandler.startDocument();
        while (this.pointer < this.buffer.length) {
            if (this.lookingAt('<?xml ') || this.lookingAt('<?xml\t') || this.lookingAt('<?xml\r') || this.lookingAt('<?xml\n')) {
                this.parseXMLDeclaration();
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
            this.cleanCharacterRun();
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
        this.cleanCharacterRun();
        this.pointer += 9; // skip '<!DOCTYPE'
        // skip spaces before root name
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.pointer + 1 > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        // read name
        let name: string = '';
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char: string = this.buffer.charAt(this.pointer);
            if (XMLUtils.isXmlSpace(char)) {
                break;
            }
            name += char;
            if (this.pointer + 1 >= this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        // skip spaces after root name
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.pointer + 1 > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        // read external identifiers
        let systemId: string = '';
        if (this.lookingAt('SYSTEM')) {
            this.parseSystemDeclaration();
        }
        let publicId: string = '';
        if (this.lookingAt('PUBLIC')) {
            let pair: string[] = this.parsePublicDeclaration();
            publicId = pair[0];
            systemId = pair[1];
        }
        this.contentHandler.startDTD(name, publicId, systemId);
        // skip spaces after SYSTEM or PUBLIC
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.pointer + 1 > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        // check internal subset
        let internalSubset: string = '';
        if (this.lookingAt('[')) {
            this.pointer++; // skip '['
            for (; this.pointer < this.buffer.length; this.pointer++) {
                let char: string = this.buffer[this.pointer];
                if (']' === char) {
                    break;
                }
                internalSubset += char;
                if (this.pointer + 1 > this.buffer.length && this.reader.dataAvailable()) {
                    this.buffer += this.reader.read();
                }
            }
        }
        this.pointer++; // skip ']'
        // skip spaces after internal subset
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.pointer + 1 > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        this.pointer++; // skip '>'
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;
        if (internalSubset !== '') {
            this.contentHandler.internalSubset(internalSubset);
        }
        this.contentHandler.endDTD();
    }

    parsePublicDeclaration(): string[] {
        this.pointer += 6; // skip 'PUBLIC'
        // skip spaces after PUBLIC
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.pointer + 1 > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        let separator: string = '';
        let publicId: string = '';
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (separator === '' && ('\'' === char || '"' === char)) {
                separator = char;
                continue;
            }
            if (char === separator) {
                this.pointer++; // skip separator
                break;
            }
            publicId += char;
            if (this.pointer + 1 > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        // skip spaces after publicId
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.pointer + 1 > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        separator = '';
        let systemIdId: string = '';
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (separator === '' && ('\'' === char || '"' === char)) {
                separator = char;
                continue;
            }
            if (char === separator) {
                this.pointer++; // skip separator
                break;
            }
            systemIdId += char;
            if (this.pointer + 1 > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        return [publicId, systemIdId];
    }

    parseSystemDeclaration(): string {
        this.pointer += 6; // skip 'SYSTEM'
        // skip spaces after SYSTEM
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.pointer + 1 > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        let separator: string = '';
        let systemId: string = '';
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (separator === '' && ('\'' === char || '"' === char)) {
                separator = char;
                continue;
            }
            if (char === separator) {
                this.pointer++; // skip separator
                break;
            }
            systemId += char;
            if (this.pointer + 1 > this.buffer.length && this.reader.dataAvailable()) {
                this.buffer += this.reader.read();
            }
        }
        return systemId;
    }

    parseXMLDeclaration() {
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