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

export class SchemaElementParticle extends SchemaParticle {

    name: string;
    private additionalNames: Set<string>;

    constructor(name: string, minOccurs: number = 1, maxOccurs: number | 'unbounded' = 1, additionalNames?: Set<string>) {
        super(minOccurs, maxOccurs);
        this.name = name;
        this.additionalNames = additionalNames !== undefined ? additionalNames : new Set<string>();
    }

    matchOnce(children: string[], pos: number): number[] {
        if (pos >= children.length) {
            return [];
        }
        const childName: string = children[pos];
        if (childName === this.name) {
            return [pos + 1];
        }
        // Compare by local name, ignoring any namespace prefix on either side.
        const particleColon: number = this.name.indexOf(':');
        const childColon: number = childName.indexOf(':');
        const particleLocal: string = particleColon !== -1 ? this.name.substring(particleColon + 1) : this.name;
        const childLocal: string = childColon !== -1 ? childName.substring(childColon + 1) : childName;
        if (particleLocal === childLocal) {
            return [pos + 1];
        }
        // Check substitution group members.
        for (const altName of this.additionalNames) {
            const altColon: number = altName.indexOf(':');
            const altLocal: string = altColon !== -1 ? altName.substring(altColon + 1) : altName;
            if (childLocal === altLocal) {
                return [pos + 1];
            }
        }
        return [];
    }
}
