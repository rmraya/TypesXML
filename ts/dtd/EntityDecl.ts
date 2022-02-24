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

import { XMLNode } from "../XMLNode";
import { XMLUtils } from "../XMLUtils";

export class EntityDecl implements XMLNode {

    static readonly ENTITY_DECL_NODE: number = 7;

    private name: string;
    private value: string;
    private type: string;

    constructor(declaration: string) {
        this.name = '';
        let i: number = '<!ENTITY'.length;
        let char: string = declaration.charAt(i);
        while (XMLUtils.isXmlSpace(char)) {
            i++;
            char = declaration.charAt(i);
        }
        while (!XMLUtils.isXmlSpace(char)) {
            this.name += char;
            i++;
            char = declaration.charAt(i);
        }
        if (declaration.indexOf('SYSTEM') !== -1) {
            this.type = 'SYSTEM';
            // TODO
        } else if (declaration.indexOf('PUBLIC') !== -1) {
            this.type = 'PUBLIC';
            // TODO
        } else {
            this.type = 'DEFAULT';
            let start: number = declaration.indexOf('"', i);
            let end: number = declaration.indexOf('"', start + 1);
            this.value = declaration.substring(start, end);
        }
    }

    getName(): string {
        return this.name;
    }

    getValue(): string {
        return this.value;
    }

    getNodeType(): number {
        return EntityDecl.ENTITY_DECL_NODE;
    }

    toString(): string {
        // TODO support SYTEM and PUBLIC
        return '<!ENTITY ' + this.name + ' "' + XMLUtils.unquote(XMLUtils.cleanString(this.value)) + '">'
    }

    equals(obj: XMLNode): boolean {
        if (obj instanceof EntityDecl) {
            let node = obj as EntityDecl;
            return this.name === node.name && this.type === node.type && this.value === node.value;
        }
        return false;
    }
}