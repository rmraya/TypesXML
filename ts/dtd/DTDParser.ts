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

import { Stats, closeSync, openSync, readSync, statSync } from "fs";
import { XMLUtils } from "../XMLUtils";
import { Grammar } from "../grammar/Grammar";
import { AttlistDecl } from "./AttlistDecl";
import { ElementDecl } from "./ElementDecl";
import { EntityDecl } from "./EntityDecl";
import { NotationDecl } from "./NotationDecl";
import { Catalog } from "../Catalog";
import path = require("path");

export class DTDParser {

    private grammar: Grammar;
    private catalog: Catalog;
    private pointer: number = 0;
    private source: string;
    private currentFile: string;

    constructor() {
        this.currentFile = '';
    }

    setCatalog(catalog: Catalog) {
        this.catalog = catalog;
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
        return this.parse();
    }

    parse(): Grammar {
        this.pointer = 0;
        this.grammar = new Grammar();

        while (this.pointer < this.source.length) {
            if (this.lookingAt('<!ELEMENT')) {
                let index: number = this.source.indexOf('>', this.pointer);
                if (index === -1) {
                    throw new Error('Malformed element declaration');
                }
                let elementText: string = this.source.substring(this.pointer, index + '>'.length);
                let length = elementText.length;
                if (this.hasParameterEntity(elementText)) {
                    elementText = this.resolveEntities(elementText);
                }
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
                if (this.hasParameterEntity(attListText)) {
                    attListText = this.resolveEntities(attListText);
                }
                let attList: AttlistDecl = this.parseAttributesListDeclaration(attListText);
                this.grammar.addAttributesList(attList);
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
                if (this.hasParameterEntity(notationDeclText)) {
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
                let entity: EntityDecl = this.grammar.getEntity(entityName);
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
                    let parser: DTDParser = new DTDParser();
                    parser.setCatalog(this.catalog);
                    let externalGrammar: Grammar = parser.parseFile(location);
                    this.grammar.merge(externalGrammar);
                    this.pointer = index + ';'.length;
                } else {
                    throw new Error('Parameter entity without value or external subset: ' + entityName);
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
        if (this.hasParameterEntity(keyword)) {
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

    hasParameterEntity(fragment: string) {
        return fragment.indexOf('%') !== -1 && fragment.indexOf(';') !== -1;
    }

    resolveEntities(fragment: string): string {
        while (this.hasParameterEntity(fragment)) {
            let start = fragment.indexOf('%');
            let end = fragment.indexOf(';');
            let entityName = fragment.substring(start + '%'.length, end);
            let entity: EntityDecl = this.grammar.getEntity(entityName);
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
        if (this.hasParameterEntity(name)) {
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
                i++; // skip opening "
                // get public id
                let publicId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    publicId += char;
                }
                i++; // skip closing "
                if (this.hasParameterEntity(publicId)) {
                    publicId = this.resolveEntities(publicId);
                }
                // skip spaces before system id
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        break;
                    }
                }
                i++; // skip opening "
                // get system id
                let systemId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    systemId += char;
                }
                if (this.hasParameterEntity(systemId)) {
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
                i++; // skip opening "
                // get system id
                let systemId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    systemId += char;
                }
                if (this.hasParameterEntity(systemId)) {
                    systemId = this.resolveEntities(systemId);
                }
                return new EntityDecl(name, parameterEntity, '', systemId, '', '');
            } else {
                // get entity value
                i++; // skip opening "
                let value: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    value += char;
                }
                if (this.hasParameterEntity(value)) {
                    value = this.resolveEntities(value);
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
                i++; // skip "
                // get public id
                let publicId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    publicId += char;
                }
                i++; // skip closing "
                if (this.hasParameterEntity(publicId)) {
                    publicId = this.resolveEntities(publicId);
                }
                // skip spaces before system id
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        break;
                    }
                }
                i++; // skip "
                // get system id
                let systemId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    systemId += char;
                }
                i++; // skip closing "
                if (this.hasParameterEntity(systemId)) {
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
                    if (this.hasParameterEntity(ndata)) {
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
                i++; // skip "
                // get system id
                let systemId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    systemId += char;
                }
                if (this.hasParameterEntity(systemId)) {
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
                    if (this.hasParameterEntity(ndata)) {
                        ndata = this.resolveEntities(ndata);
                    }
                    return new EntityDecl(name, parameterEntity, '', systemId, '', ndata);
                }
                return new EntityDecl(name, parameterEntity, '', systemId, '', '');
            } else {
                // get entity value
                i++; // skip "
                let value: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    value += char;
                }
                if (this.hasParameterEntity(value)) {
                    value = this.resolveEntities(value);
                }
                return new EntityDecl(name, parameterEntity, value, '', '', '');
            }
        }
    }

    parseNotationDeclaration(declaration: string): NotationDecl {
        let name: string = '';
        let i: number = '<!ATTLIST'.length;
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
        // get external id
        let externalId: string = '';
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (char === '>') {
                break;
            }
            externalId += char;
        }
        let publicId: string = '';
        let systemId: string = '';
        if (XMLUtils.lookingAt('PUBLIC', externalId, 0)) {
            let index: number = externalId.indexOf('"', 'PUBLIC'.length);
            if (index === -1) {
                throw new Error('Malformed notation declaration');
            }
            publicId = externalId.substring('PUBLIC'.length, index);
            index = externalId.indexOf('"', index + '"'.length);
            if (index === -1) {
                throw new Error('Malformed notation declaration');
            }
            systemId = externalId.substring(index + '"'.length);
        } else if (XMLUtils.lookingAt('SYSTEM', externalId, 0)) {
            let index: number = externalId.indexOf('"', 'SYSTEM'.length);
            if (index === -1) {
                throw new Error('Malformed notation declaration');
            }
            systemId = externalId.substring('SYSTEM'.length, index);
        } else {
            throw new Error('Malformed notation declaration');
        }
        return new NotationDecl(name, publicId, systemId);
    }

    parseAttributesListDeclaration(declaration: string): AttlistDecl {
        let name: string = '';
        let i: number = '<!ATTLIST'.length;
        let char: string = declaration.charAt(i);
        // skip spaces before list name
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        // skip spaces before attributes declaration
        for (; i < declaration.length; i++) {
            char = declaration.charAt(i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        let atttibutesText: string = declaration.substring(i).trim();
        return new AttlistDecl(name, atttibutesText);
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
        let location: string = this.catalog.resolveEntity(publicId, systemId);
        if (!location && systemId !== '') {
            location = this.makeAbsolute(systemId);
        }
        if (location) {
            return location;
        }
        throw new Error('Entity not found: ' + publicId + ' ' + systemId);
    }

    makeAbsolute(uri: string): string {
        let currentPath: string = path.dirname(this.currentFile);
        return currentPath + path.sep + uri;
    }

    getGrammar(): Grammar {
        return this.grammar;
    }   
}