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

import { ValidationResult } from '../grammar/Grammar.js';
import { SchemaParticle } from './SchemaParticle.js';

export enum SchemaContentModelType {
    EMPTY = 'EMPTY',
    ANY = 'ANY',
    MIXED = 'MIXED',
    ELEMENT = 'ELEMENT'
}

export class SchemaContentModel {

    private type: SchemaContentModelType;
    private rootParticle: SchemaParticle | undefined;

    constructor(type: SchemaContentModelType, rootParticle?: SchemaParticle) {
        this.type = type;
        this.rootParticle = rootParticle;
    }

    getType(): SchemaContentModelType {
        return this.type;
    }

    getRootParticle(): SchemaParticle | undefined {
        return this.rootParticle;
    }

    static empty(): SchemaContentModel {
        return new SchemaContentModel(SchemaContentModelType.EMPTY);
    }

    static any(): SchemaContentModel {
        return new SchemaContentModel(SchemaContentModelType.ANY);
    }

    static mixed(rootParticle?: SchemaParticle): SchemaContentModel {
        return new SchemaContentModel(SchemaContentModelType.MIXED, rootParticle);
    }

    static element(rootParticle: SchemaParticle): SchemaContentModel {
        return new SchemaContentModel(SchemaContentModelType.ELEMENT, rootParticle);
    }

    validateChildren(elementName: string, children: string[]): ValidationResult {
        if (this.type === SchemaContentModelType.EMPTY) {
            if (children.length > 0) {
                return ValidationResult.error(
                    'Element "' + elementName + '" must be empty but contains child elements: ' + children.join(', ')
                );
            }
            return ValidationResult.success();
        }

        if (this.type === SchemaContentModelType.ANY) {
            return ValidationResult.success();
        }

        // MIXED: child elements must conform to the declared particle when one exists.
        // If no particle is present, any children are allowed.
        if (this.type === SchemaContentModelType.MIXED) {
            if (!this.rootParticle || children.length === 0) {
                return ValidationResult.success();
            }
        }

        if (!this.rootParticle) {
            // ELEMENT type with no particle — treat as EMPTY.
            if (children.length > 0) {
                return ValidationResult.error(
                    'Element "' + elementName + '" has no content model but contains child elements: ' + children.join(', ')
                );
            }
            return ValidationResult.success();
        }

        // Run the NFA: success when the root particle's matchRepeated can reach
        // exactly children.length (all children consumed).
        const positions: number[] = this.rootParticle.matchRepeated(children, 0);
        for (const p of positions) {
            if (p === children.length) {
                return ValidationResult.success();
            }
        }

        return ValidationResult.error(
            'Element "' + elementName + '" has an invalid child element sequence. ' +
            'Children found: [' + children.join(', ') + ']'
        );
    }
}
