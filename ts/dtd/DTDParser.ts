/*******************************************************************************
 * Copyright (c) 2022 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

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

    parse(source: string): Grammar {
        let pointer: number = 0;
        this.grammar = new Grammar();

        while (pointer < source.length) {
            if (XMLUtils.lookingAt('<!ELEMENT', source, pointer)) {
                let index: number = source.indexOf('>', pointer);
                if (index === -1) {
                    throw new Error('Malformed element declaration');
                }
                let elementText: string = source.substring(pointer, index + '>'.length);
                let elementDecl: ElementDecl = new ElementDecl(elementText);
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
                let attList: AttlistDecl = new AttlistDecl(attListText);
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
                let entityDecl: EntityDecl = new EntityDecl(entityDeclText);
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
                let notation: NotationDecl = new NotationDecl(notationDeclText);
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
        return this.grammar;
    }
}