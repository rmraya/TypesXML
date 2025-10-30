/*******************************************************************************
 * Copyright (c) 2023-2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { Constants } from "./Constants";
import { XMLNode } from "./XMLNode";
import { XMLUtils } from "./XMLUtils";

export class XMLAttribute implements XMLNode {
    
    private name: string;
    private value: string;
    private specified: boolean;
    private lexicalValue?: string;

    constructor(name: string, value: string, specified: boolean = true, lexicalValue?: string) {
        this.name = name;
        this.value = value;
        this.specified = specified;
        this.lexicalValue = lexicalValue;
    }

    getName(): string {
        return this.name;
    }

    getValue(): string {
        return this.value;
    }

    setValue(value: string): void {
        this.value = value;
    }

    isSpecified(): boolean {
        return this.specified;
    }

    setSpecified(specified: boolean): void {
        this.specified = specified;
    }

    getLexicalValue(): string | undefined {
        return this.lexicalValue;
    }

    setLexicalValue(value: string | undefined): void {
        this.lexicalValue = value;
    }

    getNamespace(): string {
        if (this.name.indexOf(':') === -1) {
            return '';
        }
        return this.name.substring(0, this.name.indexOf(':'));
    }

    getNodeType(): number {
        return Constants.ATTRIBUTE_NODE;
    }

    toString(): string {
        return this.name + '="' + XMLUtils.unquote(XMLUtils.cleanString(this.value)) + '"';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof XMLAttribute) {
            return this.name === node.name && this.value === node.value;
        }
        return false;
    }

}