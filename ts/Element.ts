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

import { Attribute } from "./Attribute";
import { XMLNode } from "./XMLNode";

export class Element implements XMLNode {

    static readonly ELEMENT_NODE: number = 1;

    private name: string;
    private attributes: Map<string, Attribute>;
    private content: Array<XMLNode>;

    constructor(name: string) {
        this.name = name;
        this.attributes = new Map();
        this.content = new Array();
    }

    getName(): string {
        return this.name;
    }

    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }

    getAttribute(name: string): Attribute | null {
        if (this.attributes.has(name)) {
            return this.attributes.get(name);
        }
        return null;
    }

    setAttribute(attribute: Attribute) {
        this.attributes.set(attribute.getName(), attribute);
    }

    getAttributes(): Array<Attribute> {
        let result: Array<Attribute> = new Array();
        this.attributes.forEach(function (value, key) {
            result.push(value);
        });
        return result;
    }

    addContent(node: XMLNode): void {
        this.content.push(node);
    }

    getContent(): Array<XMLNode> {
        return this.content;
    }

    getNodeType(): number {
        return Element.ELEMENT_NODE;
    }

    toString(): string {
        // TODO
        throw new Error("Method not implemented.");
    }

    equals(node: Element): boolean {
        // TODO
        throw new Error("Method not implemented.");
    }

}