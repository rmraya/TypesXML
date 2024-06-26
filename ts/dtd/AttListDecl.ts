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
import { XMLNode } from "../XMLNode";
import { AttDecl } from "./AttDecl";

export class AttListDecl implements XMLNode {

    private name: string;
    private attributes: Map<string, AttDecl>;

    static readonly attTypes: string[] = ['CDATA', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'NMTOKEN', 'NMTOKENS'];

    constructor(name: string, attributesText: string) {
        this.name = name;
        this.attributes = new Map<string, AttDecl>();
        this.parseAttributes(attributesText);
    }

    getName(): string {
        return this.name;
    }

    getAttributes(): Map<string, AttDecl> {
        return this.attributes;
    }

    parseAttributes(text: string) {
        let parts: string[] = this.split(text);
        let index: number = 0;
        while (index < parts.length) {
            let name: string = parts[index++];
            let attType: string = parts[index++];
            let defaultDecl: string = '';
            let defaultValue: string = '';
            if (AttListDecl.attTypes.includes(attType)) {
                defaultDecl = parts[index++];
                if (defaultDecl === '#FIXED') {
                    defaultValue = parts[index++];
                }
            } else {
                if (attType === 'NOTATION') {
                    // TODO parse the notations in the ennumeration that follows
                } else {
                    defaultValue = parts[index++];
                }
            }
            let att: AttDecl = new AttDecl(name, attType, defaultDecl, defaultValue);
            this.attributes.set(name, att);
        }
    }

    split(text: string): string[] {
        let result: string[] = [];
        let word: string = '';
        for (let i = 0; i < text.length; i++) {
            let c: string = text.charAt(i);
            if (c === '(') {
                // starts an enumeration
                let enumeration: string = '(';
                while (c !== ')') {
                    c = text.charAt(++i);
                    enumeration += c;
                }
                result.push(enumeration);
                continue;
            }
            if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
                if (word.length > 0) {
                    result.push(word);
                    word = '';
                }
            } else {
                word += c;
            }
        }
        if (word.length > 0) {
            result.push(word);
        }
        return result;
    }

    getNodeType(): number {
        return Constants.ATTRIBUTE_LIST_DECL_NODE;
    }

    toString(): string {
        let result: string = '<!ATTLIST ' + this.name + '\n';
        this.attributes.forEach((a: AttDecl) => {
            result += ' ' + a.toString() + '\n';
        });
        return result + '>';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof AttListDecl) {
            let nodeAtts: Map<string, AttDecl> = node.getAttributes();
            if (this.name !== node.getName() || this.attributes.size !== nodeAtts.size) {
                return false;
            }
            this.attributes.forEach((value: AttDecl, key: string) => {
                if (!value.equals(nodeAtts.get(key))) {
                    return false;
                }
            });
            return true;
        }
        return false;
    }
}