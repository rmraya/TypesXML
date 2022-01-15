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

export class ProcessingInstruction implements XMLNode {

    static readonly PROCESSING_INSTRUCTION_NODE: number = 5;

    private target: string;
    private value: string;

    constructor(target: string, value: string) {
        this.target = target;
        this.value = value;
    }

    getTarget(): string {
        return this.target;
    }

    getValue(): string {
        return this.value;
    }

    setValue(value: string): void {
        this.value = value;
    }

    getNodeType(): number {
        return ProcessingInstruction.PROCESSING_INSTRUCTION_NODE;
    }

    toString(): string {
        return '<?' + this.target + ' ' + this.value + '?>';
    }

    equals(obj: XMLNode): boolean {
        if (obj instanceof ProcessingInstruction) {
            let node: ProcessingInstruction = obj as ProcessingInstruction;
            return this.target === node.target && this.value === node.value;
        }
        return false;
    }

}