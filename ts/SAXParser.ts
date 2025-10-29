/*******************************************************************************
 * Copyright (c) 2023-2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { existsSync, unlinkSync, writeFileSync } from "fs";
import { isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { Catalog } from "./Catalog";
import { ContentHandler } from "./ContentHandler";
import { FileReader } from "./FileReader";
import { XMLAttribute } from "./XMLAttribute";
import { XMLUtils } from "./XMLUtils";
import { AttributeInfo, Grammar } from "./grammar/Grammar";
import { GrammarHandler } from "./grammar/GrammarHandler";

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
    inComment: boolean = false;
    inDoctype: boolean = false;
    inProcessingInstruction: boolean = false;
    silent: boolean;
    grammarHandler: GrammarHandler;
    currentFile: string = '';
    catalog: Catalog | undefined;
    private includeDefaultAttributes: boolean = true;
    private childrenNames: Array<string[]> = [];
    namespaceMap: Map<string, string>;
    private namespaceStack: Array<Map<string, string>>;
    ignoreGrammars: boolean = false;

    static readonly MIN_BUFFER_SIZE: number = 2048;

    constructor() {
        this.characterRun = '';
        this.elementStack = 0;
        this.pointer = 0;
        this.rootParsed = false;
        this.xmlVersion = '1.0';
        this.validating = false;
        this.inCDATA = false;
        this.silent = false;
        this.grammarHandler = new GrammarHandler();
        this.namespaceMap = new Map<string, string>();
        this.namespaceStack = [];
        this.resetNamespaceContext();
    }

    setContentHandler(contentHandler: ContentHandler): void {
        this.contentHandler = contentHandler;
        this.contentHandler.setValidating(this.validating);
        this.contentHandler.setIncludeDefaultAttributes(this.includeDefaultAttributes);
        this.contentHandler.setGrammarHandler(this.grammarHandler);
    }

    setValidating(validating: boolean): void {
        this.validating = validating;
        if (this.contentHandler) {
            this.contentHandler.setValidating(validating);
        }
        this.grammarHandler.setValidating(validating);
    }

    isValidating(): boolean {
        return this.validating;
    }

    setIgnoreGrammars(ignore: boolean): void {
        this.ignoreGrammars = ignore;
    }

    setSilent(silent: boolean): void {
        this.silent = silent;
    }

    setCatalog(catalog: Catalog): void {
        this.catalog = catalog;
    }

    setGrammarHandler(handler: GrammarHandler): void {
        this.grammarHandler = handler;
        this.grammarHandler.setValidating(this.validating);
    }

    setIncludeDefaultAttributes(include: boolean): void {
        this.includeDefaultAttributes = include;
        if (this.contentHandler) {
            this.contentHandler.setIncludeDefaultAttributes(include);
        }
    }

    isSilent(): boolean {
        return this.silent;
    }

    parseFile(path: string, encoding?: BufferEncoding): void {
        if (!this.contentHandler) {
            throw new Error('ContentHandler not set');
        }

        this.resetNamespaceContext();

        // Resolve URI/URL to local file path
        const resolvedPath: string = this.resolveURIToPath(path);

        this.grammarHandler.setCurrentFile(resolvedPath);
        this.grammarHandler.setSilent(this.silent);
        if (this.catalog) {
            this.grammarHandler.setCatalog(this.catalog);
        }

        this.currentFile = resolvedPath;
        if (!encoding) {
            encoding = FileReader.detectEncoding(resolvedPath);
        }
        this.reader = new FileReader(resolvedPath, encoding);
        try {
            this.buffer = this.reader.read();
            this.contentHandler.initialize();
            this.readDocument();
        } catch (error) {
            console.error(`Error parsing file "${resolvedPath}": ${(error as Error).message}`);
            throw error;
        } finally {
            this.reader.closeFile();
        }
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
        let tempFile: string = join(tmpdir(), name);
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
            let charCode: number | undefined = this.buffer.codePointAt(this.pointer);
            if (charCode !== undefined) {
                const isValid: boolean = this.xmlVersion === '1.0' ?
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
        if (this.rootParsed) {
            this.contentHandler!.endDocument();
            this.checkRemainingText();
        } else {
            throw new Error('Malformed XML document: no root element found');
        }
    }

    checkRemainingText(): void {
        // Check for remaining non-whitespace content after document end
        if (this.rootParsed) {
            if (this.pointer < this.buffer.length) {
                const remainingContent = this.buffer.substring(this.pointer);
                for (let i = 0; i < remainingContent.length; i++) {
                    const char = remainingContent.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        throw new Error('Malformed XML document: content found after root element');
                    }
                }
            }
            while (this.reader?.dataAvailable()) {
                const additionalData = this.reader.read();
                for (let i = 0; i < additionalData.length; i++) {
                    const char = additionalData.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        throw new Error('Malformed XML document: content found after root element');
                    }
                }
            }
        }
    }

    parseEntityReference() {
        if ((!this.rootParsed || (this.rootParsed && this.elementStack === 0)) &&
            !this.inComment && !this.inDoctype && !this.inProcessingInstruction) {
            throw new Error('Entity reference not allowed in this context');
        }
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

            let char: string = this.buffer.charAt(this.pointer);

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
                const hexPart: string = name.substring(2);
                if (!/^[0-9a-fA-F]+$/.test(hexPart)) {
                    throw new Error(`Invalid hexadecimal character reference: "${name}" contains non-hex characters`);
                }
            } else {
                // Decimal character reference
                const decPart: string = name.substring(1);
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
            const isValid: boolean = this.xmlVersion === '1.0' ?
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
            const isValid: boolean = this.xmlVersion === '1.0' ?
                XMLUtils.isValidXml10Char(code) :
                XMLUtils.isValidXml11Char(code);
            if (!isValid) {
                throw new Error(`Invalid character reference: &#${code}; (U+${code.toString(16).toUpperCase().padStart(4, '0')}) is not allowed in XML ${this.xmlVersion}`);
            }
            let char: string = String.fromCodePoint(code);
            this.contentHandler!.characters(char);
        } else {
            // Look up entity in DTD using grammar interface
            const entityValue: string | undefined = this.grammarHandler.getGrammar().resolveEntity(name);
            if (entityValue !== undefined) {
                // Entity found - recursively expand any nested entities
                if (entityValue.length > 0) {
                    const fullyExpandedValue = this.expandCustomEntities(entityValue);
                    this.contentHandler!.characters(fullyExpandedValue);
                } else {
                    // Empty entity - valid, just continue
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

        // Add this element as a child of its parent (if parent exists)
        if (this.childrenNames.length > 0) {
            let parentChildren: string[] = this.childrenNames[this.childrenNames.length - 1];
            parentChildren.push(name);
        }
        // Push a new empty array for this element's children
        this.childrenNames.push([]);

        let rest: string = '';
        let quoteChar: string | undefined;
        while (true) {
            if (this.pointer >= this.buffer.length) {
                if (this.reader?.dataAvailable()) {
                    this.buffer += this.reader.read();
                } else {
                    break;
                }
            }

            const currentChar = this.buffer.charAt(this.pointer);

            if (!quoteChar) {
                if (currentChar === '"' || currentChar === '\'') {
                    quoteChar = currentChar;
                    rest += currentChar;
                    this.pointer++;
                } else if (this.lookingAt('/>') || this.lookingAt('>')) {
                    break;
                } else {
                    rest += currentChar;
                    this.pointer++;
                }
            } else {
                rest += currentChar;
                this.pointer++;
                if (currentChar === quoteChar) {
                    quoteChar = undefined;
                }
            }

            if (this.buffer.length - this.pointer < SAXParser.MIN_BUFFER_SIZE && this.reader?.dataAvailable()) {
                this.buffer += this.reader?.read();
            }
        }
        rest = rest.trim();
        let attributesMap: Map<string, string> = this.parseAttributes(rest);

        this.pushNamespaceContext(attributesMap);

        // Apply DTD-aware attribute value normalization and add default attributes
        attributesMap = this.normalizeAndDefaultAttributes(name, attributesMap);

        // Delegate namespace processing to grammar handler
        if (!this.ignoreGrammars) {
            this.grammarHandler.processNamespaces(attributesMap);
        }

        // Track xml:space attribute for whitespace handling
        const xmlSpaceValue: string | undefined = attributesMap.get('xml:space');
        if (xmlSpaceValue === 'preserve') {
            this.xmlSpaceStack.push('preserve');
        } else if (xmlSpaceValue === 'default') {
            this.xmlSpaceStack.push('default');
        } else {
            // Inherit from parent (or default if at root)
            const currentSpace: string = this.xmlSpaceStack.length > 0 ?
                this.xmlSpaceStack[this.xmlSpaceStack.length - 1] : 'default';
            this.xmlSpaceStack.push(currentSpace);
        }

        let attributes: Array<XMLAttribute> = [];
        attributesMap.forEach((value: string, key: string) => {
            let attribute: XMLAttribute = new XMLAttribute(key, value);
            attributes.push(attribute);
        });

        // Validate attributes when validating mode is enabled
        if (this.validating) {
            const attributeMap: Map<string, string> = new Map<string, string>();
            attributes.forEach(attr => {
                attributeMap.set(attr.getName(), attr.getValue());
            });

            const attrValidationResult = this.grammarHandler.getGrammar().validateAttributes(name, attributeMap, {
                attributes: attributeMap,
                childrenNames: [],
                textContent: '',
                attributeOnly: true
            });

            if (!attrValidationResult.isValid) {
                const errorMessages: string = attrValidationResult.errors.map(e => e.message).join('; ');
                throw new Error(`Attribute validation failed for element '${name}': ${errorMessages}`);
            }
        }

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
            this.childrenNames.pop(); // no children for self-closing tags
            this.popNamespaceContext();
            this.pointer += 2; // skip '/>'
        } else {
            this.pointer++; // skip '>'
        }
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;

        if (this.elementStack === 0) {
            this.checkRemainingText();
        }
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
            throw new Error(`Well-formedness error: expected '>' in end tag "</${name}"`);
        }

        // Well-formedness check: mismatched element tags
        if (this.elementNameStack.length === 0) {
            throw new Error(`Mismatched element tags: found closing tag "${name}" but no elements are open`);
        }
        const expectedName: string | undefined = this.elementNameStack.pop();
        if (name !== expectedName) {
            throw new Error(`Mismatched element tags: expected closing tag for "${expectedName}" but found "${name}"`);
        }

        // Validate element content when validating mode is enabled  
        if (this.validating) {
            // Get the current element's children before validation
            const actualChildrenNames: string[] = this.childrenNames.length > 0 ? this.childrenNames[this.childrenNames.length - 1] : [];
            const elementValidationResult = this.grammarHandler.getGrammar().validateElement(name, {
                attributes: new Map(),
                childrenNames: actualChildrenNames,  // Pass the real child element names
                textContent: this.characterRun,
                attributeOnly: false
            });

            if (!elementValidationResult.isValid) {
                const errorMessages: string = elementValidationResult.errors.map(e => e.message).join('; ');
                throw new Error(`Element validation failed for element '${name}': ${errorMessages}`);
            }
        }

        this.contentHandler!.endElement(name);
        this.elementStack--;
        this.xmlSpaceStack.pop(); // Remove xml:space state when element ends
        // Pop this element's children array from the stack
        if (this.childrenNames.length > 0) {
            this.childrenNames.pop();
        }
        this.popNamespaceContext();
        this.pointer++; // skip '>'
        this.buffer = this.buffer.substring(this.pointer);
        this.pointer = 0;

        if (this.elementStack === 0) {
            this.checkRemainingText();
        }
    }

    cleanCharacterRun(): void {
        if (this.characterRun !== '') {
            // Note: Don't expand entities here since parseEntityReference already handles 
            // entity expansion with full recursion. The characterRun contains regular 
            // character data that doesn't need entity expansion.
            let content: string = this.characterRun;

            if (this.rootParsed) {
                if (this.elementStack === 0) {
                    // document ended
                    // Normalize line endings per XML 1.0 spec section 2.11
                    const normalizedContent: string = XMLUtils.normalizeLines(content);
                    this.contentHandler!.ignorableWhitespace(normalizedContent);
                } else {
                    // in an element - check xml:space
                    const preserveWhitespace: boolean = this.isXmlSpacePreserve();
                    if (preserveWhitespace || !this.isWhitespaceOnly(content)) {
                        // Preserve whitespace or contains non-whitespace - treat as significant
                        // Normalize line endings per XML 1.0 spec section 2.11
                        const normalizedContent: string = XMLUtils.normalizeLines(content);
                        this.contentHandler!.characters(normalizedContent);
                    } else {
                        // Default mode and only whitespace - treat as ignorable
                        // Normalize line endings per XML 1.0 spec section 2.11
                        const normalizedContent: string = XMLUtils.normalizeLines(content);
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

        this.inComment = true;
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

            let char: string = this.buffer.charAt(this.pointer);
            comment += char;
            this.pointer++;

            // In validation mode, check for XML compliance violations as we build the comment
            if (this.validating && comment.endsWith('--') && !this.lookingAt('>')) {
                throw new Error('Invalid comment: comments must not contain "--"');
            }
        }

        const isValid: boolean = this.xmlVersion === '1.0' ?
            XMLUtils.validXml10Chars(comment) === comment :
            XMLUtils.validXml11Chars(comment) === comment;
        if (!isValid) {
            throw new Error(`Invalid XML characters found in comment for XML ${this.xmlVersion}`);
        }

        // Final validation check for non-validating mode
        if (!this.validating && comment.includes('--')) {
            if (!this.silent) {
                console.warn('XML Warning: Comments should not contain "--"');
            }
        }

        if (comment.endsWith('-')) {
            // Edge case: comment ends with '-' before closing
            throw new Error('Malformed comment: comment cannot end with a "-" before closing "-->"');
        }
        this.buffer = this.buffer.substring(this.pointer + 3); // skip '-->'
        this.pointer = 0;
        this.contentHandler!.comment(comment);
        this.inComment = false;
    }

    parseProcessingInstruction(): void {
        this.cleanCharacterRun();
        let instructionText: string = '';
        let target: string = '';
        let data: string = '';
        this.pointer += 2; // skip '<?'

        this.inProcessingInstruction = true;
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

        // Normalize line endings per XML 1.0 spec section 2.11
        data = XMLUtils.normalizeLines(data);

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

        const isValid: boolean = this.xmlVersion === '1.0' ?
            XMLUtils.validXml10Chars(data) === data :
            XMLUtils.validXml11Chars(data) === data;
        if (!isValid) {
            throw new Error(`Invalid XML characters found in processing instruction for XML ${this.xmlVersion}`);
        }

        if (target === 'xml-model') {
            // implement support for extracting default attributes from RelaxNG schemas
        }

        this.buffer = this.buffer.substring(this.pointer + 2); // skip '?>'
        this.pointer = 0;
        this.contentHandler!.processingInstruction(target, data);
        this.inProcessingInstruction = false;
    }

    parseDoctype() {
        this.cleanCharacterRun();
        this.inDoctype = true;
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
            let char: string = this.buffer[this.pointer];
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
            let char: string = this.buffer[this.pointer];
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
            let char: string = this.buffer[this.pointer];
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
            // Delegate DTD processing to grammar handler
            this.grammarHandler.processDoctype(name, publicId, systemId, internalSubset);
        } else {
            // Process external DTD only
            this.grammarHandler.processDoctype(name, publicId, systemId, '');
        }
        this.contentHandler!.endDTD();
        this.inDoctype = false;
    }

    parsePublicDeclaration(): string[] {
        this.pointer += 6; // skip 'PUBLIC'
        // skip spaces after PUBLIC
        for (; this.pointer < this.buffer.length; this.pointer++) {
            let char: string = this.buffer[this.pointer];
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
            let char: string = this.buffer[this.pointer];
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
            let char: string = this.buffer[this.pointer];
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
            let char: string = this.buffer[this.pointer];
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
            let char: string = this.buffer[this.pointer];
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
            let char: string = this.buffer[this.pointer];
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
                let char: string = text[i];
                if (separator === '' && ('\'' === char || '"' === char)) {
                    separator = char;
                    continue;
                }
                if (char === separator) {
                    break;
                }
            }
            // end of value
            let pair: string = text.substring(0, i + 1).trim();
            pairs.push(pair);
            text = text.substring(pair.length).trim();
            separator = '';
        }

        // Well-formedness check: validate no extra unpaired characters remain
        if (text.trim().length > 0) {
            throw new Error(`Malformed attributes: unexpected characters "${text.trim()}" that don't form attribute pairs`);
        }

        pairs.forEach((pair: string) => {
            let index: number = pair.indexOf('=');
            if (index === -1) {
                throw new Error('Malformed attributes list');
            }
            let name: string = pair.substring(0, index).trim();

            // Well-formedness check: validate attribute name
            if (name.length === 0) {
                throw new Error('Malformed attribute: attribute name cannot be empty');
            }
            if (!XMLUtils.isValidXMLName(name)) {
                throw new Error(`Malformed attribute: "${name}" is not a valid XML attribute name`);
            }

            // Well-formedness check: validate attribute quotes
            let quotedValue: string = pair.substring(index + 1).trim();
            if (quotedValue.length < 2 ||
                (quotedValue.charAt(0) !== '"' && quotedValue.charAt(0) !== "'") ||
                quotedValue.charAt(0) !== quotedValue.charAt(quotedValue.length - 1)) {
                throw new Error(`Malformed attribute: attribute value must be quoted (found: ${quotedValue})`);
            }

            // Handle spaces around = sign
            let valueStart: number = index + 1;
            // Skip spaces after =
            while (valueStart < pair.length && XMLUtils.isXmlSpace(pair[valueStart])) {
                valueStart++;
            }
            // Skip opening quote
            if (valueStart < pair.length && (pair[valueStart] === '"' || pair[valueStart] === "'")) {
                valueStart++;
            }
            // Find end (skip closing quote)
            let valueEnd: number = pair.length - 1;
            if (valueEnd >= 0 && (pair[valueEnd] === '"' || pair[valueEnd] === "'")) {
                // valueEnd is already at the closing quote position, so we want content before it
            } else {
                valueEnd = pair.length;
            }

            let value: string = pair.substring(valueStart, valueEnd);
            if (value.includes('&')) {
                // Check for unescaped ampersands (not part of valid entity references)
                this.validateAttributeValueWellFormedness(value);
            }
            // Expand entity references in attribute values
            value = this.expandEntities(value);

            // Well-formedness check: detect duplicate attributes
            if (map.has(name)) {
                throw new Error(`Duplicate attribute: "${name}" appears more than once in the same element`);
            }

            map.set(name, value);
        });
        return map;
    }

    private validateAttributeValueWellFormedness(value: string): void {
        let i = 0;
        while (i < value.length) {
            if (value.charAt(i) === '&') {
                // Found ampersand - check if it's part of a valid entity reference
                let semicolonPos = value.indexOf(';', i);
                if (semicolonPos === -1) {
                    throw new Error(`Well-formedness error: unescaped '&' in attribute value (missing ';')`);
                }

                let entityName = value.substring(i + 1, semicolonPos);
                if (entityName.length === 0) {
                    throw new Error(`Well-formedness error: empty entity reference '&;' in attribute value`);
                }

                // Check for malformed character references
                if (entityName.startsWith('#')) {
                    if (entityName === '#') {
                        throw new Error(`Well-formedness error: incomplete character reference`);
                    }

                    if (entityName.startsWith('#x')) {
                        // Hexadecimal character reference
                        const hexPart = entityName.substring(2);
                        if (hexPart.length === 0 || !/^[0-9a-fA-F]+$/.test(hexPart)) {
                            throw new Error(`Well-formedness error: malformed hexadecimal character reference`);
                        }
                    } else {
                        // Decimal character reference  
                        const decPart = entityName.substring(1);
                        if (decPart.length === 0 || !/^[0-9]+$/.test(decPart)) {
                            throw new Error(`Well-formedness error: malformed decimal character reference`);
                        }
                    }
                }
                i = semicolonPos + 1;
            } else {
                i++;
            }
        }
    }
    normalizeAndDefaultAttributes(elementName: string, attributesMap: Map<string, string>): Map<string, string> {
        const attributeInfos: Map<string, AttributeInfo> = this.grammarHandler.getGrammar().getElementAttributes(elementName);

        if (attributeInfos.size === 0) {
            return attributesMap;
        }

        const result: Map<string, string> = new Map<string, string>(attributesMap);

        attributeInfos.forEach((attributeInfo: AttributeInfo) => {
            const matchingKey = this.findAttributeKeyForInfo(result, attributeInfo);

            if (matchingKey !== undefined) {
                const currentValue = result.get(matchingKey);
                if (currentValue !== undefined) {
                    const normalizedValue: string = this.normalizeAttributeByType(currentValue, attributeInfo.datatype);
                    result.set(matchingKey, normalizedValue);
                }
            } else if (this.includeDefaultAttributes && attributeInfo.defaultValue !== undefined) {
                const targetName = this.buildAttributeNameForInfo(attributeInfo);
                if (!result.has(targetName)) {
                    const defaultValue: string = this.normalizeAttributeByType(attributeInfo.defaultValue, attributeInfo.datatype);
                    result.set(targetName, defaultValue);
                }
            }
        });

        return result;
    }

    normalizeAttributeByType(value: string, type: string): string {
        if (type === 'CDATA') {
            // For CDATA attributes: only normalize line endings to spaces, preserve tabs
            return value.replace(/\r\n/g, ' ')    // CRLF first (to avoid double replacement)
                .replace(/[\n\r]/g, ' ');         // Then individual LF, CR (but NOT tabs)
        } else {
            // For non-CDATA attributes: normalize all whitespace and collapse
            const normalizedValue = value.replace(/\r\n/g, ' ')    // CRLF first
                .replace(/[\t\n\r]/g, ' ');                        // Then individual tab, LF, CR
            return normalizedValue.replace(/\s+/g, ' ').trim();    // Collapse and trim
        }
    }

    private resetNamespaceContext(): void {
        this.namespaceStack = [this.createBaseNamespaceContext()];
        this.namespaceMap = new Map<string, string>(this.namespaceStack[0]);
    }

    private createBaseNamespaceContext(): Map<string, string> {
        const base = new Map<string, string>();
        base.set('xml', 'http://www.w3.org/XML/1998/namespace');
        base.set('xmlns', 'http://www.w3.org/2000/xmlns/');
        return base;
    }

    private pushNamespaceContext(attributes: Map<string, string>): void {
        if (this.namespaceStack.length === 0) {
            this.resetNamespaceContext();
        }

        const parentContext = this.namespaceStack[this.namespaceStack.length - 1];
        const newContext = new Map<string, string>(parentContext);

        attributes.forEach((value, key) => {
            if (key === 'xmlns') {
                newContext.set('', value);
            } else if (key.startsWith('xmlns:')) {
                const prefix = key.substring(6);
                newContext.set(prefix, value);
            }
        });

        this.namespaceStack.push(newContext);
        this.namespaceMap = new Map<string, string>(newContext);
    }

    private popNamespaceContext(): void {
        if (this.namespaceStack.length > 1) {
            this.namespaceStack.pop();
        }

        const currentContext = this.namespaceStack[this.namespaceStack.length - 1] ?? this.createBaseNamespaceContext();
        this.namespaceMap = new Map<string, string>(currentContext);
    }

    private findAttributeKeyForInfo(attributes: Map<string, string>, attributeInfo: AttributeInfo): string | undefined {
        if (attributes.has(attributeInfo.name)) {
            return attributeInfo.name;
        }

        const localName = this.extractLocalName(attributeInfo.name);

        if (!attributeInfo.namespace) {
            if (attributes.has(localName)) {
                return localName;
            }
            return undefined;
        }

        for (const key of attributes.keys()) {
            const resolved = this.resolveAttributeNamespace(key);
            if (resolved.namespace === attributeInfo.namespace && resolved.localName === localName) {
                return key;
            }
        }

        return undefined;
    }

    private resolveAttributeNamespace(attributeName: string): { localName: string; namespace: string | null } {
        const colonIndex = attributeName.indexOf(':');
        if (colonIndex === -1) {
            return { localName: attributeName, namespace: null };
        }

        const prefix = attributeName.substring(0, colonIndex);
        const localName = attributeName.substring(colonIndex + 1);

        if (prefix === 'xml') {
            return { localName, namespace: 'http://www.w3.org/XML/1998/namespace' };
        }
        if (prefix === 'xmlns') {
            return { localName, namespace: 'http://www.w3.org/2000/xmlns/' };
        }

        const namespace = this.namespaceMap.get(prefix) ?? null;
        return { localName, namespace };
    }

    private extractLocalName(name: string): string {
        const colonIndex = name.indexOf(':');
        if (colonIndex === -1) {
            return name;
        }
        return name.substring(colonIndex + 1);
    }

    private findPrefixForNamespaceInContext(namespace: string): string | undefined {
        for (const [prefix, uri] of this.namespaceMap.entries()) {
            if (uri === namespace) {
                return prefix;
            }
        }
        return undefined;
    }

    private buildAttributeNameForInfo(attributeInfo: AttributeInfo): string {
        if (attributeInfo.name.includes(':')) {
            return attributeInfo.name;
        }

        const localName = this.extractLocalName(attributeInfo.name);

        if (!attributeInfo.namespace) {
            return localName;
        }

        const prefix = this.findPrefixForNamespaceInContext(attributeInfo.namespace);
        if (prefix && prefix.length > 0) {
            return `${prefix}:${localName}`;
        }
        return localName;
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

    expandEntities(text: string): string {
        if (!text || text.indexOf('&') === -1) {
            return text;
        }

        let result: string = text;

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

    private expandCharacterReferences(text: string): string {
        if (!text || text.indexOf('&#') === -1) {
            return text;
        }

        let result: string = '';
        let i: number = 0;

        while (i < text.length) {
            if (text.charAt(i) === '&' && text.charAt(i + 1) === '#') {
                // Found character reference
                let endPos: number = text.indexOf(';', i);
                if (endPos === -1) {
                    // Malformed character reference - include as is
                    result += text.charAt(i);
                    i++;
                    continue;
                }

                let refText: string = text.substring(i + 2, endPos); // Skip &#
                let char: string = '';
                let originalRef: string = text.substring(i, endPos + 1); // Full reference like &#9;

                if (refText.startsWith('x') || refText.startsWith('X')) {
                    // Hexadecimal character reference
                    let hexPart: string = refText.substring(1);
                    if (/^[0-9a-fA-F]+$/.test(hexPart)) {
                        let code: number = parseInt(hexPart, 16);
                        // Well-formedness check: validate character code
                        const isValid = this.xmlVersion === '1.0' ?
                            XMLUtils.isValidXml10Char(code) :
                            XMLUtils.isValidXml11Char(code);
                        if (!isValid) {
                            throw new Error(`Invalid character reference: &#x${hexPart}; (U+${code.toString(16).toUpperCase().padStart(4, '0')}) is not allowed in XML ${this.xmlVersion}`);
                        }
                        char = String.fromCodePoint(code);
                        // Track the mapping: expanded character -> original reference
                        this.grammarHandler.getGrammar().addEntityReferenceUsage(originalRef, char);
                    } else {
                        // Invalid hex - include as is
                        char = text.substring(i, endPos + 1);
                    }
                } else {
                    // Decimal character reference
                    if (/^[0-9]+$/.test(refText)) {
                        let code: number = parseInt(refText);
                        // Well-formedness check: validate character code
                        const isValid = this.xmlVersion === '1.0' ?
                            XMLUtils.isValidXml10Char(code) :
                            XMLUtils.isValidXml11Char(code);
                        if (!isValid) {
                            throw new Error(`Invalid character reference: &#${code}; (U+${code.toString(16).toUpperCase().padStart(4, '0')}) is not allowed in XML ${this.xmlVersion}`);
                        }
                        char = String.fromCodePoint(code);
                        // Track the mapping: expanded character -> original reference
                        this.grammarHandler.getGrammar().addEntityReferenceUsage(originalRef, char);
                    } else {
                        // Invalid decimal - include as is
                        char = text.substring(i, endPos + 1);
                    }
                }

                result += char;
                i = endPos + 1;
            } else {
                // Well-formedness check: validate character(s) - handle surrogate pairs
                let code: number = text.codePointAt(i)!;;
                const isValid = this.xmlVersion === '1.0' ?
                    XMLUtils.isValidXml10Char(code) :
                    XMLUtils.isValidXml11Char(code);
                if (!isValid) {
                    throw new Error(`Invalid character in entity value: U+${code.toString(16).toUpperCase().padStart(4, '0')} is not allowed in XML ${this.xmlVersion}`);
                }

                // Add the complete character (may be 1 or 2 UTF-16 code units for surrogate pairs)
                let char: string = String.fromCodePoint(code);
                result += char;

                // Skip the correct number of UTF-16 code units
                i += (code > 0xFFFF) ? 2 : 1;
            }
        }

        return result;
    }

    private expandCustomEntities(text: string, visitedEntities: Set<string> = new Set()): string {
        if (!text || text.indexOf('&') === -1) {
            return text;
        }

        let result: string = '';
        let i: number = 0;

        while (i < text.length) {
            if (text.charAt(i) === '&') {
                // Find the end of the entity reference
                let endPos: number = text.indexOf(';', i);
                if (endPos === -1) {
                    // Malformed entity reference - include as is
                    result += text.charAt(i);
                    i++;
                    continue;
                }

                let entityName: string = text.substring(i + 1, endPos);

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

                // Look up custom entity using Grammar interface
                const entityValue: string | undefined = this.grammarHandler.getGrammar().resolveEntity(entityName);
                if (entityValue !== undefined) {
                    if (entityValue !== '') {
                        // Mark this entity as visited for recursion detection
                        visitedEntities.add(entityName);

                        // Recursively expand any entities within this entity's value
                        const expandedValue: string = this.expandCustomEntities(entityValue, visitedEntities);

                        // Remove from visited set after expansion
                        visitedEntities.delete(entityName);

                        result += expandedValue;
                    } else {
                        // Entity has empty value - valid, just continue
                        // (empty entities are allowed in XML)
                    }
                } else {
                    // Unknown entity - this is a well-formedness error
                    throw new Error(`Unknown entity reference: &${entityName};`);
                }

                i = endPos + 1;
            } else {
                // Well-formedness check: validate character(s) - handle surrogate pairs
                let code: number = text.codePointAt(i)!;
                const isValid = this.xmlVersion === '1.0' ?
                    XMLUtils.isValidXml10Char(code) :
                    XMLUtils.isValidXml11Char(code);
                if (!isValid) {
                    throw new Error(`Invalid character in entity value: U+${code.toString(16).toUpperCase().padStart(4, '0')} is not allowed in XML ${this.xmlVersion}`);
                }

                // Add the complete character (may be 1 or 2 UTF-16 code units for surrogate pairs)
                let char: string = String.fromCodePoint(code);
                result += char;

                // Skip the correct number of UTF-16 code units
                i += (code > 0xFFFF) ? 2 : 1;
            }
        }

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
                const commentContent: string = entityValue.trim().slice(4, -3);
                this.contentHandler!.comment(commentContent);
            } else if (entityValue.trim().startsWith('<?') && entityValue.trim().endsWith('?>')) {
                // Processing instruction content
                const piContent: string = entityValue.trim().slice(2, -2).trim();
                const spaceIndex: number = piContent.indexOf(' ');
                if (spaceIndex > 0) {
                    const target: string = piContent.substring(0, spaceIndex);
                    const data: string = piContent.substring(spaceIndex + 1);
                    this.contentHandler!.processingInstruction(target, data);
                } else {
                    this.contentHandler!.processingInstruction(piContent, '');
                }
            } else if (entityValue.trim().startsWith('<![CDATA[') && entityValue.trim().endsWith(']]>')) {
                // CDATA content
                const cdataContent: string = entityValue.trim().slice(9, -3);
                this.contentHandler!.startCDATA();
                this.contentHandler!.characters(cdataContent);
                this.contentHandler!.endCDATA();
            } else if (entityValue.trim().startsWith('<') && entityValue.trim().endsWith('>')) {
                // Element content - simplified handling
                // Extract element name (this is very basic parsing)
                const elementMatch: RegExpMatchArray | null = entityValue.trim().match(/^<(\w+)(?:\s[^>]*)?(?:\/>|>.*<\/\1>)$/s);
                if (elementMatch) {
                    const elementName: string = elementMatch[1];
                    this.contentHandler!.startElement(elementName, []);
                    if (!entityValue.trim().endsWith('/>')) {
                        // Extract content between tags (very simplified)
                        const contentMatch: RegExpMatchArray | null = entityValue.trim().match(/^<\w+(?:\s[^>]*)?>(.+)<\/\w+>$/s);
                        if (contentMatch) {
                            const content: string = contentMatch[1];
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

    getGrammar(): Grammar {
        return this.grammarHandler.getGrammar();
    }

    private resolveURIToPath(path: string): string {
        // Handle empty or null paths
        if (!path || path.trim() === '') {
            throw new Error('Invalid path: path cannot be empty');
        }

        let resolvedPath: string;

        try {
            // Check if it's a file:// URL
            if (path.startsWith('file://')) {
                resolvedPath = fileURLToPath(path);
            }
            // Check if it's an HTTP/HTTPS URL (not supported for local file access)
            else if (path.startsWith('http://') || path.startsWith('https://')) {
                throw new Error(`Unsupported protocol: HTTP/HTTPS URLs are not supported for local file access: ${path}`);
            }
            // Check if it's another URL scheme
            else if (path.includes('://')) {
                throw new Error(`Unsupported protocol: Unknown URL scheme in: ${path}`);
            }
            // Handle absolute paths
            else if (isAbsolute(path)) {
                resolvedPath = path;
            }
            // Handle relative paths
            else {
                // Resolve relative to current working directory
                resolvedPath = resolve(path);
            }

            // Verify the file exists and is accessible
            if (!existsSync(resolvedPath)) {
                throw new Error(`File not found: ${resolvedPath} (original path: ${path})`);
            }

            return resolvedPath;

        } catch (error) {
            if (error instanceof Error) {
                throw error;
            } else {
                throw new Error(`Failed to resolve path "${path}": ${String(error)}`);
            }
        }
    }
}