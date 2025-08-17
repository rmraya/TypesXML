/*******************************************************************************
 * Copyright (c) 2023 - 2024 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
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
        // TODO
        return false;
    }
}