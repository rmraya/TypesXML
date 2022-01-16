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

export class CData implements XMLNode {

    static readonly CDATA_SECTION_NODE: number = 3;

    private value: string;

    constructor(value: string) {
        this.value = value;
    }

    setValue(value: string) {
        this.value = value;
    }

    getValue(): string {
        return this.value;
    }

    getNodeType(): number {
        return CData.CDATA_SECTION_NODE;
    }

    toString(): string {
        return '<![CDATA[' + this.value + ']]>';
    }

    equals(obj: XMLNode): boolean {
        if (obj instanceof CData) {
            let node: CData = obj as CData;
            return this.value === node.value;
        }
        return false;
    }

}