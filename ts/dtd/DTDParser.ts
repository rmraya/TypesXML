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

import { Stats, closeSync, openSync, readSync, statSync } from "fs";
import { dirname, sep } from "node:path";
import { Catalog } from "../Catalog";
import { FileReader } from "../FileReader";
import { XMLUtils } from "../XMLUtils";
import { AttDecl } from "./AttDecl";
import { AttListDecl } from "./AttListDecl";
import { DTDGrammar } from "./DTDGrammar";
import { ElementDecl } from "./ElementDecl";
import { EntityDecl } from "./EntityDecl";
import { NotationDecl } from "./NotationDecl";

export class DTDParser {

    private grammar: DTDGrammar;
    private catalog: Catalog | undefined;
    private pointer: number = 0;
    private source: string = '';
    private currentFile: string = '';
    private baseDirectory: string = '';
    private validating: boolean = false;
    private overrideExistingDeclarations: boolean = false;
    private preexistingEntityKeys: Set<string> = new Set();
    private preexistingAttributeKeys: Map<string, Set<string>> = new Map();

    constructor(grammar?: DTDGrammar, baseDirectory?: string) {
        if (grammar) {
            this.grammar = grammar;
        } else {
            this.grammar = new DTDGrammar();
        }
        if (baseDirectory) {
            this.baseDirectory = baseDirectory;
        }
    }

    setGrammar(grammar: DTDGrammar): void {
        this.grammar = grammar;
    }

    setOverrideExistingDeclarations(override: boolean): void {
        this.overrideExistingDeclarations = override;
    }

    setValidating(validating: boolean): void {
        this.validating = validating;
    }

    setCatalog(catalog: Catalog) {
        this.catalog = catalog;
    }

    parseDTD(file: string): DTDGrammar {
        this.parseFile(file);
        this.grammar.processModels();
        return this.grammar;
    }

    parseFile(file: string): DTDGrammar {
        this.source = '';
        let stats: Stats = statSync(file, { bigint: false, throwIfNoEntry: true });
        this.currentFile = file;
        let blockSize: number = stats.blksize;
        let fileHandle = openSync(file, 'r');
        let buffer = Buffer.alloc(blockSize);
        let bytesRead: number = readSync(fileHandle, buffer, 0, blockSize, 0);
        while (bytesRead > 0) {
            this.source += buffer.toString('utf8', 0, bytesRead);
            bytesRead = readSync(fileHandle, buffer, 0, blockSize, this.source.length);
        }
        closeSync(fileHandle);
        return this.parse();
    }

    parseString(source: string): DTDGrammar {
        this.source = source;
        this.parse();
        this.grammar.processModels();
        return this.grammar;
    }

