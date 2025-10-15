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
import { ContentParticle, ContentParticleType } from "./contentParticle";

export class DTDPCData implements ContentParticle {

    getType(): (typeof ContentParticleType)[keyof typeof ContentParticleType] {
        return ContentParticleType.PCDATA;
    }

    addParticle(particle: ContentParticle): void {
        // do nothing
    }

    setCardinality(cardinality: (typeof Cardinality)[keyof typeof Cardinality]): void {
        // do nothing
    }

    getCardinality(): (typeof Cardinality)[keyof typeof Cardinality] {
        return Cardinality.NONE;
    }

    getParticles(): Array<ContentParticle> {
        return new Array<ContentParticle>();
    }

    getChildren(): Set<string> {
        return new Set<string>();
    }

    toString(): string {
        return "#PCDATA";
    }
}