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

export class NotationDecl implements XMLNode {

    static readonly NOTATION_DECL_NODE: number = 11;

    private name: string;

    constructor(declaration: string) {
        this.name = '';
        let i: number = '<!NOTATION'.length;
        let char: string = declaration.charAt(i);
        while (XMLUtils.isXmlSpace(char)) {
            i++;
            char = declaration.charAt(i);
        }
        while (!XMLUtils.isXmlSpace(char)) {
            this.name += char;
            i++;
            char = declaration.charAt(i);
        }
    }

    getNodeType(): number {
        return NotationDecl.NOTATION_DECL_NODE;
    }

    toString(): string {
        throw new Error("Method not implemented.");
    }

    equals(node: XMLNode): boolean {
        throw new Error("Method not implemented.");
    }

}