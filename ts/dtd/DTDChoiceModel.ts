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

import { XMLUtils } from '../XMLUtils';
import { DTDContentModel } from './DTDContentModel';
import { DTDElementNameParticle } from './DTDElementNameParticle';

export class DTDChoiceModel implements DTDContentModel {
    public cardinality: string = '';
    private choices: DTDContentModel[] = [];

    constructor(choices?: DTDContentModel[]) {
        if (choices) {
            this.choices = choices;
        }
    }

    getType(): string {
        return 'choice';
    }

    addChoice(choice: DTDContentModel) {
        this.choices.push(choice);
    }

    getChoices(): DTDContentModel[] {
        return this.choices;
    }

    validate(): boolean {
        // Cardinality must be '', '*', '+', or '?'
        if (this.cardinality && !['*', '+', '?'].includes(this.cardinality)) {
            return false;
        }
        // At least one choice required for valid model
        if (this.choices.length === 0) {
            return false;
        }
        // Validate each choice and its name if it's an element particle
        for (const choice of this.choices) {
            if (!choice.validate()) {
                return false;
            }
            // Only check name if choice is DTDElementNameParticle
            if (choice instanceof DTDElementNameParticle) {
                const name = choice.getName();
                if (name !== '#PCDATA' && !XMLUtils.isValidNCName(name)) {
                    return false;
                }
            }
        }
        return true;
    }

    toBNF(): string {
        let bnf = this.choices.map(choice => choice.toBNF()).join(' | ');
        return bnf + (this.cardinality ? this.cardinality : '');
    }
}
