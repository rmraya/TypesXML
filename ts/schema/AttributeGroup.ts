/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
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