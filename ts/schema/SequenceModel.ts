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

import { ValidationResult } from '../grammar/Grammar';
import { ContentModel } from './ContentModel';
import { ValidationParticle } from './ValidationParticle';
import { SequenceParticle } from './SequenceParticle';
import { ValidationContext } from './Model';

export class SequenceModel extends ContentModel {
    private particles: ContentModel[] = [];
    
    constructor(minOccurs?: number, maxOccurs?: number) {
        super(minOccurs, maxOccurs);
    }
    
    addParticle(particle: ContentModel): void {
        this.particles.push(particle);
    }
    
    getParticles(): ContentModel[] {
        return this.particles;
    }
    
    getType(): string {
        return 'sequence';
    }
    
    validate(children: string[], context?: ValidationContext): ValidationResult {
        const particle = this.toParticle(context);
        try {
            particle.resolve();
            particle.validate(children);
            return ValidationResult.success();
        } catch (error) {
            return ValidationResult.error((error as Error).message);
        }
    }

    toParticle(context?: ValidationContext): ValidationParticle {
        const sequence = new SequenceParticle();
        sequence.setCardinality(this.minOccurs, this.maxOccurs);
        for (const particle of this.particles) {
            sequence.addComponent(particle.toParticle(context));
        }
        return sequence;
    }

    canAccept(element: string, position: number, children: string[]): boolean {
        for (const particle of this.particles) {
            if (particle.canAccept(element, position, children)) {
                return true;
            }
        }
        return false;
    }
    
    getPossibleElements(position: number, children: string[]): string[] {
        const possible: string[] = [];
        for (const particle of this.particles) {
            possible.push(...particle.getPossibleElements(position, children));
        }
        return possible;
    }
}