    parse(): DTDGrammar {
        this.pointer = 0;
        this.preexistingEntityKeys = new Set<string>();
        this.preexistingAttributeKeys = new Map<string, Set<string>>();
        if (this.overrideExistingDeclarations) {
            for (const key of this.grammar.getEntitiesMap().keys()) {
                this.preexistingEntityKeys.add(key);
            }
            this.grammar.getAttributesMap().forEach((attributes: Map<string, AttDecl>, element: string) => {
                const attributeNames: Set<string> = new Set<string>();
                attributes.forEach((_value: AttDecl, name: string) => {
                    attributeNames.add(name);
                });
                this.preexistingAttributeKeys.set(element, attributeNames);
            });
        }
        while (this.pointer < this.source.length) {
            if (this.lookingAt('<!ELEMENT')) {
                let index: number = this.findDeclarationEnd(this.pointer);
                if (index === -1) {
                    throw new Error('Malformed element declaration');
                }
                let elementText: string = this.source.substring(this.pointer, index + '>'.length);
                let length = elementText.length;
                let elementDecl: ElementDecl = this.parseElementDeclaration(elementText);
                this.grammar.addElement(elementDecl, this.overrideExistingDeclarations);
                this.pointer += length;
                continue;
            }
            if (this.lookingAt('<!ATTLIST')) {
                let index: number = this.findDeclarationEnd(this.pointer);
                if (index === -1) {
                    throw new Error('Malformed attribute declaration');
                }
                let attListText: string = this.source.substring(this.pointer, index + '>'.length);
                let length = attListText.length;
                let attList: AttListDecl = this.parseAttributesListDeclaration(attListText);
                const preexisting: Set<string> | undefined = this.overrideExistingDeclarations ? this.preexistingAttributeKeys.get(attList.getName()) : undefined;
                this.grammar.addAttributes(attList.getName(), attList.getAttributes(), this.overrideExistingDeclarations, preexisting);
                this.pointer += length;
                continue;
            }
            if (this.lookingAt('<!ENTITY')) {
                let index: number = this.findDeclarationEnd(this.pointer);
                if (index === -1) {
                    throw new Error('Malformed entity declaration');
                }
                let entityDeclText: string = this.source.substring(this.pointer, index + '>'.length);
                let entityDecl: EntityDecl = this.parseEntityDeclaration(entityDeclText);
                const entityKey: string = entityDecl.isParameterEntity() ? `%${entityDecl.getName()}` : entityDecl.getName();
                const alreadyDeclared: boolean = this.grammar.getEntitiesMap().has(entityKey);
                const existedBeforeParse: boolean = this.preexistingEntityKeys.has(entityKey);
                if (alreadyDeclared && this.overrideExistingDeclarations && !existedBeforeParse) {
                    this.pointer += entityDeclText.length;
                    continue;
                }
                this.grammar.addEntity(entityDecl, this.overrideExistingDeclarations && existedBeforeParse);
                this.pointer += entityDeclText.length;
                continue;
            }
            if (this.lookingAt('<!NOTATION')) {
                let index: number = this.findDeclarationEnd(this.pointer);
                if (index === -1) {
                    throw new Error('Malformed notation declaration');
                }
                let notationDeclText: string = this.source.substring(this.pointer, index + '>'.length);
                if (XMLUtils.hasParameterEntity(notationDeclText)) {
                    notationDeclText = this.resolveEntities(notationDeclText);
                }
                let notation: NotationDecl = this.parseNotationDeclaration(notationDeclText);
                this.grammar.addNotation(notation, this.overrideExistingDeclarations);
                this.pointer += notationDeclText.length;
                continue;
            }
            if (this.lookingAt('<![')) {
                this.parseConditionalSection();
                continue;
            }
            if (this.lookingAt(']]>')) {
                this.endConditionalSection();
                continue;
            }
            if (this.lookingAt('<?')) {
                let index: number = this.source.indexOf('?>', this.pointer);
                if (index === -1) {
                    throw new Error('Malformed processing instruction');
                }
                // skip processing instructions
                this.pointer = index + '?>'.length;
                continue;
            }
            if (this.lookingAt('<!--')) {
                let index: number = this.source.indexOf('-->', this.pointer);
                if (index === -1) {
                    throw new Error('Malformed comment');
                }
                // skip comments
                this.pointer = index + '-->'.length;
                continue;
            }
            if (this.lookingAt('%')) {
                let index: number = this.source.indexOf(';', this.pointer);
                if (index == -1) {
                    throw new Error('Malformed entity reference');
                }
                let entityName: string = this.source.substring(this.pointer + '%'.length, index);
                let entity: EntityDecl | undefined = this.grammar.getParameterEntity(entityName);
                if (!entity && this.catalog) {
                    let entityLocation: string | undefined = this.catalog.matchPublic(entityName);
                    if (entityLocation) {
                        try {
                            // For external entity references like %xs-datatypes;, we need to create
                            // an entity that contains the entire external file content
                            let externalContent = this.readFileContent(entityLocation);
                            let externalEntity = new EntityDecl(entityName, true, externalContent, '', '', '');
                            this.grammar.addEntity(externalEntity, this.overrideExistingDeclarations);
                            entity = externalEntity;
                            // Also extract any entity declarations from the external file
                            // for potential future use
                            this.extractAndImportEntities(entityLocation);
                        } catch (parseError) {
                            console.warn(`Warning: Could not extract entities from ${entityLocation}: ${(parseError as Error).message}`);
                            // Continue without the external entities - they might be defined elsewhere
                        }
                    } else {
                        console.warn('entity not found in catalog: ' + entityName);
                    }
                }
                if (entity === undefined) {
                    throw new Error('Unknown entity: ' + entityName + ' in parsing loop');
                }
                let value: string = entity.getValue();
                if (value !== '') {
                    let start: string = this.source.substring(0, this.pointer);
                    let end: string = this.source.substring(index + ';'.length);
                    this.source = start + value + end;
                } else if (entity.getSystemId() !== '' || entity.getPublicId() !== '') {
                    let location = this.resolveEntity(entity.getPublicId(), entity.getSystemId());
                    let parser: DTDParser = new DTDParser(this.grammar);
                    parser.setValidating(this.validating);
                    if (this.catalog) {
                        parser.setCatalog(this.catalog);
                    }
                    let externalGrammar: DTDGrammar = parser.parseFile(location);
                    this.grammar.merge(externalGrammar);
                    this.pointer = index + ';'.length;
                } else {
                    // empty entity, ignore
                    this.pointer = index + ';'.length;
                }
                continue;
            }
            let char: string = this.source.charAt(this.pointer);
            if (XMLUtils.isXmlSpace(char)) {
                this.pointer++;
                continue;
            }
            throw new Error('Error parsing ' + this.currentFile + ' at ' + this.source.substring(this.pointer - 10, this.pointer) + ' @ ' + this.source.substring(this.pointer, this.pointer + 30));
        }

        return this.grammar;
    }

