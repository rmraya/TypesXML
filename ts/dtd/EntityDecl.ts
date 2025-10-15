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

export class EntityDecl implements XMLNode {

    private name: string;
    private parameterEntity: boolean;
    private value: string; systemId: string;
    private publicId: string;
    private ndata: string;

    constructor(name: string, parameterEntity: boolean, value: string, systemId: string, publicId: string, ndata: string) {
        // parameterEntities are only used in DTDs
        this.name = name;
        this.parameterEntity = parameterEntity;
        this.value = value;
        this.systemId = systemId;
        this.publicId = publicId;
        this.ndata = ndata;
    }

    getName(): string {
        return this.name;
    }

    getValue(): string {
        return this.value;
    }

    getSystemId(): string {
        return this.systemId;
    }

    getPublicId(): string {
        return this.publicId;
    }

    getNodeType(): number {
        return Constants.ENTITY_DECL_NODE;
    }

    toString(): string {
        let result: string = '<!ENTITY ' + (this.parameterEntity ? '% ' : '') + this.name;
        if (this.publicId !== '' && this.systemId !== '') {
            result += ' PUBLIC "' + this.publicId + '" "' + this.systemId + '">';
        } else if (this.systemId !== '') {
            result += ' SYSTEM "' + this.systemId + '">';
        } else {
            result += ' "' + this.value + '">';
        }
        return result;
    }

    equals(node: XMLNode): boolean {
        if (node instanceof EntityDecl) {
            return this.name === node.name && 
                   this.parameterEntity === node.parameterEntity &&
                   this.value === node.value &&
                   this.systemId === node.systemId &&
                   this.publicId === node.publicId &&
                   this.ndata === node.ndata;
        }
        return false;
    }
}