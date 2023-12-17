/*******************************************************************************
 * Copyright (c) 2023 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { AttDecl } from "../dtd/AttDecl";

export class ContentModel {
    
    private name: string;
    private attributes: Map<string, AttDecl>;   

    constructor(name: string, contentSpec: string) {
        this.name = name;
    }

    addAttributes(attributes: Map<string, AttDecl>) {
        this.attributes = attributes;
    }

    getAttributes(): Map<string, AttDecl> {
        return this.attributes;
    }

    toString(): string {
        return this.name;
    }
}