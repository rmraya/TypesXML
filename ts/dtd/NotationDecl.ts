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

import { Constants } from "../Constants";
import { XMLNode } from "../XMLNode";

export class NotationDecl implements XMLNode {

    private name: string;
    private publicId: string;
    private systemId: string;

    constructor(name: string, publicId: string, systemId: string) {
        this.name = name;
        this.publicId = publicId;
        this.systemId = systemId;
    }

    getName(): string {
        return this.name;
    }

    getPublicId(): string {
        return this.publicId;
    }

    getSystemId(): string {
        return this.systemId;
    }

    getNodeType(): number {
        return Constants.NOTATION_DECL_NODE;
    }

    toString(): string {
        let result: string = '<!NOTATION ' + this.name;
        if (this.publicId && this.publicId.length > 0) {
            result += ' PUBLIC "' + this.publicId + '"';
        }
        if (this.systemId && this.systemId.length > 0) {
            if (this.publicId && this.publicId.length > 0) {
                result += ' "' + this.systemId + '"';
            } else {
                result += ' SYSTEM "' + this.systemId + '"';
            }
        }
        result += '>';
        return result;
    }

    equals(node: XMLNode): boolean {
        if (node instanceof NotationDecl) {
            return this.name === node.name &&
                this.publicId === node.publicId &&
                this.systemId === node.systemId;
        }
        return false;
    }

}