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
import { XMLUtils } from "./XMLUtils";

export class ProcessingInstruction implements XMLNode {

    private target: string;
    private value: string;

    constructor(declaration: string) {
        let target: string = '';
        let i: number = '<?'.length;
        for (; i < declaration.length; i++) {
            let char: string = declaration[i];
            if (XMLUtils.isXmlSpace(char)) {
                break;
            }
            target += char;
        }
        for (; i < declaration.length; i++) {
            let char: string = declaration[i];
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        let value: string = declaration.substring(i, declaration.indexOf('?>'));
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
        return Constants.PROCESSING_INSTRUCTION_NODE;
    }

    toString(): string {
        return '<?' + this.target + ' ' + this.value + '?>';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof ProcessingInstruction) {
            return this.target === node.target && this.value === node.value;
        }
        return false;
    }

}