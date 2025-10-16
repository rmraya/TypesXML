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

import { DTDGrammar } from "./DTDGrammar";
import { Constants } from "../Constants";
import { XMLNode } from "../XMLNode";
import { DTDParser } from "./DTDParser";

export class InternalSubset implements XMLNode {

    declarationText: string;
    grammar: DTDGrammar;

    constructor(declaration: string) {
        this.declarationText = declaration;
        let parser:DTDParser = new DTDParser();
        this.grammar = parser.parseString(declaration.substring(1, declaration.length - 1));
    }

    getNodeType(): number {
        return Constants.INTERNAL_SUBSET_NODE;
    }

    toString(): string {
        return this.declarationText;
    }

    equals(node: XMLNode): boolean {
        if (node instanceof InternalSubset) {
            return this.declarationText === node.declarationText;
        }
        return false;
    }
}