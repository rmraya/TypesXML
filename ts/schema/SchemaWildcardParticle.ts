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
    private schemaTargetNamespace: string | undefined;

    constructor(
        namespace: string = '##any',
        processContents: 'strict' | 'lax' | 'skip' = 'strict',
        minOccurs: number = 1,
        maxOccurs: number | 'unbounded' = 1,
        schemaTargetNamespace?: string
    ) {
        super(minOccurs, maxOccurs);
        this.namespace = namespace;
        this.processContents = processContents;
        this.schemaTargetNamespace = schemaTargetNamespace;
    }

    matchOnce(children: string[], pos: number, nsMap?: Map<string, string>): number[] {
        if (pos >= children.length) {
            return [];
        }
        if (this.namespace === '##any') {
            return [pos + 1];
        }
        const childName: string = children[pos];
        const colonIdx: number = childName.indexOf(':');
        const prefix: string | undefined = colonIdx !== -1 ? childName.substring(0, colonIdx) : undefined;
        let childNs: string | undefined;
        if (prefix !== undefined) {
            childNs = nsMap ? nsMap.get(prefix) : undefined;
        } else {
            const defaultNs: string | undefined = nsMap ? nsMap.get('') : undefined;
            childNs = defaultNs !== '' ? defaultNs : undefined;
        }
        if (this.namespace === '##local') {
            return (childNs === undefined || childNs === '') ? [pos + 1] : [];
        }
        if (this.namespace === '##other') {
            const inTarget: boolean = this.schemaTargetNamespace !== undefined && childNs === this.schemaTargetNamespace;
            return (childNs !== undefined && childNs !== '' && !inTarget) ? [pos + 1] : [];
        }
        const tokens: string[] = this.namespace.split(/\s+/);
        for (const token of tokens) {
            if (token === '##local' && (childNs === undefined || childNs === '')) {
                return [pos + 1];
            }
            if (token === '##targetNamespace' && childNs !== undefined && childNs === this.schemaTargetNamespace) {
                return [pos + 1];
            }
            if (token === childNs) {
                return [pos + 1];
            }
        }
        return [];
    }
}
