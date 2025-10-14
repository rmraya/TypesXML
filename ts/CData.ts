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

export class CData implements XMLNode {

    private value: string;

    constructor(value: string) {
        this.value = value;
    }

    setValue(value: string) {
        this.value = value;
    }

    getValue(): string {
        return this.value;
    }

    getNodeType(): number {
        return Constants.CDATA_SECTION_NODE;
    }

    toString(): string {
        return '<![CDATA[' + this.value + ']]>';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof CData) {
            return this.value === node.value;
        }
        return false;
    }

}