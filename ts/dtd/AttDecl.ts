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

export class AttDecl implements XMLNode {

    private name: string;
    private type: string;
    private defaultType: string;
    private defaultValue: string;

    constructor() {
        // TODO
    }

    getNodeType(): number {
        return Constants.ATTRIBUTE_DECL_NODE;
    }

    equals(node: XMLNode): boolean {
        // TODO
        throw new Error("Method not implemented.");
    }

    toString(): string {
        // TODO
        return this.name;
    }
}