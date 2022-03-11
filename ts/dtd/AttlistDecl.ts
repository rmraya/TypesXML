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

export class AttlistDecl implements XMLNode {

    static readonly ATTRIBUTE_DECL_NODE: number = 9;

    private listName: string;

    constructor(declaration: string) {
        this.listName = '';
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

    }

    getNodeType(): number {
        return AttlistDecl.ATTRIBUTE_DECL_NODE;
    }

    toString(): string {
        throw new Error("Method not implemented.");
    }

    equals(node: XMLNode): boolean {
        throw new Error("Method not implemented.");
    }

}