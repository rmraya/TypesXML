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

import { Constants } from "./Constants";
import { XMLNode } from "./XMLNode";

export class XMLComment implements XMLNode {

    private value: string;

    constructor(comment: string) {
        if (comment.startsWith('<!--') && comment.endsWith('-->')) {
            comment = comment.substring('<!--'.length, comment.length - '-->'.length);
        }
        this.value = comment;
    }

    setValue(value: string) {
        this.value = value;
    }

    getValue(): string {
        return this.value;
    }

    getNodeType(): number {
        return Constants.COMMENT_NODE;
    }

    toString(): string {
        return '<!-- ' + this.value + ' -->';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof XMLComment) {
            return this.value === node.value;
        }
        return false;
    }

}