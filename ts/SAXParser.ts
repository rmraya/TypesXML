/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *******************************************************************************/

import { unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { ContentHandler } from "./ContentHandler";
import { FileReader } from "./FileReader";
import { XMLAttribute } from "./XMLAttribute";
import { XMLUtils } from "./XMLUtils";
import { DTDParser } from "./dtd/DTDParser";
import { Grammar } from "./grammar/Grammar";

export class SAXParser {

    contentHandler: ContentHandler | undefined;
    reader: FileReader | undefined;
    pointer: number;
    buffer: string = '';
    elementStack: number;
    elementNameStack: string[] = [];
    xmlSpaceStack: string[] = [];
    characterRun: string;
    rootParsed: boolean;
    xmlVersion: string;
    validating: boolean;
    inCDATA: boolean;
    silent: boolean;
    grammar: Grammar;

    static readonly MIN_BUFFER_SIZE: number = 2048;
    static path = require('path');

    constructor() {
        this.characterRun = '';
        this.elementStack = 0;
        this.pointer = 0;
        this.rootParsed = false;
        this.xmlVersion = '1.0';
        this.validating = false;
        this.inCDATA = false;
        this.silent = false;
        this.grammar = new Grammar();
    }

    setContentHandler(contentHandler: ContentHandler): void {
        this.contentHandler = contentHandler;
        this.contentHandler.setValidating(this.validating);
    }

    setValidating(validating: boolean): void {
        this.validating = validating;
        if (this.contentHandler) {
            this.contentHandler.setValidating(validating);
        }
    }

    isValidating(): boolean {
        return this.validating;
    }

    setSilent(silent: boolean): void {
        this.silent = silent;
    }

    isSilent(): boolean {
        return this.silent;
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
        this.reader.closeFile();
    }

    parseString(data: string): void {
        if (!this.contentHandler) {
            throw new Error('ContentHandler not set');
        }
        const letters: string = 'abcdefghijklmnopqrstuvxyz';
        let name: string = '';
        for (let i: number = 0; i < 8; i++) {
            const randomNumber: number = Math.floor(Math.random() * 24);
            let letter: string = letters.charAt(randomNumber);
            name += letter;
        }
        name = name + '.xml';
        let tempFile: string = SAXParser.path.join(tmpdir(), name);
        writeFileSync(tempFile, data, { encoding: 'utf8' });
        this.parseFile(tempFile, 'utf8');
        unlinkSync(tempFile);
    }

    readDocument(): void {
        this.contentHandler!.startDocument();
        while (this.pointer < this.buffer.length) {
            // If we're in CDATA mode, only look for the end marker
            if (this.inCDATA) {
                if (this.lookingAt(']]>')) {
                    this.endCDATA();
                    continue;
                } else {
                    // In CDATA mode, everything is character data
                    let char: string = this.buffer.charAt(this.pointer);
                    this.characterRun += char;
                    this.pointer++;
                    // Buffer management is handled by the main loop
                    continue;
                }
            }

            // Normal parsing mode
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
                // Well-formedness check: ]]> sequence not allowed outside CDATA
                if (!this.inCDATA) {
                    throw new Error('Well-formedness error: "]]>" sequence is not allowed outside CDATA sections');
                }
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

            // Well-formedness check: validate XML characters - handle surrogate pairs
            let charCode = this.buffer.codePointAt(this.pointer);
            if (charCode !== undefined) {
                const isValid = this.xmlVersion === '1.0' ?
                    XMLUtils.isValidXml10Char(charCode) :
                    XMLUtils.isValidXml11Char(charCode);
                if (!isValid) {
                    throw new Error(`Invalid XML character: U+${charCode.toString(16).toUpperCase().padStart(4, '0')} is not allowed in XML ${this.xmlVersion}`);
                }
                
                // Get the complete character (handles surrogate pairs)
                char = String.fromCodePoint(charCode);
            } else {
                throw new Error('Invalid character: undefined character code encountered');
            }

            if (!this.rootParsed && !XMLUtils.isXmlSpace(char)) {
                throw new Error('Malformed XML document: text found in prolog');
            }
            if (this.rootParsed && this.elementStack === 0 && !XMLUtils.isXmlSpace(char)) {
                throw new Error('Malformed XML document: text found after root element');
            }
            this.characterRun += char;
            
            // Advance pointer correctly for surrogate pairs
            this.pointer += (charCode! > 0xFFFF) ? 2 : 1;
            
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }
        }
        if (this.elementStack !== 0) {
            throw new Error('Malformed XML document: unclosed elements');
        }
        this.cleanCharacterRun();
        if (this.rootParsed) {
            this.contentHandler!.endDocument();
        }
    }

    parseEntityReference() {
        this.cleanCharacterRun();
        this.pointer++; // skip '&'
        let name: string = '';

        while (!this.lookingAt(';')) {
            // Check if we need more data in the buffer
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }

            // Check if we've reached the end of the buffer and no more data is available
            if (this.pointer >= this.buffer.length) {
                if (!this.reader?.dataAvailable()) {
                    // No more data available - malformed entity
                    throw new Error('Malformed entity reference: missing closing ;');
                }
                // Try to read more data
                this.buffer += this.reader?.read();
                if (this.pointer >= this.buffer.length) {
                    throw new Error('Malformed entity reference: missing closing ;');
                }
            }

            let char = this.buffer.charAt(this.pointer);

            // Check for invalid characters that would indicate a malformed entity
            if (XMLUtils.isXmlSpace(char) || char === '<' || char === '&') {
                throw new Error('Malformed entity reference: invalid character in entity name');
            }

            name += char;
            this.pointer++;
        }

        // Check for valid entity names
        if (name.length === 0) {
            throw new Error('Invalid entity reference: entity name cannot be empty');
        }

        // Character references (#123 or #xABC) have different rules
        if (name.startsWith('#')) {
            if (name.length === 1) {
                throw new Error('Invalid character reference: missing numeric value');
            }
            if (name.startsWith('#x')) {
                // Hexadecimal character reference
                if (name.length === 2) {
                    throw new Error('Invalid hexadecimal character reference: missing hex digits');
                }
                const hexPart = name.substring(2);
                if (!/^[0-9a-fA-F]+$/.test(hexPart)) {
                    throw new Error(`Invalid hexadecimal character reference: "${name}" contains non-hex characters`);
                }
            } else {
                // Decimal character reference
                const decPart = name.substring(1);
                if (!/^[0-9]+$/.test(decPart)) {
                    throw new Error(`Invalid decimal character reference: "${name}" contains non-numeric characters`);
                }
            }
        } else {
            // Named entity reference
            if (!XMLUtils.isValidXMLName(name)) {
                throw new Error(`Invalid entity reference: "${name}" - entity names must be valid XML names`);
            }
        }

        if (name === 'lt') {
            this.contentHandler!.characters('<');
        } else if (name === 'gt') {
            this.contentHandler!.characters('>');
        } else if (name === 'amp') {
            this.contentHandler!.characters('&');
        } else if (name === 'apos') {
            this.contentHandler!.characters('\'');
        } else if (name === 'quot') {
            this.contentHandler!.characters('"');
        } else if (name.startsWith('#x')) {
            let code: number = parseInt(name.substring(2), 16);
            // Well-formedness check: validate character code
            const isValid = this.xmlVersion === '1.0' ?
                XMLUtils.isValidXml10Char(code) :
                XMLUtils.isValidXml11Char(code);
            if (!isValid) {
                throw new Error(`Invalid character reference: &#x${name.substring(2)}; (U+${code.toString(16).toUpperCase().padStart(4, '0')}) is not allowed in XML ${this.xmlVersion}`);
            }
            let char: string = String.fromCodePoint(code);
            this.contentHandler!.characters(char);
        } else if (name.startsWith('#')) {
            let code: number = parseInt(name.substring(1));
            // Well-formedness check: validate character code
            const isValid = this.xmlVersion === '1.0' ?
                XMLUtils.isValidXml10Char(code) :
                XMLUtils.isValidXml11Char(code);
            if (!isValid) {
                throw new Error(`Invalid character reference: &#${code}; (U+${code.toString(16).toUpperCase().padStart(4, '0')}) is not allowed in XML ${this.xmlVersion}`);
            }
            let char: string = String.fromCodePoint(code);
            this.contentHandler!.characters(char);
        } else {
            // Look up entity in DTD
            const entity = this.grammar.getEntity(name);
            if (entity) {
                // Expand the entity
                let entityValue = entity.getValue();
                if (entityValue !== null && entityValue !== undefined) {
                    // Entity has a defined value (could be empty string, which is valid)
                    if (entityValue.length > 0) {
                        // Expand character references within the entity value
                        entityValue = this.expandCharacterReferences(entityValue);

                        // Classify and handle entity content based on what it contains
                        this.handleEntityContent(entityValue);
                    } else {
                        // Legitimate empty entity (entityValue === "")
                        this.contentHandler!.characters('');
                    }
                } else {
                    // Entity exists but has null/undefined value - this is problematic
                    throw new Error(`Entity "${name}" is declared but has no defined value`);
                }
            } else {
                // Entity not found - handle as skipped entity
                this.contentHandler!.skippedEntity(name);
            }
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
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }
        }

        // Check for valid XML element names
        if (!XMLUtils.isValidXMLName(name)) {
            throw new Error(`Invalid element name: "${name}" - XML names must start with a letter, underscore, or colon`);
        }

        let rest: string = '';
        while (!this.lookingAt('>') && !this.lookingAt('/>')) {
            rest += this.buffer.charAt(this.pointer++);
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }
        }
        rest = rest.trim();
        let attributesMap: Map<string, string> = this.parseAttributes(rest);

        // Apply DTD-aware attribute value normalization and add default attributes
        attributesMap = this.normalizeAndDefaultAttributes(name, attributesMap);

        // Track xml:space attribute for whitespace handling
        const xmlSpaceValue = attributesMap.get('xml:space');
        if (xmlSpaceValue === 'preserve') {
            this.xmlSpaceStack.push('preserve');
        } else if (xmlSpaceValue === 'default') {
            this.xmlSpaceStack.push('default');
        } else {
            // Inherit from parent (or default if at root)
            const currentSpace = this.xmlSpaceStack.length > 0 ?
                this.xmlSpaceStack[this.xmlSpaceStack.length - 1] : 'default';
            this.xmlSpaceStack.push(currentSpace);
        }

        let attributes: Array<XMLAttribute> = [];
        attributesMap.forEach((value: string, key: string) => {
            let attribute: XMLAttribute = new XMLAttribute(key, value);
            attributes.push(attribute);
        });
        this.contentHandler!.startElement(name, attributes);
        this.elementStack++;
        this.elementNameStack.push(name); // Track element for well-formedness checking
        if (!this.rootParsed) {
            this.rootParsed = true;
        }
        if (this.lookingAt('/>')) {
            this.cleanCharacterRun();
            this.contentHandler!.endElement(name);
            this.elementStack--;
            this.elementNameStack.pop(); // Remove from stack for self-closing tags
            this.xmlSpaceStack.pop(); // Remove xml:space state for self-closing tags
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
        
        // Read tag name until '>'
        while (!this.lookingAt('>')) {
            let char = this.buffer.charAt(this.pointer);
            
            // Well-formedness check: no whitespace allowed between name and '>' in end tags
            if (XMLUtils.isXmlSpace(char)) {
                throw new Error(`Well-formedness error: whitespace is not allowed between element name and '>' in end tag "</${name}"`);
            }
            
            name += char;
            this.pointer++;
        }

        // Well-formedness check: mismatched element tags
        if (this.elementNameStack.length === 0) {
            throw new Error(`Mismatched element tags: found closing tag "${name}" but no elements are open`);
        }
        const expectedName = this.elementNameStack.pop();
        if (name !== expectedName) {
            throw new Error(`Mismatched element tags: expected closing tag for "${expectedName}" but found "${name}"`);
        }

        this.contentHandler!.endElement(name);
        this.elementStack--;
        this.xmlSpaceStack.pop(); // Remove xml:space state when element ends
        this.pointer++; // skip '>'
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;
    }

    cleanCharacterRun(): void {
        if (this.characterRun !== '') {
            if (this.rootParsed) {
                if (this.elementStack === 0) {
                    // document ended
                    // Normalize line endings per XML 1.0 spec section 2.11
                    const normalizedContent = XMLUtils.normalizeLines(this.characterRun);
                    this.contentHandler!.ignorableWhitespace(normalizedContent);
                } else {
                    // in an element - check xml:space
                    const preserveWhitespace = this.isXmlSpacePreserve();
                    if (preserveWhitespace || !this.isWhitespaceOnly(this.characterRun)) {
                        // Preserve whitespace or contains non-whitespace - treat as significant
                        // Normalize line endings per XML 1.0 spec section 2.11
                        const normalizedContent = XMLUtils.normalizeLines(this.characterRun);
                        this.contentHandler!.characters(normalizedContent);
                    } else {
                        // Default mode and only whitespace - treat as ignorable
                        // Normalize line endings per XML 1.0 spec section 2.11
                        const normalizedContent = XMLUtils.normalizeLines(this.characterRun);
                        this.contentHandler!.ignorableWhitespace(normalizedContent);
                    }
                }
            } else {
                // in prolog
                this.contentHandler!.ignorableWhitespace(this.characterRun);
            }
            this.characterRun = '';
        }
    }

    private isXmlSpacePreserve(): boolean {
        return this.xmlSpaceStack.length > 0 &&
            this.xmlSpaceStack[this.xmlSpaceStack.length - 1] === 'preserve';
    }

    private isWhitespaceOnly(text: string): boolean {
        return /^\s*$/.test(text);
    }

    parseComment(): void {
        this.cleanCharacterRun();
        let comment: string = '';
        this.pointer += 4; // skip '<!--'

        while (!this.lookingAt('-->')) {
            // Check if we need more data in the buffer
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }

            // Check if we've reached the end of the buffer and no more data is available
            if (this.pointer >= this.buffer.length) {
                if (!this.reader?.dataAvailable()) {
                    // No more data available - malformed comment
                    throw new Error('Malformed comment: missing closing -->');
                }
                // Try to read more data
                this.buffer += this.reader?.read();
                if (this.pointer >= this.buffer.length) {
                    throw new Error('Malformed comment: missing closing -->');
                }
            }

            let char = this.buffer.charAt(this.pointer);
            comment += char;
            this.pointer++;

            // In validation mode, check for XML compliance violations as we build the comment
            if (this.validating && comment.endsWith('--') && !this.lookingAt('>')) {
                throw new Error('Invalid comment: comments must not contain "--"');
            }
        }

        // Final validation check for non-validating mode
        if (!this.validating && comment.includes('--')) {
            if (!this.silent) {
                console.warn('XML Warning: Comments should not contain "--"');
            }
        }

        this.buffer = this.buffer.substring(this.pointer + 3); // skip '-->'
        this.pointer = 0;
        this.contentHandler!.comment(comment);
    }

    parseProcessingInstruction(): void {
        this.cleanCharacterRun();
        let instructionText: string = '';
        let target: string = '';
        let data: string = '';
        this.pointer += 2; // skip '<?'

        while (!this.lookingAt('?>')) {
            // Check if we need more data in the buffer
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }

            // Check if we've reached the end of the buffer and no more data is available
            if (this.pointer >= this.buffer.length) {
                if (!this.reader?.dataAvailable()) {
                    // No more data available - malformed PI
                    throw new Error('Malformed processing instruction: missing closing ?>');
                }
                // Try to read more data
                this.buffer += this.reader?.read();
                if (this.pointer >= this.buffer.length) {
                    throw new Error('Malformed processing instruction: missing closing ?>');
                }
            }

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

        // Check for valid PI target
        if (target.length === 0) {
            throw new Error('Invalid processing instruction: target cannot be empty');
        }
        if (!XMLUtils.isValidXMLName(target)) {
            throw new Error(`Invalid processing instruction target: "${target}" - must be a valid XML name`);
        }
        // PI targets cannot be "xml" (case insensitive)
        if (target.toLowerCase() === 'xml') {
            throw new Error('Invalid processing instruction: target cannot be "xml"');
        }

        this.buffer = this.buffer.substring(this.pointer + 2); // skip '?>'
        this.pointer = 0;
        this.contentHandler!.processingInstruction(target, data);
    }

    parseDoctype() {
        this.cleanCharacterRun();
        this.pointer += 9; // skip '<!DOCTYPE'
        // skip spaces before root name
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char: string = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
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
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }
        }
        // skip spaces after root name
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }
        }
        // read external identifiers
        let systemId: string = '';
        if (this.lookingAt('SYSTEM')) {
            systemId = this.parseSystemDeclaration();
        }
        let publicId: string = '';
        if (this.lookingAt('PUBLIC')) {
            let pair: string[] = this.parsePublicDeclaration();
            publicId = pair[0];
            systemId = pair[1];
        }
        this.contentHandler!.startDTD(name, publicId, systemId);
        // skip spaces after SYSTEM or PUBLIC
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }
        }
        // check internal subset
        let internalSubset: string = '';
        if (this.lookingAt('[')) {
            this.pointer++; // skip '['
            let inQuote: boolean = false;
            let quoteChar: string = '';

            for (; this.pointer < this.buffer.length; this.pointer++) {
                let char: string = this.buffer[this.pointer];

                // Handle quoted strings - don't treat ] inside quotes as subset end
                if (!inQuote && (char === '"' || char === "'")) {
                    inQuote = true;
                    quoteChar = char;
                } else if (inQuote && char === quoteChar) {
                    inQuote = false;
                    quoteChar = '';
                }

                // Only break on ] when not inside quotes
                if (!inQuote && ']' === char) {
                    break;
                }

                internalSubset += char;
                if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                    this.buffer += this.reader?.read();
                }
            }
            this.pointer++; // skip ']'
        }
        // skip spaces after internal subset
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }
        }
        this.pointer++; // skip '>'
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;
        if (internalSubset !== '') {
            this.contentHandler!.internalSubset(internalSubset);
            // Parse the internal subset to extract entity declarations
            try {
                const dtdParser = new DTDParser(this.grammar);
                dtdParser.parseString(internalSubset);
            } catch (error) {
                if (!this.silent) {
                    console.warn('DTD parsing warning:', (error as Error).message);
                }
            }
        }
        this.contentHandler!.endDTD();
    }

    parsePublicDeclaration(): string[] {
        this.pointer += 6; // skip 'PUBLIC'
        // skip spaces after PUBLIC
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
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
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }
        }
        // skip spaces after publicId
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
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
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
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
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
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
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
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
        let version: string = attributes.get('version') || '1.0';
        this.xmlVersion = version;
        let encoding: string = attributes.get('encoding') || 'UTF-8';
        this.contentHandler!.xmlDeclaration(version, encoding, attributes.get('standalone'));
    }

    lookingAt(text: string): boolean {
        let length: number = text.length;
        if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
            this.buffer += this.reader?.read();
        }
        if (this.pointer + length > this.buffer.length) {
            return false;
        }
        for (let i: number = 0; i < length; i++) {
            if (this.buffer[this.pointer + i] !== text[i]) {
                return false;
            }
        }
        return true;
    }

    parseAttributes(text: string): Map<string, string> {
        let map: Map<string, string> = new Map<string, string>();
        let pairs: string[] = [];
        let separator: string = '';
        while (text.indexOf('=') != -1) {
            let i: number = 0;
            for (; i < text.length; i++) {
                let char: string = text[i];
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

        // Well-formedness check: validate no extra unpaired characters remain
        if (text.trim().length > 0) {
            throw new Error(`Malformed attributes: unexpected characters "${text.trim()}" that don't form attribute pairs`);
        }

        pairs.forEach((pair: string) => {
            let index = pair.indexOf('=');
            if (index === -1) {
                throw new Error('Malformed attributes list');
            }
            let name = pair.substring(0, index).trim();

            // Well-formedness check: validate attribute name
            if (name.length === 0) {
                throw new Error('Malformed attribute: attribute name cannot be empty');
            }
            if (!XMLUtils.isValidXMLName(name)) {
                throw new Error(`Malformed attribute: "${name}" is not a valid XML attribute name`);
            }

            // Well-formedness check: validate attribute quotes
            let quotedValue = pair.substring(index + 1).trim();
            if (quotedValue.length < 2 ||
                (quotedValue.charAt(0) !== '"' && quotedValue.charAt(0) !== "'") ||
                quotedValue.charAt(0) !== quotedValue.charAt(quotedValue.length - 1)) {
                throw new Error(`Malformed attribute: attribute value must be quoted (found: ${quotedValue})`);
            }

            // Handle spaces around = sign
            let valueStart = index + 1;
            // Skip spaces after =
            while (valueStart < pair.length && XMLUtils.isXmlSpace(pair[valueStart])) {
                valueStart++;
            }
            // Skip opening quote
            if (valueStart < pair.length && (pair[valueStart] === '"' || pair[valueStart] === "'")) {
                valueStart++;
            }
            // Find end (skip closing quote)
            let valueEnd = pair.length - 1;
            if (valueEnd >= 0 && (pair[valueEnd] === '"' || pair[valueEnd] === "'")) {
                // valueEnd is already at the closing quote position, so we want content before it
            } else {
                valueEnd = pair.length;
            }

            let value = pair.substring(valueStart, valueEnd);

            // Expand entity references in attribute values
            value = this.expandAllEntityReferences(value);

            // Normalize attribute value whitespace (XML spec section 3.3.3)
            // Replace line endings (\r\n, \r, \n) and tabs with spaces
            value = value.replace(/\r\n/g, ' ')    // CRLF first (to avoid double replacement)
                .replace(/[\t\n\r]/g, ' '); // Then individual tab, LF, CR

            // Well-formedness check: detect duplicate attributes
            if (map.has(name)) {
                throw new Error(`Duplicate attribute: "${name}" appears more than once in the same element`);
            }

            map.set(name, value);
        });
        return map;
    }

    normalizeAndDefaultAttributes(elementName: string, attributesMap: Map<string, string>): Map<string, string> {
        // Get attribute declarations from DTD
        const dtdAttributes = this.grammar.getElementAttributesMap(elementName);
        if (!dtdAttributes) {
            return attributesMap; // No DTD info, return as-is
        }

        // Create result map starting with parsed attributes
        const result = new Map<string, string>(attributesMap);

        // Process each DTD-declared attribute
        dtdAttributes.forEach((attDecl: any, attrName: string) => {
            const currentValue = result.get(attrName);

            if (currentValue !== undefined) {
                // Attribute exists - apply type-specific normalization
                const normalizedValue = this.normalizeAttributeByType(currentValue, attDecl.getType());
                result.set(attrName, normalizedValue);
            } else if (attDecl.getDefaultValue()) {
                // Attribute not present but has default value - add it
                const defaultValue = this.normalizeAttributeByType(attDecl.getDefaultValue(), attDecl.getType());
                result.set(attrName, defaultValue);
            }
        });

        return result;
    }

    normalizeAttributeByType(value: string, type: string): string {
        // Basic whitespace normalization (already done in parseAttributes for all types)
        // Additional normalization for non-CDATA types
        if (type !== 'CDATA') {
            // For non-CDATA attributes: collapse consecutive whitespace and trim
            return value.replace(/\s+/g, ' ').trim();
        }
        return value;
    }

    startCDATA() {
        this.cleanCharacterRun();
        this.pointer += 9; // skip '<![CDATA['
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;
        this.inCDATA = true;  // Enter CDATA mode
        this.contentHandler!.startCDATA();
    }

    endCDATA() {
        this.cleanCharacterRun();
        this.pointer += 3; // skip ']]>'
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;
        this.inCDATA = false;  // Exit CDATA mode
        this.contentHandler!.endCDATA();
    }

    expandCharacterReferences(text: string): string {
        if (!text || text.indexOf('&#') === -1) {
            return text;
        }

        let result = '';
        let i = 0;

        while (i < text.length) {
            if (text.charAt(i) === '&' && text.charAt(i + 1) === '#') {
                // Found character reference
                let endPos = text.indexOf(';', i);
                if (endPos === -1) {
                    // Malformed character reference - include as is
                    result += text.charAt(i);
                    i++;
                    continue;
                }

                let refText = text.substring(i + 2, endPos); // Skip &#
                let char = '';

                if (refText.startsWith('x') || refText.startsWith('X')) {
                    // Hexadecimal character reference
                    let hexPart = refText.substring(1);
                    if (/^[0-9a-fA-F]+$/.test(hexPart)) {
                        let code = parseInt(hexPart, 16);
                        // Well-formedness check: validate character code
                        const isValid = this.xmlVersion === '1.0' ? 
                            XMLUtils.isValidXml10Char(code) : 
                            XMLUtils.isValidXml11Char(code);
                        if (!isValid) {
                            throw new Error(`Invalid character reference: &#x${hexPart}; (U+${code.toString(16).toUpperCase().padStart(4, '0')}) is not allowed in XML ${this.xmlVersion}`);
                        }
                        char = String.fromCodePoint(code);
                    } else {
                        // Invalid hex - include as is
                        char = text.substring(i, endPos + 1);
                    }
                } else {
                    // Decimal character reference
                    if (/^[0-9]+$/.test(refText)) {
                        let code = parseInt(refText);
                        // Well-formedness check: validate character code
                        const isValid = this.xmlVersion === '1.0' ? 
                            XMLUtils.isValidXml10Char(code) : 
                            XMLUtils.isValidXml11Char(code);
                        if (!isValid) {
                            throw new Error(`Invalid character reference: &#${code}; (U+${code.toString(16).toUpperCase().padStart(4, '0')}) is not allowed in XML ${this.xmlVersion}`);
                        }
                        char = String.fromCodePoint(code);
                    } else {
                        // Invalid decimal - include as is
                        char = text.substring(i, endPos + 1);
                    }
                }

                result += char;
                i = endPos + 1;
            } else {
                // Well-formedness check: validate character(s) - handle surrogate pairs
                let code = text.codePointAt(i)!;
                const isValid = this.xmlVersion === '1.0' ? 
                    XMLUtils.isValidXml10Char(code) : 
                    XMLUtils.isValidXml11Char(code);
                if (!isValid) {
                    throw new Error(`Invalid character in entity value: U+${code.toString(16).toUpperCase().padStart(4, '0')} is not allowed in XML ${this.xmlVersion}`);
                }
                
                // Add the complete character (may be 1 or 2 UTF-16 code units for surrogate pairs)
                let char = String.fromCodePoint(code);
                result += char;
                
                // Skip the correct number of UTF-16 code units
                i += (code > 0xFFFF) ? 2 : 1;
            }
        }

        return result;
    }

    expandCustomEntities(text: string, visitedEntities: Set<string> = new Set()): string {
        if (!text || text.indexOf('&') === -1) {
            return text;
        }

        let result = '';
        let i = 0;

        while (i < text.length) {
            if (text.charAt(i) === '&') {
                // Find the end of the entity reference
                let endPos = text.indexOf(';', i);
                if (endPos === -1) {
                    // Malformed entity reference - include as is
                    result += text.charAt(i);
                    i++;
                    continue;
                }

                let entityName = text.substring(i + 1, endPos);
                
                // Skip predefined entities and character references as they're handled elsewhere
                if (entityName === 'lt' || entityName === 'gt' || entityName === 'amp' || 
                    entityName === 'apos' || entityName === 'quot' || 
                    entityName.startsWith('#')) {
                    // Include as is - will be handled by other expansion methods
                    result += text.substring(i, endPos + 1);
                    i = endPos + 1;
                    continue;
                }

                // Check for recursive entity references to prevent infinite loops
                if (visitedEntities.has(entityName)) {
                    throw new Error(`Recursive entity reference detected: &${entityName};`);
                }

                // Look up custom entity in DTD grammar
                const entity = this.grammar.getEntity(entityName);
                if (entity) {
                    let entityValue = entity.getValue();
                    if (entityValue !== null && entityValue !== undefined) {
                        // Mark this entity as visited for recursion detection
                        visitedEntities.add(entityName);
                        
                        // Recursively expand any entities within this entity's value
                        entityValue = this.expandCustomEntities(entityValue, visitedEntities);
                        
                        // Remove from visited set after expansion
                        visitedEntities.delete(entityName);
                        
                        result += entityValue;
                    } else {
                        // Entity has no value - this is a well-formedness error for general entities
                        throw new Error(`Entity &${entityName}; has no defined value`);
                    }
                } else {
                    // Unknown entity - this is a well-formedness error
                    throw new Error(`Unknown entity reference: &${entityName};`);
                }
                
                i = endPos + 1;
            } else {
                // Well-formedness check: validate character(s) - handle surrogate pairs
                let code = text.codePointAt(i)!;
                const isValid = this.xmlVersion === '1.0' ? 
                    XMLUtils.isValidXml10Char(code) : 
                    XMLUtils.isValidXml11Char(code);
                if (!isValid) {
                    throw new Error(`Invalid character in entity value: U+${code.toString(16).toUpperCase().padStart(4, '0')} is not allowed in XML ${this.xmlVersion}`);
                }
                
                // Add the complete character (may be 1 or 2 UTF-16 code units for surrogate pairs)
                let char = String.fromCodePoint(code);
                result += char;
                
                // Skip the correct number of UTF-16 code units
                i += (code > 0xFFFF) ? 2 : 1;
            }
        }

        return result;
    }

    expandAllEntityReferences(text: string): string {
        if (!text || text.indexOf('&') === -1) {
            return text;
        }

        let result = text;

        // First expand custom entities from DTD grammar
        result = this.expandCustomEntities(result);

        // Then expand character references
        result = this.expandCharacterReferences(result);

        // Finally expand predefined entities in the correct order
        // Important: &amp; must be expanded LAST to avoid interfering with other entities
        result = result.replace(/&quot;/g, '"');
        result = result.replace(/&apos;/g, "'");
        result = result.replace(/&lt;/g, '<');
        result = result.replace(/&gt;/g, '>');
        result = result.replace(/&amp;/g, '&');  // This must be last!

        return result;
    }

    private handleEntityContent(entityValue: string): void {
        // Analyze entity content to determine how to handle it
        // This is a simplified approach - in a full parser, we'd need more sophisticated content analysis

        if (entityValue.includes('<') && entityValue.includes('>')) {
            // Entity contains markup - this requires more complex handling
            // For now, we'll treat different types of markup content

            if (entityValue.trim().startsWith('<!--') && entityValue.trim().endsWith('-->')) {
                // Comment content
                const commentContent = entityValue.trim().slice(4, -3);
                this.contentHandler!.comment(commentContent);
            } else if (entityValue.trim().startsWith('<?') && entityValue.trim().endsWith('?>')) {
                // Processing instruction content
                const piContent = entityValue.trim().slice(2, -2).trim();
                const spaceIndex = piContent.indexOf(' ');
                if (spaceIndex > 0) {
                    const target = piContent.substring(0, spaceIndex);
                    const data = piContent.substring(spaceIndex + 1);
                    this.contentHandler!.processingInstruction(target, data);
                } else {
                    this.contentHandler!.processingInstruction(piContent, '');
                }
            } else if (entityValue.trim().startsWith('<![CDATA[') && entityValue.trim().endsWith(']]>')) {
                // CDATA content
                const cdataContent = entityValue.trim().slice(9, -3);
                this.contentHandler!.startCDATA();
                this.contentHandler!.characters(cdataContent);
                this.contentHandler!.endCDATA();
            } else if (entityValue.trim().startsWith('<') && entityValue.trim().endsWith('>')) {
                // Element content - simplified handling
                // Extract element name (this is very basic parsing)
                const elementMatch = entityValue.trim().match(/^<(\w+)(?:\s[^>]*)?(?:\/>|>.*<\/\1>)$/s);
                if (elementMatch) {
                    const elementName = elementMatch[1];
                    this.contentHandler!.startElement(elementName, []);
                    if (!entityValue.trim().endsWith('/>')) {
                        // Extract content between tags (very simplified)
                        const contentMatch = entityValue.trim().match(/^<\w+(?:\s[^>]*)?>(.+)<\/\w+>$/s);
                        if (contentMatch) {
                            const content = contentMatch[1];
                            this.contentHandler!.characters(content);
                        }
                    }
                    this.contentHandler!.endElement(elementName);
                } else {
                    // Malformed markup - treat as character data
                    this.contentHandler!.characters(entityValue);
                }
            } else {
                // Mixed content or other markup - treat as character data for safety
                this.contentHandler!.characters(entityValue);
            }
        } else {
            // Pure character content
            this.contentHandler!.characters(entityValue);
        }
    }
}