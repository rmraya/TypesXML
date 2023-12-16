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

export class DTDParser {

    private grammar: Grammar;
    private elementDeclMap: Map<string, ElementDecl>;
    private attributeListMap: Map<string, AttlistDecl>;
    private entitiesMap: Map<string, EntityDecl>;
    private notationsMap: Map<string, NotationDecl>;

    constructor() {
        this.elementDeclMap = new Map<string, ElementDecl>();
        this.attributeListMap = new Map<string, AttlistDecl>();
        this.entitiesMap = new Map<string, EntityDecl>();
        this.notationsMap = new Map<string, NotationDecl>();
    }

    parseFile(file: string): Grammar {
        let source: string = '';
        let stats: Stats = statSync(file, { bigint: false, throwIfNoEntry: true });
        let blockSize: number = stats.blksize;
        let fileHandle = openSync(file, 'r');
        let buffer = Buffer.alloc(blockSize);
        let bytesRead: number = readSync(fileHandle, buffer, 0, blockSize, 0);
        while (bytesRead > 0) {
            source += buffer.toString('utf8', 0, bytesRead);
            bytesRead = readSync(fileHandle, buffer, 0, blockSize, source.length);
        }
        closeSync(fileHandle);
        return this.parseString(source);
    }

    parseString(source: string): Grammar {
        let pointer: number = 0;
        this.grammar = new Grammar();

        while (pointer < source.length) {
            if (XMLUtils.lookingAt('<!ELEMENT', source, pointer)) {
                let index: number = source.indexOf('>', pointer);
                if (index === -1) {
                    throw new Error('Malformed element declaration');
                }
                let elementText: string = source.substring(pointer, index + '>'.length);
                let elementDecl: ElementDecl = DTDParser.parseElementDeclaration(elementText);
                this.elementDeclMap.set(elementDecl.getName(), elementDecl);
                pointer += elementText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<!ATTLIST', source, pointer)) {
                let index: number = source.indexOf('>', pointer);
                if (index === -1) {
                    throw new Error('Malformed attribute declaration');
                }
                let attListText: string = source.substring(pointer, index + '>'.length);
                let attList: AttlistDecl = DTDParser.parseAttributesListDeclaration(attListText);
                this.attributeListMap.set(attList.getListName(), attList);
                pointer += attListText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<!ENTITY', source, pointer)) {
                let index: number = source.indexOf('>', pointer);
                if (index === -1) {
                    throw new Error('Malformed entity declaration');
                }
                let entityDeclText: string = source.substring(pointer, index + '>'.length);
                let entityDecl: EntityDecl = DTDParser.parseEntityDeclaration(entityDeclText);
                this.entitiesMap.set(entityDecl.getName(), entityDecl);
                pointer += entityDeclText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<!NOTATION', source, pointer)) {
                let index: number = source.indexOf('>', pointer);
                if (index === -1) {
                    throw new Error('Malformed notation declaration');
                }
                let notationDeclText: string = source.substring(pointer, index + '>'.length);
                let notation: NotationDecl = DTDParser.parseNotationDeclaration(notationDeclText);
                this.notationsMap.set(notation.getName(), notation);
                pointer += notationDeclText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<?', source, pointer)) {
                let index: number = source.indexOf('?>', pointer);
                if (index === -1) {
                    throw new Error('Malformed processing instruction');
                }
                let piText: string = source.substring(pointer, index + '?>'.length);
                // ignore processing instructions
                pointer += piText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<!--', source, pointer)) {
                let index: number = source.indexOf('-->', pointer);
                if (index === -1) {
                    throw new Error('Malformed comment');
                }
                let commentText: string = source.substring(pointer, index + '-->'.length);
                // ignore comments
                pointer += commentText.length;
                continue;
            }
            if (XMLUtils.lookingAt('%', source, pointer)) {
                let index: number = source.indexOf(';', pointer);
                if (index == -1) {
                    throw new Error('Malformed entity reference');
                }
                let entityName: string = source.substring(pointer + '%'.length, index);
                pointer += '%'.length + entityName.length + ';'.length;
            }
            let char: string = source.charAt(pointer);
            if (XMLUtils.isXmlSpace(char)) {
                pointer++;
                continue;
            }
            throw new Error('Error parsing DTD');
        }
        this.grammar.setElementsMap(this.elementDeclMap);
        this.grammar.setAttributesMap(this.attributeListMap);
        this.grammar.setEntitiesMap(this.entitiesMap);
        this.grammar.setNotationsMap(this.notationsMap);
        return this.grammar;
    }

    static parseEntityDeclaration(declaration: string): EntityDecl {
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
                // get public id
                let publicId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    publicId += char;
                }
                // skip spaces before system id
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        break;
                    }
                }
                // get system id
                let systemId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    systemId += char;
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
                // get system id
                let systemId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    systemId += char;
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
                // get public id
                let publicId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    publicId += char;
                }
                // skip spaces before system id
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (!XMLUtils.isXmlSpace(char)) {
                        break;
                    }
                }
                // get system id
                let systemId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    systemId += char;
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
                    return new EntityDecl(name, parameterEntity, '', systemId, publicId, ndata);
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
                // get system id
                let systemId: string = '';
                for (; i < declaration.length; i++) {
                    char = declaration.charAt(i);
                    if (char === '"') {
                        break;
                    }
                    systemId += char;
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
                return new EntityDecl(name, parameterEntity, value, '', '', '');
            }
        }
    }

    static parseNotationDeclaration(declaration: string): NotationDecl {
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

    static parseAttributesListDeclaration(declaration: string): AttlistDecl {
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

    static parseElementDeclaration(declaration: string): ElementDecl {
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
}