    importAllEntities(sourceGrammar: DTDGrammar, targetGrammar: DTDGrammar): void {
        // Import all regular entities
        sourceGrammar.getEntitiesMap().forEach((entity, name) => {
            if (!targetGrammar.getEntity(name)) {
                targetGrammar.addEntity(entity);
            }
        });

        // Import elements if they don't conflict
        sourceGrammar.getElementDeclMap().forEach((element, name) => {
            if (!targetGrammar.getElementDeclMap().has(name)) {
                targetGrammar.addElement(element);
            }
        });

        // Import attribute lists
        sourceGrammar.getAttributesMap().forEach((attributes, elementName) => {
            let existingAttributes = targetGrammar.getAttributesMap().get(elementName);
            if (!existingAttributes || existingAttributes.size === 0) {
                targetGrammar.addAttributes(elementName, attributes);
            }
        });

        // Import notations
        sourceGrammar.getNotationsMap().forEach((notation, name) => {
            if (!targetGrammar.getNotationsMap().has(name)) {
                targetGrammar.addNotation(notation);
            }
        });
    }

    extractAndImportEntities(filePath: string): void {
        try {
            // Read the external DTD content and process it in the current parser context
            // This ensures parameter entities from the main DTD are available
            let content = this.readFileContent(filePath);
            let originalFile = this.currentFile;
            let originalSource = this.source;
            let originalPointer = this.pointer;

            // Temporarily switch context to external file
            this.currentFile = filePath;
            this.source = content;
            this.pointer = 0;

            try {
                // Parse the external DTD content in the current context
                this.parse();
            } finally {
                // Restore original context
                this.currentFile = originalFile;
                this.source = originalSource;
                this.pointer = originalPointer;
            }
        } catch (error) {
            if (this.validating) {
                throw error;
            }
            console.warn(`Warning: Could not parse external DTD file ${filePath}: ${(error as Error).message}`);

        }
    }

    private readFileContent(filePath: string): string {
        let stats: Stats = statSync(filePath, { bigint: false, throwIfNoEntry: true });
        let blockSize: number = stats.blksize;
        let fileHandle = openSync(filePath, 'r');
        let buffer = Buffer.alloc(blockSize);
        let content = '';
        let bytesRead: number = readSync(fileHandle, buffer, 0, blockSize, 0);
        while (bytesRead > 0) {
            content += buffer.toString('utf8', 0, bytesRead);
            bytesRead = readSync(fileHandle, buffer, 0, blockSize, content.length);
        }
        closeSync(fileHandle);
        return content;
    }

    endConditionalSection() {
        // jump over ]]>
        this.pointer += ']]>'.length;
    }

