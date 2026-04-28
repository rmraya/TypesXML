/*******************************************************************************
 * Copyright (c) 2023-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

export class SchemaValidationContext {
    public ids: Set<string>;
    public idrefs: Set<string>;
    public xsiNil: boolean;
    public xsiNilPresent: boolean;
    public xsiType: string | undefined;
    public instanceNamespaces: Map<string, string>;
    public wildcardMode: 'normal' | 'lax' | 'skip' | undefined;

    constructor() {
        this.ids = new Set<string>();
        this.idrefs = new Set<string>();
        this.xsiNil = false;
        this.xsiNilPresent = false;
        this.xsiType = undefined;
        this.instanceNamespaces = new Map<string, string>();
        this.wildcardMode = undefined;
    }
}
