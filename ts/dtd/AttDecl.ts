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

export class AttDecl implements XMLNode {

    private name: string;
    private attType: string;
    private defaultDecl: string;
    private defaultValue: string;

    constructor(name: string, attType: string, defaultDecl: string, defaultValue: string) {
        this.name = name;
        this.attType = attType;
        this.defaultDecl = defaultDecl;
        this.defaultValue = defaultValue;
    }

    getNodeType(): number {
        return Constants.ATTRIBUTE_DECL_NODE;
    }

    equals(node: XMLNode): boolean {
        if (node instanceof AttDecl) {
            return this.name === node.name && this.attType === node.attType && this.defaultDecl === node.defaultDecl && this.defaultValue === node.defaultValue;
        }
        return false;
    }

    toString(): string {
        return (this.name + ' ' + this.attType + ' ' + this.defaultDecl + ' ' + this.defaultValue).trim();
    }
}