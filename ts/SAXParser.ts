/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { existsSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import { Readable } from "stream";
import { fileURLToPath } from "url";
import { Catalog } from "./Catalog";
import { ContentHandler } from "./ContentHandler";
import { FileReader } from "./FileReader";
import { NeedMoreDataError } from "./NeedMoreDataError";
import { RelaxNGParser } from "./RelaxNGParser";
import { StreamReader } from "./StreamReader";
import { StringReader } from "./StringReader";
import { XMLAttribute } from "./XMLAttribute";
import { XMLUtils } from "./XMLUtils";
import { Grammar, ValidationError, ValidationResult } from "./grammar/Grammar";

export interface ParseSourceOptions {
    basePath?: string;
    pseudoFileName?: string;
    virtualPath?: string;
}

export interface StreamParseOptions extends ParseSourceOptions {
    encoding?: BufferEncoding;
}

export type ParserInputSource = FileReader | StringReader | StreamReader;

export class SAXParser {

    contentHandler: ContentHandler | undefined;
    reader: ParserInputSource | undefined;
    pointer: number;
    buffer: string = '';
    elementStack: number;
    elementNameStack: string[] = [];
    childrenNames: Array<string[]> = [];
    characterRun: string;
    rootParsed: boolean;
    xmlVersion: string;
    currentFile: string | undefined;
    catalog: Catalog | undefined;
    validating: boolean = false;
    defaultAttributes: Map<string, Map<string, string>> = new Map<string, Map<string, string>>();
    isRelaxNG: boolean = false;
    static readonly DEFAULT_VIRTUAL_FILENAME: string = '__inmemory__.xml';
    streamingMode: boolean = false;
    sourceEnded: boolean = false;
    documentStarted: boolean = false;
    documentEnded: boolean = false;

    constructor() {
        this.characterRun = '';
        this.elementStack = 0;
        this.elementNameStack = [];
        this.childrenNames = [];
        this.pointer = 0;
        this.rootParsed = false;
        this.xmlVersion = '1.0';
        this.streamingMode = false;
        this.sourceEnded = false;
        this.documentStarted = false;
        this.documentEnded = false;
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
        const normalizedPath: string = isAbsolute(path) ? path : resolve(path);
        const effectiveEncoding: BufferEncoding = encoding ?? FileReader.detectEncoding(normalizedPath);
        const reader: FileReader = new FileReader(normalizedPath, effectiveEncoding);
        this.initializeParsing(reader, normalizedPath);
        this.processSynchronous();
    }

    parseString(data: string, options?: ParseSourceOptions): void {
        if (!this.contentHandler) {
            throw new Error('ContentHandler not set');
        }
        const reader: StringReader = new StringReader(data);
        const virtualPath: string = this.resolveVirtualPath(options);
        this.initializeParsing(reader, virtualPath);
        this.processSynchronous();
    }

    parseStream(stream: Readable, options?: StreamParseOptions): Promise<void> {
        if (!this.contentHandler) {
            return Promise.reject(new Error('ContentHandler not set'));
        }
        const encoding: BufferEncoding = options?.encoding ?? 'utf8';
        const reader: StreamReader = new StreamReader(encoding);
        const virtualPath: string = this.resolveVirtualPath(options);
        this.initializeParsing(reader, virtualPath);

        return new Promise<void>((resolvePromise, rejectPromise) => {
            const cleanup = (): void => {
                stream.removeListener('data', onData);
                stream.removeListener('end', onEnd);
                stream.removeListener('error', onError);
            };

            const handleProcessing = (finalizing: boolean): void => {
                try {
                    this.processStreaming(finalizing);
                    if (this.documentEnded) {
                        cleanup();
                        this.reader?.closeFile();
                        resolvePromise();
                    } else if (finalizing) {
                        cleanup();
                        this.reader?.closeFile();
                        rejectPromise(new Error('Malformed XML document: unexpected end of stream'));
                    }
                } catch (error) {
                    if (error instanceof NeedMoreDataError) {
                        return;
                    }
                    cleanup();
                    this.reader?.closeFile();
                    rejectPromise(error as Error);
                }
            };

            const onData = (chunk: string): void => {
                reader.enqueue(chunk);
                handleProcessing(false);
            };

            const onEnd = (): void => {
                reader.markFinished();
                handleProcessing(true);
            };

            const onError = (error: Error): void => {
                cleanup();
                this.reader?.closeFile();
                rejectPromise(error);
            };

            stream.setEncoding(encoding);
            stream.on('data', onData);
            stream.once('end', onEnd);
            stream.once('error', onError);
        });
    }

    initializeParsing(reader: ParserInputSource, currentFilePath: string): void {
        this.reader = reader;
        const fallbackVirtualPath: string = resolve(process.cwd(), SAXParser.DEFAULT_VIRTUAL_FILENAME);
        this.currentFile = currentFilePath || fallbackVirtualPath;
        this.defaultAttributes = new Map<string, Map<string, string>>();
        this.isRelaxNG = false;
        this.pointer = 0;
        this.buffer = '';
        this.elementStack = 0;
        this.elementNameStack = [];
        this.childrenNames = [];
        this.characterRun = '';
        this.rootParsed = false;
        this.xmlVersion = '1.0';
        this.streamingMode = reader instanceof StreamReader;
        this.sourceEnded = false;
        this.documentStarted = false;
        this.documentEnded = false;
        this.contentHandler?.initialize();
    }

    processSynchronous(): void {
        if (!this.reader) {
            return;
        }
        try {
            while (!this.documentEnded) {
                this.readDocument();
                if (!this.documentEnded) {
                    if (!this.tryReadMore()) {
                        break;
                    }
                }
            }
            this.ensureDocumentClosed();
        } finally {
            this.reader.closeFile();
        }
    }

    processStreaming(finalizing: boolean): void {
        if (!this.reader) {
            return;
        }
        while (true) {
            try {
                this.readDocument();
            } catch (error) {
                if (error instanceof NeedMoreDataError) {
                    return;
                }
                throw error;
            }
            if (this.documentEnded) {
                return;
            }
            let hasMoreData: boolean;
            try {
                hasMoreData = this.tryReadMore();
            } catch (error) {
                if (error instanceof NeedMoreDataError) {
                    return;
                }
                throw error;
            }
            if (!hasMoreData) {
                if (finalizing) {
                    this.ensureDocumentClosed();
                }
                return;
            }
        }
    }

    resolveVirtualPath(options?: ParseSourceOptions): string {
        if (options?.virtualPath) {
            const virtualPath: string = options.virtualPath;
            return isAbsolute(virtualPath) ? virtualPath : resolve(virtualPath);
        }
        const pseudoFileName: string = options?.pseudoFileName ?? SAXParser.DEFAULT_VIRTUAL_FILENAME;
        if (options?.basePath) {
            const normalizedBase: string = isAbsolute(options.basePath) ? options.basePath : resolve(options.basePath);
            return resolve(normalizedBase, pseudoFileName);
        }
        return resolve(process.cwd(), pseudoFileName);
    }

    tryReadMore(): boolean {
        if (!this.reader || this.sourceEnded) {
            return false;
        }
        if (this.reader instanceof StreamReader) {
            if (this.reader.dataAvailable()) {
                const chunk: string = this.reader.read();
                if (chunk === '') {
                    if (this.reader.isFinished()) {
                        this.sourceEnded = true;
                    }
                    return false;
                }
                this.buffer += chunk;
                return true;
            }
            if (this.reader.isFinished()) {
                this.sourceEnded = true;
                return false;
            }
            throw new NeedMoreDataError();
        }
        if (this.reader.dataAvailable()) {
            const chunk: string = this.reader.read();
            if (chunk === '') {
                this.sourceEnded = true;
                return false;
            }
            this.buffer += chunk;
            return true;
        }
        const chunk: string = this.reader.read();
        if (chunk === '') {
            this.sourceEnded = true;
            return false;
        }
        this.buffer += chunk;
        return true;
    }

    ensureDocumentClosed(): void {
        if (this.documentEnded) {
            return;
        }
        if (!this.sourceEnded) {
            if (this.streamingMode) {
                throw new NeedMoreDataError();
            }
            throw new Error('Malformed XML document: unexpected end of input');
        }
        if (this.elementStack !== 0) {
            throw new Error('Malformed XML document: unclosed elements');
        }
        this.cleanCharacterRun();
        if (this.rootParsed && !this.documentEnded) {
            this.contentHandler?.endDocument();
            this.documentEnded = true;
        }
    }

    ensureLookahead(minRemaining: number): void {
        if (this.buffer.length - this.pointer >= minRemaining) {
            return;
        }
        while (this.buffer.length - this.pointer < minRemaining) {
            if (!this.tryReadMore()) {
                break;
            }
        }
        if (this.buffer.length - this.pointer < minRemaining) {
            if (this.sourceEnded) {
                return;
            }
            if (this.streamingMode) {
                throw new NeedMoreDataError();
            }
        }
    }

    readDocument(): void {
        if (!this.reader) {
            return;
        }
        if (!this.documentStarted) {
            this.contentHandler?.startDocument();
            this.documentStarted = true;
        }
        while (true) {
            if (this.pointer >= this.buffer.length) {
                if (!this.tryReadMore()) {
                    break;
                }
                continue;
            }
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
            const char: string = this.buffer.charAt(this.pointer);
            if (!this.rootParsed && !XMLUtils.isXmlSpace(char)) {
                throw new Error('Malformed XML document: text found in prolog');
            }
            if (this.rootParsed && this.elementStack === 0 && !XMLUtils.isXmlSpace(char)) {
                throw new Error('Malformed XML document: text found after root element');
            }
            this.characterRun += char;
            this.pointer++;
        }
        if (this.sourceEnded) {
            this.ensureDocumentClosed();
        } else if (this.streamingMode) {
            throw new NeedMoreDataError();
        }
    }

    parseEntityReference() {
        this.cleanCharacterRun();
        this.pointer++; // skip '&'
        let name: string = '';
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    throw new Error('Malformed XML document: unterminated entity reference');
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            if (this.buffer.charAt(this.pointer) === ';') {
                break;
            }
            name += this.buffer.charAt(this.pointer++);
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
        const tagStartPointer: number = this.pointer;
        try {
            this.pointer++; // skip '<'
            let name: string = '';
            while (true) {
                this.ensureLookahead(1);
                if (this.pointer >= this.buffer.length) {
                    if (this.sourceEnded) {
                        throw new Error('Malformed XML document: unterminated start tag');
                    }
                    if (this.streamingMode) {
                        throw new NeedMoreDataError();
                    }
                }
                if (XMLUtils.isXmlSpace(this.buffer.charAt(this.pointer)) || this.lookingAt('>') || this.lookingAt('/>')) {
                    break;
                }
                name += this.buffer.charAt(this.pointer++);
            }
            if (this.validating) {
                if (!XMLUtils.isValidXMLName(name)) {
                    throw new Error('Invalid XML name: ' + name);
                }
            }

            let rest: string = '';
            while (true) {
                this.ensureLookahead(1);
                if (this.pointer >= this.buffer.length) {
                    if (this.sourceEnded) {
                        throw new Error('Malformed XML document: unterminated start tag');
                    }
                    if (this.streamingMode) {
                        throw new NeedMoreDataError();
                    }
                }
                const currentChar: string = this.buffer.charAt(this.pointer);
                if (currentChar === '>' || currentChar === '/') {
                    break;
                }
                rest += currentChar;
                this.pointer++;
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

            this.ensureLookahead(1);
            let isSelfClosing: boolean = false;
            const terminatorChar: string = this.buffer.charAt(this.pointer);
            if (terminatorChar === '/') {
                this.ensureLookahead(2);
                if (this.buffer.charAt(this.pointer + 1) !== '>') {
                    throw new Error('Malformed XML document: expected "/>" to close start tag for ' + name);
                }
                isSelfClosing = true;
            } else if (terminatorChar === '>') {
                isSelfClosing = false;
            } else {
                throw new Error('Malformed XML document: unexpected character "' + terminatorChar + '" at end of start tag');
            }

            // Add this element as a child of its parent (if parent exists)
            if (this.childrenNames.length > 0) {
                let parentChildren: string[] = this.childrenNames[this.childrenNames.length - 1];
                parentChildren.push(name);
            }
            // Push a new empty array for this element's children
            this.childrenNames.push([]);

            this.contentHandler?.startElement(name, attributes);
            this.elementStack++;
            this.elementNameStack.push(name);
            if (!this.rootParsed) {
                this.rootParsed = true;
            }
            if (isSelfClosing) {
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
        } catch (error) {
            if (error instanceof NeedMoreDataError) {
                this.pointer = tagStartPointer;
            }
            throw error;
        }
    }

    endElement() {
        this.cleanCharacterRun();
        this.pointer += 2; // skip '</'
        let name: string = '';

        // Read tag name until whitespace or '>'
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    throw new Error('Malformed XML document: unterminated end tag');
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            if (this.lookingAt('>') || XMLUtils.isXmlSpace(this.buffer.charAt(this.pointer))) {
                break;
            }
            name += this.buffer.charAt(this.pointer);
            this.pointer++;
        }

        // Skip optional whitespace before '>'
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    throw new Error('Malformed XML document: unterminated end tag');
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            if (!XMLUtils.isXmlSpace(this.buffer.charAt(this.pointer))) {
                break;
            }
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
        while (true) {
            this.ensureLookahead(3);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    throw new Error('Malformed XML document: unterminated comment');
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            if (this.lookingAt('-->')) {
                break;
            }
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
        while (true) {
            this.ensureLookahead(2);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    throw new Error('Malformed XML document: unterminated processing instruction');
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            if (this.lookingAt('?>')) {
                break;
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
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    throw new Error('Malformed DOCTYPE declaration');
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            let char: string = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            this.pointer++;
        }
        // read name
        let name: string = '';
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    throw new Error('Malformed DOCTYPE declaration: missing root name');
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            let char: string = this.buffer.charAt(this.pointer);
            if (XMLUtils.isXmlSpace(char)) {
                break;
            }
            name += char;
            this.pointer++;
        }
        // skip spaces after root name
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    break;
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            let char: string = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            this.pointer++;
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
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    break;
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            let char: string = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            this.pointer++;
        }
        // check internal subset
        let internalSubset: string = '';
        if (this.lookingAt('[')) {
            this.pointer++; // skip '['
            while (true) {
                this.ensureLookahead(1);
                if (this.pointer >= this.buffer.length) {
                    if (this.sourceEnded) {
                        throw new Error('Malformed DOCTYPE declaration: unterminated internal subset');
                    }
                    if (this.streamingMode) {
                        throw new NeedMoreDataError();
                    }
                }
                let char: string = this.buffer[this.pointer];
                if (']' === char) {
                    break;
                }
                internalSubset += char;
                this.pointer++;
            }
            this.pointer++; // skip ']'
        }
        // skip spaces after internal subset
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    break;
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            let char: string = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            this.pointer++;
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
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    throw new Error('Malformed PUBLIC declaration');
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            let char: string = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            this.pointer++;
        }
        let separator: string = '';
        let publicId: string = '';
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    throw new Error('Malformed PUBLIC declaration: unterminated public identifier');
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            let char: string = this.buffer[this.pointer];
            if (separator === '') {
                if (char === '\'' || char === '"') {
                    separator = char;
                    this.pointer++;
                    continue;
                }
                throw new Error('Malformed PUBLIC declaration: missing opening quote');
            }
            if (char === separator) {
                this.pointer++;
                break;
            }
            publicId += char;
            this.pointer++;
        }
        // skip spaces after publicId
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    break;
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            let char: string = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            this.pointer++;
        }
        separator = '';
        let systemIdId: string = '';
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    throw new Error('Malformed PUBLIC declaration: unterminated system identifier');
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            let char: string = this.buffer[this.pointer];
            if (separator === '') {
                if (char === '\'' || char === '"') {
                    separator = char;
                    this.pointer++;
                    continue;
                }
                throw new Error('Malformed PUBLIC declaration: missing system identifier quote');
            }
            if (char === separator) {
                this.pointer++;
                break;
            }
            systemIdId += char;
            this.pointer++;
        }
        return [publicId, systemIdId];
    }

    parseSystemDeclaration(): string {
        this.pointer += 6; // skip 'SYSTEM'
        // skip spaces after SYSTEM
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    throw new Error('Malformed SYSTEM declaration');
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            let char: string = this.buffer[this.pointer];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
            this.pointer++;
        }
        let separator: string = '';
        let systemId: string = '';
        while (true) {
            this.ensureLookahead(1);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    throw new Error('Malformed SYSTEM declaration: unterminated system identifier');
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            let char: string = this.buffer[this.pointer];
            if (separator === '') {
                if (char === '\'' || char === '"') {
                    separator = char;
                    this.pointer++;
                    continue;
                }
                throw new Error('Malformed SYSTEM declaration: missing opening quote');
            }
            if (char === separator) {
                this.pointer++;
                break;
            }
            systemId += char;
            this.pointer++;
        }
        return systemId;
    }

    parseXMLDeclaration() {
        let declarationText: string = '';
        this.pointer += 6; // skip '<?xml '
        while (true) {
            this.ensureLookahead(2);
            if (this.pointer >= this.buffer.length) {
                if (this.sourceEnded) {
                    throw new Error('Malformed XML declaration: unterminated declaration');
                }
                if (this.streamingMode) {
                    throw new NeedMoreDataError();
                }
            }
            if (this.lookingAt('?>')) {
                break;
            }
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
        const length: number = text.length;
        try {
            this.ensureLookahead(length);
        } catch (error) {
            if (error instanceof NeedMoreDataError) {
                throw error;
            }
            throw error;
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