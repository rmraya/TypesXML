import { XMLNode } from "../XMLNode";

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

export class InternalSubset implements XMLNode {

    static readonly INTERNAL_SUBSET: number = 12;

    content: Array<XMLNode>;

    constructor(declaration: string) {
        this.content = new Array();
    }

    getNodeType(): number {
        return InternalSubset.INTERNAL_SUBSET;
    }

    toString(): string {
        let result: string = '[';
        this.content.forEach((value: XMLNode) => {
            result += value.toString();
        });
        return result + ']';
    }

    equals(obj: XMLNode): boolean {
        if (obj instanceof InternalSubset) {
            let node: InternalSubset = obj as InternalSubset;
            for (let i = 0; i < this.content.length; i++) {
                if (!this.content[i].equals(node.content[i])) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }
}