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
import { DTDElementNameParticle } from './DTDElementNameParticle';
import { XMLUtils } from '../XMLUtils';

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
                if (!XMLUtils.isValidNCName(child.getName())) {
                    return false;
                }
            }
        }
        return true;
    }

    toBNF(): string {
        let bnf = this.children.map(child => child.toBNF()).join(', ');
        return bnf + (this.cardinality ? this.cardinality : '');
    }
}
