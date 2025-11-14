/*******************************************************************************
 * Copyright (c) 2023-2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { Constants } from "../Constants";
import { XMLNode } from "../XMLNode";
import { DTDContentModel } from "./DTDContentModel";
import { DTDContentModelParser } from "./DTDContentModelParser";

export class ElementDecl implements XMLNode {

    private name: string;
    contentSpec: string;

    constructor(name: string, contentSpec: string) {
        this.name = name;
        this.contentSpec = contentSpec;
        this.validateContentSpec();
    }

    validateContentSpec() {
        const validSpecs: string[] = ['EMPTY', 'ANY'];
        if (validSpecs.includes(this.contentSpec)) {
            return;
        }
        // Build and validate the content model using the complete parser
        let simplified: string = this.contentSpec.replaceAll(/\r?\n/g, ' ');
        simplified = simplified.replaceAll(/\s+/g, '').trim();
        const parser: DTDContentModelParser = new DTDContentModelParser(simplified);
        const model: DTDContentModel = parser.parse();
        if (!model.validate()) {
            throw new Error('Invalid content specification: ' + simplified);
        }
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