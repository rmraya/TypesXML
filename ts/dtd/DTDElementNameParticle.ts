/*******************************************************************************
 * Copyright (c) 2023-2026 Maxprograms.
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

export class DTDElementNameParticle implements DTDContentModel {

    private name: string;
    private cardinality: string = '';

    constructor(name: string, cardinality?: string) {
        this.name = name;
        if (cardinality) this.cardinality = cardinality;
    }

    getType(): string {
        return 'element';
    }

    getName(): string {
        return this.name;
    }

    getCardinality(): string {
        return this.cardinality;
    }

    validate(): boolean {
        // Cardinality must be '', '*', '+', or '?'
        if (this.cardinality && !['*', '+', '?'].includes(this.cardinality)) {
            return false;
        }
        // #PCDATA is always valid for mixed content
        if (this.name === '#PCDATA') {
            return true;
        }
        // Name must be non-empty and valid NCName
        return !!this.name && XMLUtils.isValidXMLName(this.name);
    }

    toBNF(): string {
        return this.name + (this.cardinality ? this.cardinality : '');
    }
}
