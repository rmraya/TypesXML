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
import { SchemaAll } from './SchemaAll.js';
import { SchemaChoice } from './SchemaChoice.js';
import { SchemaParticle } from './SchemaParticle.js';
import { SchemaSequence } from './SchemaSequence.js';
import { SchemaWildcardParticle } from './SchemaWildcardParticle.js';

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

    findCoveringWildcard(childName: string, nsMap?: Map<string, string>): 'strict' | 'lax' | 'skip' | undefined {
        if (!this.rootParticle) {
            return undefined;
        }
        return SchemaContentModel.walkParticleForWildcard(this.rootParticle, childName, nsMap);
    }

    private static walkParticleForWildcard(
        particle: SchemaParticle,
        childName: string,
        nsMap?: Map<string, string>
    ): 'strict' | 'lax' | 'skip' | undefined {
        if (particle instanceof SchemaWildcardParticle) {
            const matched: number[] = particle.matchOnce([childName], 0, nsMap);
            if (matched.length > 0) {
                return particle.processContents;
            }
            return undefined;
        }
        if (particle instanceof SchemaSequence || particle instanceof SchemaChoice || particle instanceof SchemaAll) {
            for (const child of particle.particles) {
                const result: 'strict' | 'lax' | 'skip' | undefined = SchemaContentModel.walkParticleForWildcard(child, childName, nsMap);
                if (result !== undefined) {
                    return result;
                }
            }
        }
        return undefined;
    }

    validateChildren(elementName: string, children: string[], nsMap?: Map<string, string>): ValidationResult {
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
        const positions: number[] = this.rootParticle.matchRepeated(children, 0, nsMap);
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
