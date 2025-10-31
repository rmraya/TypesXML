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

import { XMLUtils } from "../XMLUtils";
import { Cardinality } from "./ContentModel";
import { ContentParticle, ContentParticleType } from "./contentParticle";

export class DTDPCData implements ContentParticle {

    getType(): (typeof ContentParticleType)[keyof typeof ContentParticleType] {
        return ContentParticleType.PCDATA;
    }

    addParticle(particle: ContentParticle): void {
        XMLUtils.ignoreUnused(particle);
    }

    setCardinality(cardinality: (typeof Cardinality)[keyof typeof Cardinality]): void {
        XMLUtils.ignoreUnused(cardinality);
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