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

export abstract class SchemaParticle {

    minOccurs: number;
    maxOccurs: number | 'unbounded';

    constructor(minOccurs: number = 1, maxOccurs: number | 'unbounded' = 1) {
        this.minOccurs = minOccurs;
        this.maxOccurs = maxOccurs;
    }

    abstract matchOnce(children: string[], pos: number): number[];

    matchRepeated(children: string[], startPos: number): number[] {
        const max: number = this.maxOccurs === 'unbounded' ? children.length + 1 : this.maxOccurs;
        let currentPositions: Set<number> = new Set<number>([startPos]);
        const results: Set<number> = new Set<number>();

        if (this.minOccurs === 0) {
            results.add(startPos);
        }

        for (let count: number = 1; count <= max; count++) {
            const nextPositions: Set<number> = new Set<number>();
            for (const pos of currentPositions) {
                const matched: number[] = this.matchOnce(children, pos);
                for (const p of matched) {
                    nextPositions.add(p);
                }
            }
            if (nextPositions.size === 0) {
                break;
            }
            if (count >= this.minOccurs) {
                for (const p of nextPositions) {
                    results.add(p);
                }
            }
            // Only carry positions that made forward progress to avoid
            // infinite loops when a particle can match zero children.
            const advancingPositions: Set<number> = new Set<number>();
            for (const p of nextPositions) {
                let isNew: boolean = true;
                for (const cp of currentPositions) {
                    if (cp === p) {
                        isNew = false;
                        break;
                    }
                }
                if (isNew) {
                    advancingPositions.add(p);
                }
            }
            if (advancingPositions.size === 0) {
                break;
            }
            currentPositions = advancingPositions;
        }

        return Array.from(results);
    }
}
