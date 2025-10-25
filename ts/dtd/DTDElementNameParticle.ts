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

import { DTDContentModel } from './DTDContentModel';
import { XMLUtils } from '../XMLUtils';

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
        return !!this.name && XMLUtils.isValidNCName(this.name);
    }

    toBNF(): string {
        return this.name + (this.cardinality ? this.cardinality : '');
    }
}
