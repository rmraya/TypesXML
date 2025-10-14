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

export class ProcessingInstruction implements XMLNode {

    private target: string;
    private data: string;

    constructor(target: string, data: string) {
        this.target = target;
        this.data = data;
    }

    getTarget(): string {
        return this.target;
    }

    getData(): string {
        return this.data;
    }

    setData(data: string): void {
        this.data = data;
    }

    getNodeType(): number {
        return Constants.PROCESSING_INSTRUCTION_NODE;
    }

    toString(): string {
        return '<?' + this.target + ' ' + this.data + '?>';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof ProcessingInstruction) {
            return this.target === node.target && this.data === node.data;
        }
        return false;
    }

}