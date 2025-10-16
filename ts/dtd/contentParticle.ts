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
