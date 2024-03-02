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

import { Constants } from "./Constants";
import { XMLNode } from "./XMLNode";
import { XMLUtils } from "./XMLUtils";

export class XMLAttribute implements XMLNode {
    
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
        return Constants.ATTRIBUTE_NODE;
    }

    toString(): string {
        return this.name + '="' + XMLUtils.unquote(XMLUtils.cleanString(this.value)) + '"';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof XMLAttribute) {
            return this.name === node.name && this.value === node.value;
        }
        return false;
    }

}