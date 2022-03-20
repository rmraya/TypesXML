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
import { XMLNode } from "../XMLNode";
import { Attribute } from "../Attribute";

export class AttlistDecl implements XMLNode {

    static readonly ATTRIBUTE_DECL_NODE: number = 9;

    private listName: string;
    private attributes: Map<string, Attribute>;

    constructor(declaration: string) {
        this.listName = '';
        this.attributes = new Map<string, Attribute>();
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

    getAttributes(): Map<string, Attribute> {
        return this.attributes;
    }

    parseAttributes(text: string) {
        // TODO
    }

    getNodeType(): number {
        return AttlistDecl.ATTRIBUTE_DECL_NODE;
    }

    toString(): string {
        let result: string = '<!ATTLIST ' + this.listName;
        this.attributes.forEach((a: Attribute) => {
            result += ' ' + a.getName() + ' ' + a.getType() + ' ' + a.getDefaultValue() + '\n';
        });
        return result + '>'; 
    }

    equals(node: XMLNode): boolean {
        // TODO
        throw new Error("Method not implemented.");
    }
}