/*******************************************************************************
 * Copyright (c) 2023 - 2024 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { existsSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, isAbsolute, resolve } from "path";
import { fileURLToPath } from "url";
import { Catalog } from "./Catalog";
import { ContentHandler } from "./ContentHandler";
import { FileReader } from "./FileReader";
import { RelaxNGParser } from "./RelaxNGParser";
import { XMLAttribute } from "./XMLAttribute";
import { XMLUtils } from "./XMLUtils";
import { Grammar, ValidationError, ValidationResult } from "./grammar/Grammar";

export class SAXParser {

    contentHandler: ContentHandler | undefined;
    reader: FileReader | undefined;
    pointer: number;
    buffer: string = '';
    elementStack: number;
    elementNameStack: string[] = [];
    private childrenNames: Array<string[]> = [];
    characterRun: string;
    rootParsed: boolean;
    xmlVersion: string;
    currentFile: string | undefined;
    catalog: Catalog | undefined;
    validating: boolean = false;
    private defaultAttributes: Map<string, Map<string, string>> = new Map<string, Map<string, string>>();
    isRelaxNG: boolean = false;
    static readonly MIN_BUFFER_SIZE: number = 2048;
    static path = require('path');

    constructor() {
        this.characterRun = '';
        this.elementStack = 0;
        this.elementNameStack = [];
        this.childrenNames = [];
        this.pointer = 0;
        this.rootParsed = false;
        this.xmlVersion = '1.0';
    }

    setContentHandler(contentHandler: ContentHandler): void {
        this.contentHandler = contentHandler;
        if (this.catalog) {
            this.contentHandler.setCatalog(this.catalog);
        }
    }

    setCatalog(catalog: Catalog): void {
        this.catalog = catalog;
        this.contentHandler?.setCatalog(catalog);
    }

    setValidating(validating: boolean): void {
        this.validating = validating;
    }

    parseFile(path: string, encoding?: BufferEncoding): void {
        if (!this.contentHandler) {
            throw new Error('ContentHandler not set');
        }
        if (!encoding) {
            encoding = FileReader.detectEncoding(path);
        }
        this.currentFile = path;
        this.defaultAttributes = new Map();
        this.isRelaxNG = false;
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
        this.contentHandler?.startDocument();
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
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }
        }
        if (this.elementStack !== 0) {
            throw new Error('Malformed XML document: unclosed elements');
        }
        this.cleanCharacterRun();
        if (this.rootParsed) {
            this.contentHandler?.endDocument();
        }
    }

    parseEntityReference() {
        this.cleanCharacterRun();
        this.pointer++; // skip '&'
        let name: string = '';
        while (!this.lookingAt(';')) {
            name += this.buffer.charAt(this.pointer++);
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }
        }
        if (name === 'lt') {
            this.contentHandler?.characters('<');
        } else if (name === 'gt') {
            this.contentHandler?.characters('>');
        } else if (name === 'amp') {
            this.contentHandler?.characters('&');
        } else if (name === 'apos') {
            this.contentHandler?.characters('\'');
        } else if (name === 'quot') {
            this.contentHandler?.characters('"');
        } else if (name.startsWith('#x')) {
            let code: number = parseInt(name.substring(2), 16);
            let char: string = String.fromCharCode(code);
            this.contentHandler?.characters(this.xmlVersion === '1.0' ? XMLUtils.validXml10Chars(char) : XMLUtils.validXml11Chars(char));
        } else if (name.startsWith('#')) {
            let code: number = parseInt(name.substring(1));
            let char: string = String.fromCharCode(code);
            this.contentHandler?.characters(this.xmlVersion === '1.0' ? XMLUtils.validXml10Chars(char) : XMLUtils.validXml11Chars(char));
        } else {
            this.contentHandler?.skippedEntity(name);
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
        if (this.validating) {
            if (!XMLUtils.isValidXMLName(name)) {
                throw new Error('Invalid XML name: ' + name);
            }
        }

        // Add this element as a child of its parent (if parent exists)
        if (this.childrenNames.length > 0) {
            let parentChildren: string[] = this.childrenNames[this.childrenNames.length - 1];
            parentChildren.push(name);
        }
        // Push a new empty array for this element's children
        this.childrenNames.push([]);

        let rest: string = '';
        while (!this.lookingAt('>') && !this.lookingAt('/>')) {
            rest += this.buffer.charAt(this.pointer++);
            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }
        }
        rest = rest.trim();
        let attributesMap: Map<string, string> = this.parseAttributes(rest);
        let attributes: Array<XMLAttribute> = [];
        attributesMap.forEach((value: string, key: string) => {
            // TODO https://www.w3.org/TR/REC-xml/#AVNormalize
            let attribute: XMLAttribute = new XMLAttribute(key, value);
            attributes.push(attribute);
        });
        if (this.validating) {
            attributes.forEach((attr: XMLAttribute) => {
                if (!XMLUtils.isValidXMLName(attr.getName())) {
                    throw new Error('Invalid XML attribute name: ' + attr.getName());
                }
            });
            const grammar = this.contentHandler?.getGrammar();
            if (grammar) {
                let result: ValidationResult = grammar.validateAttributes(name, attributesMap);
                if (result.isValid === false) {
                    let errorMessages: string = '';
                    result.errors.forEach((error: ValidationError) => {
                        errorMessages += error.message + '\n';
                    });
                    throw new Error('Validation failed for element ' + name + ':\n' + errorMessages);
                }
            }
        }
        attributes = this.getDefaultAttributes(name, attributes);
        this.contentHandler?.startElement(name, attributes);
        this.elementStack++;
        this.elementNameStack.push(name);
        if (!this.rootParsed) {
            this.rootParsed = true;
        }
        if (this.lookingAt('/>')) {
            this.cleanCharacterRun();
            this.validateElement(name);
            this.contentHandler?.endElement(name);
            this.elementStack--;
            this.elementNameStack.pop();
            this.childrenNames.pop();
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

        // Read tag name until whitespace or '>'
        while (!this.lookingAt('>') && !XMLUtils.isXmlSpace(this.buffer.charAt(this.pointer))) {
            name += this.buffer.charAt(this.pointer);
            this.pointer++;
        }

        // Skip optional whitespace before '>'
        while (XMLUtils.isXmlSpace(this.buffer.charAt(this.pointer))) {
            this.pointer++;
        }

        // Expect '>'
        if (!this.lookingAt('>')) {
            throw new Error('Well-formedness error: expected ">" in end tag "</' + name + '"');
        }

        // Well-formedness check: mismatched element tags
        if (this.elementNameStack.length === 0) {
            throw new Error('Mismatched element tags: found closing tag "' + name + '" but no elements are open');
        }
        const expectedName: string | undefined = this.elementNameStack.pop();
        if (name !== expectedName) {
            throw new Error('Mismatched element tags: expected closing tag for "' + expectedName + '" but found "' + name + '"');
        }
        // Validate element content when validating mode is enabled  
        if (this.validating && !this.isRelaxNG) {
            this.validateElement(name);
        }
        this.contentHandler?.endElement(name);
        this.elementStack--;
        if (this.childrenNames.length > 0) {
            this.childrenNames.pop();
        }
        this.pointer++; // skip '>'
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;
    }

    validateElement(name: string): void {
        const grammar: Grammar | undefined = this.contentHandler?.getGrammar();
        if (grammar) {
            const actualChildrenNames: string[] = this.childrenNames.length > 0 ? this.childrenNames[this.childrenNames.length - 1] : [];
            const elementValidationResult = grammar.validateElement(name, actualChildrenNames);
            if (!elementValidationResult.isValid) {
                const errorMessages: string = elementValidationResult.errors.map(e => e.message).join('; ');
                throw new Error('Element validation failed for element "' + name + '": ' + errorMessages);
            }
        }
    }

    getDefaultAttributes(elementName: string, attributes: Array<XMLAttribute>): Array<XMLAttribute> {
        let defaultAttrs: Map<string, string> | undefined;
        let grammar: Grammar | undefined = this.contentHandler?.getGrammar();
        if (grammar) {
            defaultAttrs = grammar.getDefaultAttributes(elementName);
        }
        if (!defaultAttrs && this.isRelaxNG) {
            defaultAttrs = this.defaultAttributes.get(elementName);
        }
        if (defaultAttrs) {
            let existingAttributes: Set<string> = new Set<string>();
            attributes.forEach((attr: XMLAttribute) => {
                existingAttributes.add(attr.getName());
            });
            defaultAttrs.forEach((value: string, key: string) => {
                if (!existingAttributes.has(key)) {
                    let attribute: XMLAttribute = new XMLAttribute(key, value);
                    attributes.push(attribute);
                }
            });
        }
        return attributes;
    }

    cleanCharacterRun(): void {
        if (this.characterRun !== '') {
            if (this.rootParsed) {
                if (this.elementStack === 0) {
                    // document ended
                    this.contentHandler?.ignorableWhitespace(this.characterRun);
                } else {
                    // in an element
                    this.contentHandler?.characters(this.characterRun);
                }
            } else {
                // in prolog
                this.contentHandler?.ignorableWhitespace(this.characterRun);
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
        this.contentHandler?.comment(comment);
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
        this.contentHandler?.processingInstruction(target, data);

        // TODO enable RelaxNG parsing from xml-model processing instruction

        /*
        if (target === 'xml-model') {
            // Extract default attributes from RelaxNG schemas
            let atts: Map<string, string> = this.parseAttributes(data);
            let href: string = '';
            let schemaType: string = '';
            for (let [key, value] of atts.entries()) {
                if (key === 'href') {
                    href = value;
                }
                if (key === 'schematypens') {
                    schemaType = value;
                }
            }
            if (href !== '' && Constants.RELAXNG_NS_URI === schemaType) {
                try {
                    this.parseRelaxNG(href);
                } catch (e: Error | any) {
                    // do nothing
                }
            }
        }
        */
    }

    parseRelaxNG(href: string) {
        let resolvedPath: string;
        try {
            // Check if it's a file:// URL
            if (href.startsWith('file://')) {
                resolvedPath = fileURLToPath(href);
            } else if (isAbsolute(href)) {
                // Handle absolute paths
                resolvedPath = href;
            } else {
                const baseDir: string | undefined = this.currentFile ? dirname(this.currentFile) : undefined;
                resolvedPath = baseDir ? resolve(baseDir, href) : resolve(href);
            }

            if (!existsSync(resolvedPath) && this.catalog) {
                const candidates: Array<string | undefined> = [
                    this.catalog.matchSystem(href),
                    this.catalog.matchURI(href),
                    this.catalog.matchPublic(href)
                ];

                let resolvedFromCatalog: string | undefined;
                for (const candidate of candidates) {
                    if (!candidate) {
                        continue;
                    }
                    const normalizedCandidate: string = candidate.startsWith('file://') ? fileURLToPath(candidate) : candidate;
                    if (existsSync(normalizedCandidate)) {
                        resolvedFromCatalog = normalizedCandidate;
                        break;
                    }
                }

                if (resolvedFromCatalog) {
                    resolvedPath = resolvedFromCatalog;
                } else if (this.validating) {
                    throw new Error(`RelaxNG schema file not found: ${href}`);
                } else {
                    return;
                }
            } else if (!existsSync(resolvedPath)) {
                if (this.validating) {
                    throw new Error(`RelaxNG schema file not found: ${href}`);
                }
                return;
            }
            let relaxngParser = new RelaxNGParser(resolvedPath, this.catalog);
            this.defaultAttributes = relaxngParser.getElements();
            this.isRelaxNG = true;
        } catch (error: Error | any) {
            throw new Error(`Error accessing RelaxNG schema at ${href}: ${error.message}`);
        }
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
        this.contentHandler?.startDTD(name, publicId, systemId);
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
            for (; this.pointer < this.buffer.length; this.pointer++) {
                let char: string = this.buffer[this.pointer];
                if (']' === char) {
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
            this.contentHandler?.internalSubset(internalSubset);
        }
        this.contentHandler?.endDTD();
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
        this.contentHandler?.xmlDeclaration(version, encoding, attributes.get('standalone'));
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
        this.contentHandler?.startCDATA();
    }

    endCDATA() {
        this.cleanCharacterRun();
        this.pointer += 3; // skip ']]>'
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;
        this.contentHandler?.endCDATA();
    }
}