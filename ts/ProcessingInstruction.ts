/*******************************************************************************
 * Copyright (c) 2023-2026 Maxprograms.
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

export class ProcessingInstruction implements XMLNode {

    private target: string;
    private data: string;

    constructor(target: string, data: string) {
        this.target = target;
        this.data = data;
    }

    getTarget(): string {
        return this.target;
    }

    getData(): string {
        return this.data;
    }

    setData(data: string): void {
        this.data = data;
    }

    getNodeType(): number {
        return Constants.PROCESSING_INSTRUCTION_NODE;
    }

    toString(): string {
        return '<?' + this.target + ' ' + this.data + '?>';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof ProcessingInstruction) {
            return this.target === node.target && this.data === node.data;
        }
        return false;
    }

}