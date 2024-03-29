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

export class NotationDecl implements XMLNode {
  
    private name: string;
    private publicId: string;
    private systemId: string;

    constructor(name: string, publicId: string, systemId: string) {
        this.name = name;
        this.publicId = publicId;
        this.systemId = systemId;
    }

    getName():string {
        return this.name;
    }

    getNodeType(): number {
        return Constants.NOTATION_DECL_NODE;
    }

    toString(): string {
        // TODO
        throw new Error("Method not implemented.");
    }

    equals(node: XMLNode): boolean {
        // TODO
        throw new Error("Method not implemented.");
    }

}