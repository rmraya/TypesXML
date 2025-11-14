/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { Constants } from "./Constants";
import { XMLNode } from "./XMLNode";

export class XMLDocumentType implements XMLNode {

    private name: string;
    private systemId: string;
    private publicId: string;
    private internalSubset: string | undefined;

    constructor(name: string, publicId: string, systemId: string) {
        this.name = name;
        this.publicId = publicId;
        this.systemId = systemId;
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

    setInternalSubset(subset: string): void {
        this.internalSubset = subset;
    }

    getInternalSubset(): string | undefined {
        return this.internalSubset;
    }

    getNodeType(): number {
        return Constants.DOCUMENT_TYPE_NODE;
    }

    toString(): string {
        let doctype: string = '<!DOCTYPE ' + this.name;
        if (this.publicId && this.systemId) {
            doctype += ' PUBLIC "' + this.publicId + '" "' + this.systemId + '"';
        } else if (this.systemId) {
            doctype += ' SYSTEM "' + this.systemId + '"';
        } else if (this.publicId) {
            doctype += ' PUBLIC "' + this.publicId + '"';
        }
        if (this.internalSubset) {
            doctype += ' [' + this.internalSubset.toString() + ']';
        }
        return doctype + '>';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof DocumentType) {
            return this.publicId === node.publicId && this.systemId === node.systemId;
        }
        return false;
    }
}