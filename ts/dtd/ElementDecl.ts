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

import { Constants } from "../Constants";
import { XMLNode } from "../XMLNode";

export class ElementDecl implements XMLNode {

    private name: string;
    contentSpec: string;

    constructor(name: string, contentSpec: string) {
        this.name = name;
        this.contentSpec = contentSpec;
    }

    getName(): string {
        return this.name;
    }

    getContentSpec(): string {
        return this.contentSpec;
    }
    
    getNodeType(): number {
        return Constants.ELEMENT_DECL_NODE;
    }

    toString(): string {
        return '<!ELEMENT ' + this.name + ' ' + this.contentSpec + '>';
    }

    equals(node: XMLNode): boolean {
        // TODO
        throw new Error("Method not implemented.");
    }
}