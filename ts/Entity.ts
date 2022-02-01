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

import { XMLNode } from "./XMLNode";
import { XMLUtils } from "./XMLUtils";

export class Entity implements XMLNode {

    static readonly ENTITY_NODE: number = 6;

    private name: string;
    private value: string;

    constructor(name: string, value: string) {
        this.name = name;
        this.value = value;
    }

    getName(): string {
        return this.name;
    }

    getValue(): string {
        return this.value;
    }

    getNodeType(): number {
        return Entity.ENTITY_NODE;
    }

    toString(): string {
        return '<!ENTITY ' + this.name + ' "' + XMLUtils.unquote(XMLUtils.cleanString(this.value)) + '">'
    }

    equals(obj: XMLNode): boolean {
        if (obj instanceof Entity) {
            let node = obj as Entity;
            return this.name === node.name && this.value === node.value;
        }
        return false;
    }
}