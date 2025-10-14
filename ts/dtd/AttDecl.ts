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

    isValid(value: string): boolean {
        // TODO: Implement validation
        return true;
    }
}