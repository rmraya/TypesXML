/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
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