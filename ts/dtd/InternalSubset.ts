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

import { Grammar } from "../grammar/Grammar";
import { Constants } from "../Constants";
import { XMLNode } from "../XMLNode";
import { DTDParser } from "./DTDParser";

export class InternalSubset implements XMLNode {

    declarationText: string;
    grammar: Grammar;

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
        // TODO Auto-generated method stub
        return false;
    }
}