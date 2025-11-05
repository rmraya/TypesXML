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

import { Cardinality } from "./ContentModel";
import { ContentParticle, ContentParticleType } from "./contentParticle";
import { DTDChoice } from "./dtdChoice";
import { DTDName } from "./dtdName";

export class DTDSecuence implements ContentParticle {

    private cardinality: typeof Cardinality[keyof typeof Cardinality];
    private content: Array<ContentParticle>;

    constructor() {
        this.content = new Array<ContentParticle>();
        this.cardinality = Cardinality.NONE;
    }

    public addParticle(particle: ContentParticle) {
        this.content.push(particle);
    }

    getType(): typeof ContentParticleType[keyof typeof ContentParticleType] {
        return ContentParticleType.SEQUENCE;
    }

    setCardinality(cardinality: typeof Cardinality[keyof typeof Cardinality]) {
        this.cardinality = cardinality;
    }

    getCardinality(): typeof Cardinality[keyof typeof Cardinality] {
        return this.cardinality;
    }

    toString() {
        let sb: string = '(';
        for (let i: number = 0; i < this.content.length; i++) {
            let particle = this.content[i];
            sb = sb + particle.toString();
            if (i < this.content.length - 1) {
                sb = sb + ',';
            }
        }
        sb = sb + ')';
        switch (this.cardinality) {
            case Cardinality.NONE:
                return sb.toString();
            case Cardinality.OPTIONAL:
                return sb + "?";
            case Cardinality.ONEMANY:
                return sb + "+";
            case Cardinality.ZEROMANY:
                return sb + "*";
            default:
            // ignore
        }
        return sb.toString();
    }

    getParticles(): Array<ContentParticle> {
        return this.content;
    }

    getChildren(): Set<string> {
        const children: Set<string> = new Set<string>();
        for (const particle of this.content) {
            if (particle instanceof DTDName) {
                children.add(particle.getName());
            }
            if (particle instanceof DTDChoice) {
                let choice = particle as DTDChoice;
                // add all the children of the choice
                for (const child of choice.getChildren()) {
                    children.add(child);
                }
            }
            if (particle instanceof DTDSecuence) {
                let sequence = particle as DTDSecuence;
                // add all the children of the sequence
                for (const child of sequence.getChildren()) {
                    children.add(child);
                }
            }
        }
        return children;
    }
}
