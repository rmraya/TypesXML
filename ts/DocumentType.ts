/*******************************************************************************
 * Copyright (c) 2022 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { XMLNode } from "./XMLNode";

export class DocumentType implements XMLNode {

    static readonly DOCUMENT_TYPE_NODE: number = 10;

    private name: string;
    private systemId: string;
    private publicId: string;

    constructor(name: string) {
        this.name = name;
    }

    setSystemId(systemId: string): void {
        this.systemId = systemId;
    }

    getSystemId(): string {
        return this.systemId;
    }

    setPublicId(publicId: string): void {
        this.publicId = publicId;
    }

    getPublicId(): string {
        return this.publicId;
    }

    getNodeType(): number {
        return DocumentType.DOCUMENT_TYPE_NODE;
    }

    toString(): string {
        let doctype: string = '<!DOCTYPE ' + this.name;
        if (this.publicId && this.systemId) {
            doctype += ' PUBLIC "' + this.publicId + '" "' + this.systemId + '"';
        } else if (this.systemId) {
            doctype += ' SYSTEM "' + this.systemId + '"';
        }
        return doctype + '>';
    }

    equals(obj: XMLNode): boolean {
        if (obj instanceof DocumentType) {
            let node = obj as DocumentType;
            return this.publicId === node.publicId && this.systemId === node.systemId;
        }
        return false;
    }
}