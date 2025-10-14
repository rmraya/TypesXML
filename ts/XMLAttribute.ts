/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
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