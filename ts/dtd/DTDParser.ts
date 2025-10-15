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

import { Stats, closeSync, openSync, readSync, statSync } from "fs";
import * as path from "node:path";
import { Catalog } from "../Catalog";
import { XMLUtils } from "../XMLUtils";
import { Grammar } from "../grammar/Grammar";
import { AttListDecl } from "./AttListDecl";
import { ElementDecl } from "./ElementDecl";
import { EntityDecl } from "./EntityDecl";
import { NotationDecl } from "./NotationDecl";

export class DTDParser {

    private grammar: Grammar;
    private catalog: Catalog | undefined;
    private pointer: number = 0;
    private source: string;
    private currentFile: string;

    constructor(grammar?: Grammar) {
        this.source = '';
        this.currentFile = '';
        if (grammar) {
            this.grammar = grammar;
        } else {
            this.grammar = new Grammar();
        }
    }

    setCatalog(catalog: Catalog) {
        this.catalog = catalog;
    }

    parseDTD(file: string): Grammar {
        this.parseFile(file);
        this.grammar.processModels();
        return this.grammar;
    }

    parseFile(file: string): Grammar {
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

    parseString(source: string): Grammar {
        this.source = source;
        this.parse();
        this.grammar.processModels();
        return this.grammar;
    }

    parse(): Grammar {
        this.pointer = 0;
        while (this.pointer < this.source.length) {
            if (this.lookingAt('<!ELEMENT')) {
                let index: number = this.source.indexOf('>', this.pointer);
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
                let index: number = this.source.indexOf('>', this.pointer);
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
                let index: number = this.source.indexOf('>', this.pointer);
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
                let index: number = this.source.indexOf('>', this.pointer);
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
                let entity: EntityDecl | undefined = this.grammar.getEntity(entityName);
                if (entity === undefined) {
                    throw new Error('Unknown entity: ' + entityName);
                }
                let value: string = entity.getValue();
                if (value !== '') {
                    let start: string = this.source.substring(0, this.pointer);
                    let end: string = this.source.substring(index + ';'.length);
                    this.source = start + value + end;
                    this.pointer += value.length;
                } else if (entity.getSystemId() !== '' || entity.getPublicId() !== '') {
                    let location = this.resolveEntity(entity.getPublicId(), entity.getSystemId());
                    let parser: DTDParser = new DTDParser(this.grammar);
                    if (this.catalog) {
                        parser.setCatalog(this.catalog);
                    }
                    let externalGrammar: Grammar = parser.parseFile(location);
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
            let start = fragment.indexOf('%');
            let end = fragment.indexOf(';');
            let entityName = fragment.substring(start + '%'.length, end);
            let entity: EntityDecl | undefined = this.grammar.getEntity(entityName);
            if (entity === undefined) {
                throw new Error('Unknown entity: ' + entityName);
            }
            fragment = fragment.replace('%' + entityName + ';', entity.getValue());
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
                    return new EntityDecl(name, parameterEntity, '', systemId, '', ndata);
                }
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
                return new EntityDecl(name, parameterEntity, value, '', '', '');
            }
        }
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
        
        // Expand parameter entities in attributes text before parsing
        attributesText = this.expandParameterEntities(attributesText);
        
        let list: AttListDecl = new AttListDecl(name, attributesText)
        return list;
    }

    parseElementDeclaration(declaration: string): ElementDecl {
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
        let currentPath: string = path.dirname(this.currentFile);
        return currentPath + path.sep + uri;
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
                
                let entity = this.grammar.getEntity(entityName);
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

    getGrammar(): Grammar {
        return this.grammar;
    }
}