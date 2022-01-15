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

export class Comment implements XMLNode {

    static readonly COMMENT_NODE: number = 4;

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
        return Comment.COMMENT_NODE;
    }

    toString(): string {
        return '<!-- ' + this.value + ' -->';
    }

    equals(obj: XMLNode): boolean {
        if (obj instanceof Comment) {
            let node: Comment = obj as Comment;
            return this.value === node.value;
        }
        return false;
    }

}