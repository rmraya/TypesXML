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

import { Constants } from "../Constants";
import { XMLNode } from "../XMLNode";
import { XMLUtils } from "../XMLUtils";
import { AttDecl } from "./AttDecl";

export class AttlistDecl implements XMLNode {

    private listName: string;
    private attributes: Map<string, AttDecl>;

    private attTypes: string[] = ['CDATA', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'NMTOKEN', 'NMTOKENS'];

    constructor(declaration: string) {
        this.listName = '';
        this.attributes = new Map<string, AttDecl>();
        let i: number = '<!ATTLIST'.length;
        let char: string = declaration.charAt(i);
        while (XMLUtils.isXmlSpace(char)) {
            i++;
            char = declaration.charAt(i);
        }
        while (!XMLUtils.isXmlSpace(char)) {
            this.listName += char;
            i++;
            char = declaration.charAt(i);
        }
        this.parseAttributes(declaration.substring(i).trim());
    }

    getListName(): string {
        return this.listName;
    }

    getAttributes(): Map<string, AttDecl> {
        return this.attributes;
    }

    parseAttributes(text: string) {
        let parts: string[] = text.split(/[ \t\r\n]/); // (#x20 | #x9 | #xD | #xA)
        let index: number = 0;
        while (index < parts.length) {
            let name: string = parts[index++];
            let type: string = parts[index++];
            let defaultType: string = parts[index++];
            let defaultValue: string = '';
            if ('#FIXED' === defaultType) {
                defaultValue = parts[index++];
            }
        }

    }

    getNodeType(): number {
        return Constants.ATTRIBUTE_LIST_DECL_NODE;
    }

    toString(): string {
        let result: string = '<!ATTLIST ' + this.listName;
        this.attributes.forEach((a: AttDecl) => {
            result += ' ' + a.toString() + '\n';
        });
        return result + '>';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof AttlistDecl) {
            let nodeAtts: Map<string, AttDecl> = node.getAttributes();
            if (this.listName !== node.getListName() || this.attributes.size !== nodeAtts.size) {
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