    parseConditionalSection() {
        this.pointer += '<!['.length;
        // skip spaces before section keyword
        for (; this.pointer < this.source.length; this.pointer++) {
            let char: string = this.source.charAt(this.pointer);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        // read section keyword
        let keyword: string = '';
        for (; this.pointer < this.source.length; this.pointer++) {
            let char: string = this.source.charAt(this.pointer);
            if (XMLUtils.isXmlSpace(char) || char === '[') {
                break;
            }
            keyword += char;
        }
        if (XMLUtils.hasParameterEntity(keyword)) {
            let resolvedKeyword: string = this.resolveEntities(keyword);
            const bracketIndex: number = resolvedKeyword.indexOf('[');
            if (bracketIndex !== -1) {
                const remainder: string = resolvedKeyword.substring(bracketIndex + 1);
                resolvedKeyword = resolvedKeyword.substring(0, bracketIndex);
                if (this.source.charAt(this.pointer) !== '[') {
                    this.source = this.source.substring(0, this.pointer) + '[' + remainder + this.source.substring(this.pointer);
                } else if (remainder.length > 0) {
                    const insertionIndex: number = this.pointer + 1;
                    this.source = this.source.substring(0, insertionIndex) + remainder + this.source.substring(insertionIndex);
                }
            }
            keyword = resolvedKeyword.trim();
        }
        if ('INCLUDE' === keyword) {
            // jump to the start of the content
            for (; this.pointer < this.source.length; this.pointer++) {
                let char: string = this.source.charAt(this.pointer);
                if (char === '[') {
                    break;
                }
            }
            this.pointer++;
        } else if ('IGNORE' === keyword) {
            this.skipIgnoreSection();
        } else {
            throw new Error('Malformed conditional section');
        }
    }

    skipIgnoreSection() {
        let stack: number = 1;
        while (this.pointer < this.source.length) {
            if (this.lookingAt('<![')) {
                stack++;
                this.pointer += '<!['.length;
            } else if (this.lookingAt(']]>')) {
                stack--;
                this.pointer += ']]>'.length;
                if (stack === 0) {
                    return;
                }
            } else {
                this.pointer++;
            }
        }
    }

    resolveEntities(fragment: string, depth: number = 0): string {
        if (depth > 50) {
            console.warn('Parameter entity resolution depth exceeded for fragment of length ' + fragment.length);
            return fragment;
        }

        let result: string = '';
        let inQuotes: boolean = false;
        let quoteChar: string = '';
        let index: number = 0;

        while (index < fragment.length) {
            const char: string = fragment.charAt(index);
            if (inQuotes) {
                if (char === quoteChar) {
                    inQuotes = false;
                    quoteChar = '';
                }
                result += char;
                index++;
                continue;
            }
            if (char === '"' || char === "'") {
                inQuotes = true;
                quoteChar = char;
                result += char;
                index++;
                continue;
            }
            if (char === '%') {
                const end: number = fragment.indexOf(';', index + 1);
                if (end === -1) {
                    throw new Error('Malformed parameter entity reference while resolving "' + fragment + '"');
                }
                const entityName: string = fragment.substring(index + 1, end).trim();
                if (entityName.length === 0) {
                    result += fragment.substring(index, end + 1);
                    index = end + 1;
                    continue;
                }
                const entity: EntityDecl | undefined = this.grammar.getParameterEntity(entityName);
                if (entity === undefined) {
                    const context: string = fragment.substring(index, Math.min(fragment.length, index + 80));
                    throw new Error('Unknown entity: ' + entityName + ' in resolveEntities while processing "' + context + '"');
                }
                const replacement: string = entity.getValue();
                const beforeChar: string = result.length > 0 ? result.charAt(result.length - 1) : '';
                const afterChar: string = end + 1 < fragment.length ? fragment.charAt(end + 1) : '';
                const expandedReplacement: string = replacement !== '' ? this.resolveEntities(replacement, depth + 1) : '';
                if (this.needsSeparatorBefore(beforeChar, expandedReplacement)) {
                    result += ' ';
                }
                result += expandedReplacement;
                if (this.needsSeparatorAfter(afterChar, expandedReplacement)) {
                    result += ' ';
                }
                index = end + 1;
                continue;
            }
            result += char;
            index++;
        }

        return result;
    }

    parseEntityDeclaration(declaration: string): EntityDecl {
        let name: string = '';
        let i: number = '<!ENTITY'.length;
        let char: string = declaration.charAt(i);
        // skip spaces before % or entity name
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        let parameterEntity: boolean = false;
        if (char === '%') {
            parameterEntity = true;
            // skip spaces before name
            i++;
            for (; i < declaration.length; i++) {
                char = declaration.charAt(i);
                if (!XMLUtils.isXmlSpace(char)) {
                    break;
                }
            }
        }
        // get entity name
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (XMLUtils.isXmlSpace(char)) {
                break;
            }
            name += char;
        }

        // Validate entity name
        if (!XMLUtils.isValidXMLName(name)) {
            throw new Error(`Invalid entity name in DTD: "${name}" - XML names must be valid`);
        }

        if (XMLUtils.hasParameterEntity(name)) {
            name = this.resolveEntities(name);
        }
        // skip spaces before entity value or external id
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        if (parameterEntity) {
            // can have value or external id
            if (XMLUtils.lookingAt('PUBLIC', declaration, i)) {
                i += 'PUBLIC'.length;
                // skip spaces before public id
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        break;
                    }
                }
                let separator: string = declaration.charAt(i);
                i++; // skip opening "
                // get public id
                let publicId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === separator) {
                        break;
                    }
                    publicId += char;
                }
                i++; // skip closing "
                if (XMLUtils.hasParameterEntity(publicId)) {
                    publicId = this.resolveEntities(publicId);
                }
                // skip spaces before system id
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        break;
                    }
                }
                separator = declaration.charAt(i);
                i++; // skip opening "
                // get system id
                let systemId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === separator) {
                        break;
                    }
                    systemId += char;
                }
                if (XMLUtils.hasParameterEntity(systemId)) {
                    systemId = this.resolveEntities(systemId);
                }
                // Don't load external entity content during DTD parsing - load lazily when referenced
                return new EntityDecl(name, parameterEntity, '', systemId, publicId, '');
            } else if (XMLUtils.lookingAt('SYSTEM', declaration, i)) {
                // skip spaces before system id
                i += 'SYSTEM'.length;
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        break;
                    }
                }
                let separator: string = declaration.charAt(i);
                i++; // skip opening "
                // get system id
                let systemId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === separator) {
                        break;
                    }
                    systemId += char;
                }
                if (XMLUtils.hasParameterEntity(systemId)) {
                    systemId = this.resolveEntities(systemId);
                }
                // Don't load external entity content during DTD parsing - load lazily when referenced
                return new EntityDecl(name, parameterEntity, '', systemId, '', '');
            } else {
                // get entity value
                let separator: string = declaration.charAt(i);
                i++; // skip opening "
                let value: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === separator) {
                        break;
                    }
                    value += char;
                }
                value = this.normalizeEntityLiteral(value);
                return new EntityDecl(name, parameterEntity, value, '', '', '');
            }
        } else {
            // Not a parameterEntity. Similar, but may declare NDATA
            if (XMLUtils.lookingAt('PUBLIC', declaration, i)) {
                i += 'PUBLIC'.length;
                // skip spaces before public id
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        break;
                    }
                }
                let separator: string = declaration.charAt(i);
                i++; // skip "
                // get public id
                let publicId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === separator) {
                        break;
                    }
                    publicId += char;
                }
                i++; // skip closing "
                if (XMLUtils.hasParameterEntity(publicId)) {
                    publicId = this.resolveEntities(publicId);
                }
                // skip spaces before system id
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        break;
                    }
                }
                separator = declaration.charAt(i);
                i++; // skip "
                // get system id
                let systemId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === separator) {
                        break;
                    }
                    systemId += char;
                }
                i++; // skip closing "
                if (XMLUtils.hasParameterEntity(systemId)) {
                    systemId = this.resolveEntities(systemId);
                }
                // skip spaces before NDATA
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        break;
                    }
                }
                if (XMLUtils.lookingAt('NDATA', declaration, i)) {
                    i += 'NDATA'.length;
                    // skip spaces before ndata name
                    for (; i < declaration.length; i++) {
                        char = declaration.charAt(i);
                        if (!XMLUtils.isXmlSpace(char)) {
                            break;
                        }
                    }
                    // get ndata name
                    let ndata: string = '';
                    for (; i < declaration.length; i++) {
                        char = declaration.charAt(i);
                        if (XMLUtils.isXmlSpace(char)) {
                            break;
                        }
                        ndata += char;
                    }
                    if (XMLUtils.hasParameterEntity(ndata)) {
                        ndata = this.resolveEntities(ndata);
                    }
                    return new EntityDecl(name, parameterEntity, '', systemId, publicId, ndata);
                }
                return new EntityDecl(name, parameterEntity, '', systemId, publicId, '');
            } else if (XMLUtils.lookingAt('SYSTEM', declaration, i)) {
                i += 'SYSTEM'.length;
                // skip spaces before system id
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        break;
                    }
                }
                let separator: string = declaration.charAt(i);
                i++; // skip "
                // get system id
                let systemId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === separator) {
                        break;
                    }
                    systemId += char;
                }
                if (XMLUtils.hasParameterEntity(systemId)) {
                    systemId = this.resolveEntities(systemId);
                }
                // skip spaces before NDATA
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        break;
                    }
                }
                if (XMLUtils.lookingAt('NDATA', declaration, i)) {
                    i += 'NDATA'.length;
                    // skip spaces before ndata name
                    for (; i < declaration.length; i++) {
                        char = declaration.charAt(i);
                        if (!XMLUtils.isXmlSpace(char)) {
                            break;
                        }
                    }
                    // get ndata name
                    let ndata: string = '';
                    for (; i < declaration.length; i++) {
                        char = declaration.charAt(i);
                        if (XMLUtils.isXmlSpace(char)) {
                            break;
                        }
                        ndata += char;
                    }
                    if (XMLUtils.hasParameterEntity(ndata)) {
                        ndata = this.resolveEntities(ndata);
                    }
                    // NDATA entities are unparsed and shouldn't have content loaded
                    return new EntityDecl(name, parameterEntity, '', systemId, '', ndata);
                }
                // Don't load external entity content during DTD parsing - load lazily when referenced
                return new EntityDecl(name, parameterEntity, '', systemId, '', '');
            } else {
                // get entity value
                let separator: string = declaration.charAt(i);
                i++; // skip "
                let value: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === separator) {
                        break;
                    }
                    value += char;
                }
                value = this.normalizeEntityLiteral(value);
                return new EntityDecl(name, parameterEntity, value, '', '', '');
            }
        }
    }

    private normalizeEntityLiteral(value: string): string {
        // XML 1.0 section 2.11: normalize CRLF and CR to LF within entity values.
        let normalized: string = value.replace(/\r\n/g, '\n');
        normalized = normalized.replace(/\r/g, '\n');
        return normalized;
    }

    parseNotationDeclaration(declaration: string): NotationDecl {
        let name: string = '';
        let i: number = '<!NOTATION'.length;
        let char: string = declaration.charAt(i);
        // skip spaces before notation name
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        // get notation name
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (XMLUtils.isXmlSpace(char)) {
                break;
            }
            name += char;
        }

        // Validate notation name
        if (!XMLUtils.isValidXMLName(name)) {
            throw new Error(`Invalid notation name in DTD: "${name}" - XML names must be valid`);
        }

        // skip spaces before external id
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        let publicId: string = '';
        let systemId: string = '';
        if (XMLUtils.lookingAt('PUBLIC', declaration, i)) {
            i += 'PUBLIC'.length;
            // skip spaces before public id
            for (; i < declaration.length; i++) {
                char = declaration.charAt(i);
                if (!XMLUtils.isXmlSpace(char)) {
                    break;
                }
            }
            let separator: string = declaration.charAt(i);
            i++; // skip opening "
            // get public id
            for (; i < declaration.length; i++) {
                char = declaration.charAt(i);
                if (char === separator) {
                    break;
                }
                publicId += char;
            }
            i++; // skip closing "
            if (XMLUtils.hasParameterEntity(publicId)) {
                publicId = this.resolveEntities(publicId);
            }
            // skip spaces before system id
            for (; i < declaration.length; i++) {
                char = declaration.charAt(i);
                if (!XMLUtils.isXmlSpace(char)) {
                    break;
                }
            }
            separator = declaration.charAt(i);
            i++; // skip opening "
            // get system id
            for (; i < declaration.length; i++) {
                char = declaration.charAt(i);
                if (char === separator) {
                    break;
                }
                systemId += char;
            }
        } else if (XMLUtils.lookingAt('SYSTEM', declaration, i)) {
            i += 'SYSTEM'.length;
            // skip spaces before system id
            for (; i < declaration.length; i++) {
                char = declaration.charAt(i);
                if (!XMLUtils.isXmlSpace(char)) {
                    break;
                }
            }
            let separator: string = declaration.charAt(i);
            i++; // skip opening "
            // get system id
            for (; i < declaration.length; i++) {
                char = declaration.charAt(i);
                if (char === separator) {
                    break;
                }
                systemId += char;
            }
        } else {
            throw new Error('Malformed notation declaration');
        }
        return new NotationDecl(name, publicId, systemId);
    }

    parseAttributesListDeclaration(declaration: string): AttListDecl {
        // replace all entities in the declaration
        declaration = this.resolveEntities(declaration);
      
        let i: number = '<!ATTLIST'.length;
        let char: string = declaration.charAt(i);
        // skip spaces before list name
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        // get list name
        let name: string = '';
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (XMLUtils.isXmlSpace(char)) {
                break;
            }
            name += char;
        }
        // skip spaces before attributes declaration
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        let attributesText: string = '';
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (char === '>') {
                break;
            }
            attributesText += char;
        }

        // Validate element name in ATTLIST declaration
        if (!XMLUtils.isValidXMLName(name)) {
            throw new Error(`Invalid element name in ATTLIST declaration: "${name}"`);
        }

        // Expand parameter entities in attributes text before parsing
        attributesText = this.expandParameterEntities(attributesText);

        let list: AttListDecl = new AttListDecl(name, attributesText)
        return list;
    }

    parseElementDeclaration(declaration: string): ElementDecl {
        // replace entities in the declaration
        declaration = this.resolveEntities(declaration);

        let name: string = '';
        let i: number = '<!ELEMENT'.length;
        let char: string = declaration.charAt(i);
        // skip spaces before element name
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        // get element name
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (XMLUtils.isXmlSpace(char)) {
                break;
            }
            name += char;
        }

        // Validate element name
        if (!XMLUtils.isValidXMLName(name)) {
            throw new Error(`Invalid element name in DTD: "${name}" - XML names must be valid`);
        }

        // skip spaces before content spec
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        // get content spec
        let contentSpec: string = '';
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (char === '>') {
                break;
            }
            contentSpec += char;
        }
        return new ElementDecl(name, contentSpec);
    }

    lookingAt(text: string): boolean {
        let length: number = text.length;
        if (this.pointer + length > this.source.length) {
            return false;
        }
        for (let i = 0; i < length; i++) {
            if (this.source[this.pointer + i] !== text[i]) {
                return false;
            }
        }
        return true;
    }

    findDeclarationEnd(startPointer: number): number {
        let i = startPointer;
        let inQuotes = false;
        let quoteChar = '';

        // Skip past the opening tag (e.g., "<!ENTITY", "<!ATTLIST")
        while (i < this.source.length && !XMLUtils.isXmlSpace(this.source.charAt(i)) && this.source.charAt(i) !== '>') {
            i++;
        }

        while (i < this.source.length) {
            let char = this.source.charAt(i);

            if (!inQuotes && (char === '"' || char === "'")) {
                // Starting a quoted section
                inQuotes = true;
                quoteChar = char;
            } else if (inQuotes && char === quoteChar) {
                // Ending a quoted section
                inQuotes = false;
                quoteChar = '';
            } else if (!inQuotes && char === '>') {
                // Found the end of the declaration
                return i;
            }

            i++;
        }

        return -1; // Not found
    }

    resolveEntity(publicId: string, systemId: string): string {
        let location: string | undefined = this.catalog?.resolveEntity(publicId, systemId);
        if (!location && systemId !== '' && !systemId.startsWith('http')) {
            location = this.makeAbsolute(systemId);
        }
        if (location) {
            return location;
        }
        if (systemId.startsWith('http')) {
            return systemId;
        }
        throw new Error('Entity not found: "' + publicId + '" "' + systemId + '"');
    }

    makeAbsolute(uri: string): string {
        // Use base directory if available (for inline DTDs), otherwise use current file directory
        let basePath: string = this.baseDirectory || dirname(this.currentFile);
        return basePath + sep + uri;
    }

    loadExternalEntity(publicId: string, systemId: string, isReferenced: boolean = false): string {
        let reader: FileReader | undefined;
        try {
            let location = this.resolveEntity(publicId, systemId);

            // Use FileReader to properly handle different encodings (UTF-8, UTF-16, etc.)
            reader = new FileReader(location);
            let content = '';
            while (reader.dataAvailable()) {
                content += reader.read();
            }

            // Validate that content is valid XML text (not binary)
            this.validateTextContent(content, location);

            // Don't trim - preserve original content including whitespace/newlines
            return content;
        } catch (error) {
            // Don't load during DTD parsing if base directory not set yet
            if (this.baseDirectory === '' && this.currentFile === '') {
                return '';
            }

            // XML specification behavior depends on context:
            // - Referenced external entities (used in document) must be loadable (fatal error)
            // - Unreferenced external entities (DTD declarations only) can be missing (warning)
            if (isReferenced) {
                throw new Error(`Could not load external entity "${publicId || systemId}": ${(error as Error).message}`);
            } else {
                // DTD processing - be more lenient for unreferenced entities
                console.warn(`Warning: Could not load external entity "${publicId || systemId}": ${(error as Error).message}`);
                return '';
            }
        } finally {
            // Ensure file handle is always closed to prevent EMFILE errors
            if (reader) {
                try {
                    reader.closeFile();
                } catch (closeError) {
                    console.error(`Error closing file reader: ${(closeError as Error).message}`);
                }
            }
        }
    }

    private validateTextContent(content: string, location: string): void {
        // Check for null bytes and other binary indicators
        if (content.includes('\0')) {
            throw new Error(`External entity "${location}" contains binary data (null bytes) and cannot be used as XML text`);
        }

        // Skip BOM if present (UTF-8: \uFEFF or UTF-16: \uFEFF)
        let textContent = content;
        if (textContent.charCodeAt(0) === 0xFEFF) {
            textContent = textContent.substring(1);
        }

        // Allow a single leading text declaration per XML 1.0 section 4.3.1, flag any others
        const firstNonWhitespace = textContent.search(/\S/);
        if (firstNonWhitespace !== -1 && textContent.startsWith('<?xml', firstNonWhitespace)) {
            const textDeclEnd = textContent.indexOf('?>', firstNonWhitespace);
            if (textDeclEnd === -1) {
                throw new Error(`External entity "${location}" has an unterminated text declaration`);
            }

            const textDeclaration = textContent.substring(firstNonWhitespace, textDeclEnd + 2);
            if (!/encoding\s*=\s*(['"]).+?\1/i.test(textDeclaration)) {
                throw new Error(`External entity "${location}" text declaration must include an encoding pseudo-attribute`);
            }

            const remainingContent = textContent.substring(textDeclEnd + 2);
            if (remainingContent.match(/<\?xml\s+/i)) {
                throw new Error(`External entity "${location}" contains multiple XML declarations`);
            }
        } else if (textContent.match(/<\?xml\s+/i)) {
            throw new Error(`External entity "${location}" contains XML declaration in invalid position`);
        }

        // Check for excessive non-printable characters that might indicate binary content
        let nonPrintableCount = 0;
        const checkLength = Math.min(textContent.length, 1000);
        for (let i = 0; i < checkLength; i++) {
            const code = textContent.charCodeAt(i);
            // Allow common XML characters: tab(9), newline(10), carriage return(13), and printable ASCII
            // Also allow Unicode characters above 127
            if (code < 9 || (code > 13 && code < 32) || code === 127) {
                nonPrintableCount++;
            }
        }

        // If more than 20% of characters are non-printable control characters, likely binary
        // (increased threshold and only checked control chars, not Unicode)
        if (checkLength > 0 && (nonPrintableCount / checkLength) > 0.2) {
            throw new Error(`External entity "${location}" appears to contain binary data and cannot be used as XML text`);
        }
    }

    expandParameterEntities(text: string): string {
        let result: string = text;
        const maxIterations: number = 50;
        let iteration: number = 0;

        while (iteration < maxIterations) {
            const entityMatches = this.findParameterEntityReferences(result);
            if (entityMatches.length === 0) {
                break;
            }

            let changed: boolean = false;

            for (const match of entityMatches) {
                const entity = this.grammar.getParameterEntity(match.name);
                if (!entity) {
                    continue;
                }
                const entityValue: string = entity.getValue();

                let searchIndex: number = 0;
                while (true) {
                    const referenceIndex: number = result.indexOf(match.reference, searchIndex);
                    if (referenceIndex === -1) {
                        break;
                    }

                    const beforeChar: string = referenceIndex > 0 ? result.charAt(referenceIndex - 1) : '';
                    const afterIndex: number = referenceIndex + match.reference.length;
                    const afterChar: string = afterIndex < result.length ? result.charAt(afterIndex) : '';

                    let replacement: string = entityValue;
                    if (this.needsSeparatorBefore(beforeChar, replacement)) {
                        replacement = ' ' + replacement;
                    }
                    if (this.needsSeparatorAfter(afterChar, replacement)) {
                        replacement = replacement + ' ';
                    }

                    result = result.substring(0, referenceIndex) + replacement + result.substring(afterIndex);
                    searchIndex = referenceIndex + replacement.length;
                    changed = true;
                }
            }

            if (!changed) {
                break;
            }

            iteration++;
        }

        if (iteration >= maxIterations) {
            console.warn(`Parameter entity expansion reached maximum iterations (${maxIterations}), some entities may not be fully expanded`);
        }

        return result;
    }

    private needsSeparatorBefore(beforeChar: string, replacement: string): boolean {
        if (replacement.length === 0) {
            return false;
        }
        if (beforeChar === '') {
            return false;
        }
        if (XMLUtils.isXmlSpace(beforeChar)) {
            return false;
        }
        if (this.isMarkupDelimiter(beforeChar)) {
            return false;
        }
        return !this.startsWithWhitespace(replacement);
    }

    private needsSeparatorAfter(afterChar: string, replacement: string): boolean {
        if (replacement.length === 0) {
            return false;
        }
        if (afterChar === '') {
            return false;
        }
        if (XMLUtils.isXmlSpace(afterChar)) {
            return false;
        }
        if (this.isMarkupDelimiter(afterChar)) {
            return false;
        }
        return !this.endsWithWhitespace(replacement);
    }

    private startsWithWhitespace(value: string): boolean {
        return value.length > 0 && XMLUtils.isXmlSpace(value.charAt(0));
    }

    private endsWithWhitespace(value: string): boolean {
        return value.length > 0 && XMLUtils.isXmlSpace(value.charAt(value.length - 1));
    }

    private isMarkupDelimiter(char: string): boolean {
        if (char === '') {
            return false;
        }
        return ['<', '>', '[', ']', '(', ')', '"', '\'', '|', '?', '*', '+', '=', ',', ';', ':', '/'].includes(char);
    }

    private findParameterEntityReferences(text: string): Array<{ reference: string, name: string }> {
        const references: Array<{ reference: string, name: string }> = [];
        let inQuotes: boolean = false;
        let quoteChar: string = '';
        let index: number = 0;

        while (index < text.length) {
            const char: string = text.charAt(index);
            if (inQuotes) {
                if (char === quoteChar) {
                    inQuotes = false;
                    quoteChar = '';
                }
                index++;
                continue;
            }
            if (char === '"' || char === "'") {
                inQuotes = true;
                quoteChar = char;
                index++;
                continue;
            }
            if (char === '%') {
                let end: number = text.indexOf(';', index + 1);
                if (end === -1) {
                    break;
                }
                const rawName: string = text.substring(index + 1, end).trim();
                if (rawName.length > 0 && XMLUtils.isValidXMLName(rawName)) {
                    references.push({ reference: `%${rawName};`, name: rawName });
                }
                index = end + 1;
                continue;
            }
            index++;
        }

        return references;
    }

    getGrammar(): DTDGrammar {
        return this.grammar;
    }
}