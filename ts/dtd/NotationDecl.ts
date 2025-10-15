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

    getName():string {
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
        let result = '<!NOTATION ' + this.name;
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