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
        while (this.pointer < this.source.length) {
            if (this.lookingAt('<!ELEMENT')) {
                let index: number = this.findDeclarationEnd(this.pointer);
                if (index === -1) {
                    throw new Error('Malformed element declaration');
                }
                let elementText: string = this.source.substring(this.pointer, index + '>'.length);
                let length = elementText.length;
                let elementDecl: ElementDecl = this.parseElementDeclaration(elementText);
                this.grammar.addElement(elementDecl);
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
                this.grammar.addAttributes(attList.getName(), attList.getAttributes());
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
                this.grammar.addEntity(entityDecl);
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
                this.grammar.addNotation(notation);
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
                            this.grammar.addEntity(externalEntity);
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
            keyword = this.resolveEntities(keyword);
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

    resolveEntities(fragment: string): string {
        while (XMLUtils.hasParameterEntity(fragment)) {
            let start: number = fragment.indexOf('%');
            if (start === -1) {
                break;
            }
            let end: number = fragment.indexOf(';', start);
            if (end === -1) {
                throw new Error('Malformed parameter entity reference while resolving "' + fragment + '"');
            }
            let entityName: string = fragment.substring(start + '%'.length, end).trim();
            let entity: EntityDecl | undefined = this.grammar.getParameterEntity(entityName);
            if (entity === undefined) {
                let context: string = fragment.substring(start, Math.min(fragment.length, start + 80));
                throw new Error('Unknown entity: ' + entityName + ' in resolveEntities while processing "' + context + '"');
            }
            let replacement: string = entity.getValue();
            fragment = fragment.substring(0, start) + replacement + fragment.substring(end + ';'.length);
        }
        return fragment;
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

        // Check for XML declarations in external entities (not allowed)
        const xmlDeclPattern = /<\?xml\s+/gi;
        const xmlDeclMatches = textContent.match(xmlDeclPattern);
        if (xmlDeclMatches && xmlDeclMatches.length > 0) {
            throw new Error(`External entity "${location}" contains XML declaration(s), which is not allowed in external entities`);
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
        let result = text;
        let expandedEntities = new Set<string>(); // Track expanded entities to prevent circular references
        let maxIterations = 50; // Increase limit for complex DTDs
        let iteration = 0;

        while (iteration < maxIterations) {
            let changed = false;

            // Find all parameter entity references in current text
            let entityMatches = result.match(/%[a-zA-Z0-9_.-]+;/g);
            if (!entityMatches) {
                break; // No more entities to expand
            }

            for (let entityRef of entityMatches) {
                let entityName = entityRef.substring(1, entityRef.length - 1); // Remove % and ;

                // Skip if we've already expanded this entity to prevent cycles
                if (expandedEntities.has(entityName)) {
                    continue;
                }

                let entity = this.grammar.getParameterEntity(entityName);
                if (entity && entity.getValue()) {
                    let entityValue = entity.getValue();

                    // Only expand if the value doesn't contain the same entity reference (simple cycle detection)
                    if (!entityValue.includes(entityRef)) {
                        result = result.replace(new RegExp(this.escapeRegExp(entityRef), 'g'), entityValue);
                        expandedEntities.add(entityName);
                        changed = true;
                    }
                }
            }

            if (!changed) {
                break; // No more expansions possible
            }

            iteration++;
        }

        if (iteration >= maxIterations) {
            console.warn(`Parameter entity expansion reached maximum iterations (${maxIterations}), some entities may not be fully expanded`);
        }

        return result;
    }

    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    getGrammar(): DTDGrammar {
        return this.grammar;
    }
}