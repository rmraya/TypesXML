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

export class ElementDecl implements XMLNode {

    private name: string;

    constructor(declaration: string) {
        this.name = '';
        let i: number = '<!ELEMENT'.length;
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
        return Constants.ELEMENT_DECL_NODE;
    }

    toString(): string {
        let result: string = '<!ELEMENT ' + this.name;
        // TODO
        return result + '>';
    }

    equals(node: XMLNode): boolean {
        // TODO
        throw new Error("Method not implemented.");
    }
}