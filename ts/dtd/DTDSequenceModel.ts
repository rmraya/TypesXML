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

import { XMLUtils } from '../XMLUtils';
import { DTDContentModel } from './DTDContentModel';
import { DTDElementNameParticle } from './DTDElementNameParticle';

export class DTDSequenceModel implements DTDContentModel {

    public cardinality: string = '';
    private children: DTDContentModel[] = [];

    constructor(children?: DTDContentModel[]) {
        if (children) this.children = children;
    }

    getType(): string {
        return 'sequence';
    }

    addChild(child: DTDContentModel) {
        this.children.push(child);
    }

    getChildren(): DTDContentModel[] {
        return this.children;
    }

    validate(): boolean {
        // Cardinality must be '', '*', '+', or '?'
        if (this.cardinality && !['*', '+', '?'].includes(this.cardinality)) {
            return false;
        }
        // At least one child required for valid model
        if (this.children.length === 0) {
            return false;
        }
        // Validate each child and its name if it's an element particle
        for (const child of this.children) {
            if (!child.validate()) {
                return false;
            }
            // Only check name if child is DTDElementNameParticle
            if (child instanceof DTDElementNameParticle) {
                if (!XMLUtils.isValidXMLName(child.getName())) {
                    return false;
                }
            }
        }
        return true;
    }

    toBNF(): string {
        let bnf: string = this.children.map(child => child.toBNF()).join(', ');
        return bnf + (this.cardinality ? this.cardinality : '');
    }
}
