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

export class SchemaWildcardParticle extends SchemaParticle {

    namespace: string;
    processContents: 'strict' | 'lax' | 'skip';

    constructor(
        namespace: string = '##any',
        processContents: 'strict' | 'lax' | 'skip' = 'strict',
        minOccurs: number = 1,
        maxOccurs: number | 'unbounded' = 1
    ) {
        super(minOccurs, maxOccurs);
        this.namespace = namespace;
        this.processContents = processContents;
    }

    matchOnce(children: string[], pos: number): number[] {
        if (pos >= children.length) {
            return [];
        }
        return [pos + 1];
    }
}
