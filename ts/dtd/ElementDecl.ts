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
        if (node instanceof ElementDecl) {
            return this.name === node.name && 
                   this.contentSpec === node.contentSpec;
        }
        return false;
    }
}