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

export class DTDName implements ContentParticle {

    private name: string;
    private cardinality: typeof Cardinality[keyof typeof Cardinality];

    constructor(name: string) {
        this.name = name;
        this.cardinality = Cardinality.NONE;
    }

    getName(): string {
        return this.name;
    }

    getType(): typeof ContentParticleType[keyof typeof ContentParticleType] {
        return ContentParticleType.NAME;
    }

    public addParticle(particle: ContentParticle) {
        // Do nothing
    }

    getParticles(): Array<ContentParticle> {
        let result: Array<ContentParticle> = new Array<ContentParticle>();
        result.push(this);
        return result;
    }

    getChildren(): Set<string> {
        const children = new Set<string>();
        children.add(this.name);
        return children;
    }

    getCardinality(): typeof Cardinality[keyof typeof Cardinality] {
        return this.cardinality;
    }

    setCardinality(cardinality: typeof Cardinality[keyof typeof Cardinality]) {
        this.cardinality = cardinality;
    }

    toString() {
        switch (this.cardinality) {
            case Cardinality.NONE:
                return this.name;
            case Cardinality.OPTIONAL:
                return this.name + '?';
            case Cardinality.ONEMANY:
                return this.name + '+';
            case Cardinality.ZEROMANY:
                return this.name + '*';
            default:
                // ignore
                return '';
        }
    }
}
