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
                const name: string = choice.getName();
                if (name !== '#PCDATA' && !XMLUtils.isValidXMLName(name)) {
                    return false;
                }
            }
        }
        return true;
    }

    toBNF(): string {
        let bnf: string = this.choices.map(choice => choice.toBNF()).join(' | ');
        return bnf + (this.cardinality ? this.cardinality : '');
    }
}
