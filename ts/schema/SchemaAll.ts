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

import { SchemaParticle } from './SchemaParticle.js';

export class SchemaAll extends SchemaParticle {

    particles: SchemaParticle[];

    constructor(particles: SchemaParticle[], minOccurs: number = 1, maxOccurs: number | 'unbounded' = 1) {
        super(minOccurs, maxOccurs);
        this.particles = particles;
    }

    matchOnce(children: string[], pos: number, nsMap?: Map<string, string>): number[] {
        const indices: number[] = [];
        for (let i: number = 0; i < this.particles.length; i++) {
            indices.push(i);
        }
        return this.matchRemaining(children, pos, indices, nsMap);
    }

    private matchRemaining(children: string[], pos: number, remaining: number[], nsMap?: Map<string, string>): number[] {
        const results: Set<number> = new Set<number>();

        // All remaining particles optional → current position is a valid end.
        let allOptional: boolean = true;
        for (let i: number = 0; i < remaining.length; i++) {
            if (this.particles[remaining[i]].minOccurs > 0) {
                allOptional = false;
                break;
            }
        }
        if (allOptional || remaining.length === 0) {
            results.add(pos);
        }

        if (pos >= children.length || remaining.length === 0) {
            return Array.from(results);
        }

        for (let i: number = 0; i < remaining.length; i++) {
            const idx: number = remaining[i];
            const particle: SchemaParticle = this.particles[idx];
            const matched: number[] = particle.matchRepeated(children, pos, nsMap);
            for (const nextPos of matched) {
                if (nextPos > pos) {
                    // Remove slot i from remaining and recurse.
                    const newRemaining: number[] = [];
                    for (let j: number = 0; j < remaining.length; j++) {
                        if (j !== i) {
                            newRemaining.push(remaining[j]);
                        }
                    }
                    const further: number[] = this.matchRemaining(children, nextPos, newRemaining, nsMap);
                    for (const p of further) {
                        results.add(p);
                    }
                }
            }
        }

        return Array.from(results);
    }
}
