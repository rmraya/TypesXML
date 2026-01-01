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
        // TODO: implement if needed
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
