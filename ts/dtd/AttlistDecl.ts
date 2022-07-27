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
import { XMLAttribute } from "../XMLAttribute";
import { XMLNode } from "../XMLNode";
import { XMLUtils } from "../XMLUtils";

export class AttlistDecl implements XMLNode {

    private listName: string;
    private attributes: Map<string, XMLAttribute>;

    constructor(declaration: string) {
        this.listName = '';
        this.attributes = new Map<string, XMLAttribute>();
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

    getAttributes(): Map<string, XMLAttribute> {
        return this.attributes;
    }

    parseAttributes(text: string) {
        // TODO
    }

    getNodeType(): number {
        return Constants.ATTRIBUTE_DECL_NODE;
    }

    toString(): string {
        let result: string = '<!ATTLIST ' + this.listName;
        this.attributes.forEach((a: XMLAttribute) => {
            result += ' ' + a.getName() + ' ' + a.getType() + ' ' + a.getDefaultValue() + '\n';
        });
        return result + '>';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof AttlistDecl) {
            let nodeAtts: Map<string, XMLAttribute> = node.getAttributes();
            if (this.listName !== node.getListName() || this.attributes.size !== nodeAtts.size) {
                return false;
            }
            this.attributes.forEach((value: XMLAttribute, key: string) => {
                if (value !== nodeAtts.get(key)) {
                    return false;
                }
            });
            return true;
        }
        return false;
    }
}