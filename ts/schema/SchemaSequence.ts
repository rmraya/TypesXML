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

export class SchemaSequence extends SchemaParticle {

    particles: SchemaParticle[];

    constructor(particles: SchemaParticle[], minOccurs: number = 1, maxOccurs: number | 'unbounded' = 1) {
        super(minOccurs, maxOccurs);
        this.particles = particles;
    }

    matchOnce(children: string[], pos: number, nsMap?: Map<string, string>): number[] {
        let positions: Set<number> = new Set<number>([pos]);
        for (const particle of this.particles) {
            const nextPositions: Set<number> = new Set<number>();
            for (const p of positions) {
                const matched: number[] = particle.matchRepeated(children, p, nsMap);
                for (const m of matched) {
                    nextPositions.add(m);
                }
            }
            positions = nextPositions;
            if (positions.size === 0) {
                break;
            }
        }
        return Array.from(positions);
    }
}
