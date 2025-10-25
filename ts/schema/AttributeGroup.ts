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

import { SchemaAttributeDecl } from "./Attribute";

export class AttributeGroup {
    private name: string;
    private attributes: Map<string, SchemaAttributeDecl> = new Map();
    private attributeGroupRefs: string[] = [];
    private targetNamespace?: string;

    constructor(name: string, targetNamespace?: string) {
        this.name = name;
        this.targetNamespace = targetNamespace;
    }

    getName(): string {
        return this.name;
    }

    setName(name: string): void {
        this.name = name;
    }

    getTargetNamespace(): string | undefined {
        return this.targetNamespace;
    }

    setTargetNamespace(namespace: string): void {
        this.targetNamespace = namespace;
    }

    addAttribute(attribute: SchemaAttributeDecl): void {
        this.attributes.set(attribute.getName(), attribute);
    }

    getAttribute(name: string): SchemaAttributeDecl | undefined {
        return this.attributes.get(name);
    }

    getAttributes(): Map<string, SchemaAttributeDecl> {
        return new Map(this.attributes);
    }

    addAttributeGroupRef(ref: string): void {
        this.attributeGroupRefs.push(ref);
    }

    getAttributeGroupRefs(): string[] {
        return [...this.attributeGroupRefs];
    }

    removeAttribute(name: string): boolean {
        return this.attributes.delete(name);
    }

    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }

    getAttributeCount(): number {
        return this.attributes.size;
    }

    clear(): void {
        this.attributes.clear();
        this.attributeGroupRefs.length = 0;
    }

    toString(): string {
        const ns = this.targetNamespace ? `{${this.targetNamespace}}` : '';
        return `AttributeGroup[${ns}${this.name}]`;
    }
}