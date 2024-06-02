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

import { Constants } from "../Constants";
import { XMLAttribute } from "../XMLAttribute";
import { XMLElement } from "../XMLElement";
import { XMLNode } from "../XMLNode";
import { XMLUtils } from "../XMLUtils";
import { AttDecl } from "../dtd/AttDecl";
import { Grammar } from "./Grammar";

export class ContentModel {

    OPTIONAL: string = '?';
    ZERO_OR_MORE: string = '*';
    ONE_OR_MORE: string = '+';
    ONE: string = '';

    private grammar: Grammar;
    private name: string;
    private mixed: boolean;

    contentTypes: string[] = ['EMPTY', 'ANY', 'MIXED', 'CHILDREN'];
    contentType: string;

    model: Array<any>

    constructor(grammar: Grammar, name: string, contentSpec: string) {
        this.grammar = grammar;
        this.name = name;
        this.model = this.parseSpec(contentSpec);
        this.mixed = false;
    }

    parseSpec(contentSpec: string): any[] {
        let result: any[] = [];
        let tokens: string[] = [];
        let token: string = '';
        let index: number = 0;
        while (index < contentSpec.length) {
            let c: string = contentSpec.charAt(index++);
            if (XMLUtils.isXmlSpace(c)) {
                continue;
            }
            if (c === '*' || c === '+' || c === '?') {
                if (tokens.length < 1) {
                    throw new Error('Invalid content model: ' + contentSpec);
                }
                tokens[tokens.length - 1] = tokens[tokens.length - 1] + c;
            }
            if (c === '(' || c === ')' || c === '|' || c === ',') {
                if (token.length > 0) {
                    tokens.push(token);
                    token = '';
                }
                tokens.push(c);
            } else {
                token += c;
            }
        }
        return result;
    }

    toString(): string {
        return this.name;
    }

    isMixed(): boolean {
        return this.mixed;
    }

    isValid(element: XMLElement): boolean {
        let attList: Map<string, AttDecl> = this.grammar.getElementAttributesMap(element.getName());
        let attributes: XMLAttribute[] = element.getAttributes();
        for (let i = 0; i < attributes.length; i++) {
            let attribute: XMLAttribute = attributes[i];
            let name: string = attribute.getName();
            let attDecl: AttDecl = attList.get(name);
            if (attDecl) {
                if (!attDecl.isValid(attribute.getValue())) {
                    return false;
                }
            } else {
                throw new Error('Attribute \'' + name + '\' not allowed in element \'' + element.getName() + '\'');
            }
        }
        let content: XMLNode[] = element.getContent();
        if (this.contentType === 'EMPTY' && content.length > 0) {
            throw new Error('Empty \'' + element.getName() + '\' element has content');
        }
        if (this.contentType === 'ANY') {
            return true;
        }
        if (content) {
            for (let i = 0; i < content.length; i++) {
                let node: XMLNode = content[i];
                if (node.getNodeType() === Constants.TEXT_NODE) {
                    let text: string = node.toString();
                    if (text.trim().length > 0 && this.contentType !== 'MIXED') {
                        throw new Error('Element \'' + element.getName() + '\' cannot have #PCDATA content');
                    }
                }
                if (node.getNodeType() === Constants.ELEMENT_NODE) {
                    let childElement: XMLElement = <XMLElement>node;
                    // TODO check sequence
                }
            }
        }
        return true;
    }
}