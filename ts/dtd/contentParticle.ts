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

import { Cardinality } from "./ContentModel";

export const ContentParticleType = {
    PCDATA: 0,
    NAME: 1,
    SEQUENCE: 2,
    CHOICE: 3
} as const;

export interface ContentParticle {

    getType(): typeof ContentParticleType[keyof typeof ContentParticleType];

    addParticle(particle: ContentParticle): void;

    setCardinality(cardinality: typeof Cardinality[keyof typeof Cardinality]): void;

    getCardinality(): typeof Cardinality[keyof typeof Cardinality];

    getParticles(): Array<ContentParticle>;

    getChildren(): Set<string>;

    toString(): string;
}
