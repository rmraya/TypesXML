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

export class Attribute implements XMLNode {

    static readonly ATTRIBUTE_NODE = 2;

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

    setvalue(value: string): void {
        this.value = value;
    }

    getNamespace(): string {
        if (this.name.indexOf(':') === -1) {
            return '';
        }
        return this.name.substring(0, this.name.indexOf(':'));
    }

    getNodeType(): number {
        return Attribute.ATTRIBUTE_NODE;
    }

    toString(): string {
        return this.name + '="' + XMLUtils.unquote(XMLUtils.cleanString(this.value)) + '"';
    }

    equals(node: Attribute): boolean {
        return this.name === node.name && this.value === node.value;
    }

}