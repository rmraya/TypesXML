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

export enum RelaxNGPatternType {
    ELEMENT = 'element',
    ATTRIBUTE = 'attribute',
    CHOICE = 'choice',
    GROUP = 'group',
    INTERLEAVE = 'interleave',
    OPTIONAL = 'optional',
    ZERO_OR_MORE = 'zeroOrMore',
    ONE_OR_MORE = 'oneOrMore',
    LIST = 'list',
    MIXED = 'mixed',
    TEXT = 'text',
    EMPTY = 'empty',
    NOT_ALLOWED = 'notAllowed',
    VALUE = 'value',
    DATA = 'data',
    REF = 'ref',
    GRAMMAR = 'grammar',
    START = 'start',
    DEFINE = 'define',
    INCLUDE = 'include',
    DIV = 'div',
    PARAM = 'param',
    EXCEPT = 'except',
    EXTERNAL_REF = 'externalRef',
    PARENT_REF = 'parentRef',
    NAME = 'name',
    NS_NAME = 'nsName',
    ANY_NAME = 'anyName'
}

export class RelaxNGPattern {
    private type: RelaxNGPatternType;
    private name?: string;
    private namespace?: string;
    private children: RelaxNGPattern[] = [];
    private parent?: RelaxNGPattern;
    private attributes: Map<string, string> = new Map();
    private datatype?: string;
    private datatypeLibrary?: string;
    private value?: string;
    private refName?: string;
    private combine?: string; // for define elements: 'choice' or 'interleave'
    private href?: string; // for externalRef and include
    private ns?: string; // for nsName pattern
    private textContent?: string; // for text content of elements

    constructor(type: RelaxNGPatternType) {
        this.type = type;
    }

    getType(): RelaxNGPatternType {
        return this.type;
    }

    setName(name: string): void {
        this.name = name;
    }

    getName(): string | undefined {
        return this.name;
    }

    setNamespace(namespace: string): void {
        this.namespace = namespace;
    }

    getNamespace(): string | undefined {
        return this.namespace;
    }

    addChild(child: RelaxNGPattern): void {
        child.parent = this;
        this.children.push(child);
    }

    removeChild(child: RelaxNGPattern): void {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children[index].parent = undefined;
            this.children.splice(index, 1);
        }
    }

    getChildren(): RelaxNGPattern[] {
        return [...this.children];
    }

    getParent(): RelaxNGPattern | undefined {
        return this.parent;
    }

    clearChildren(): void {
        this.children = [];
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
    }

    getAttribute(name: string): string | undefined {
        return this.attributes.get(name);
    }

    setDataType(datatype: string): void {
        this.datatype = datatype;
    }

    getDataType(): string | undefined {
        return this.datatype;
    }

    setDatatypeLibrary(library: string): void {
        this.datatypeLibrary = library;
    }

    getDatatypeLibrary(): string | undefined {
        return this.datatypeLibrary;
    }

    setValue(value: string): void {
        this.value = value;
    }

    getValue(): string | undefined {
        return this.value;
    }

    setRefName(refName: string): void {
        this.refName = refName;
    }

    getRefName(): string | undefined {
        return this.refName;
    }

    setCombine(combine: string): void {
        this.combine = combine;
    }

    getCombine(): string | undefined {
        return this.combine;
    }

    setHref(href: string): void {
        this.href = href;
    }

    getHref(): string | undefined {
        return this.href;
    }

    setNs(ns: string): void {
        this.ns = ns;
    }

    getNs(): string | undefined {
        return this.ns;
    }

    setTextContent(textContent: string): void {
        this.textContent = textContent;
    }

    getTextContent(): string | undefined {
        return this.textContent;
    }

    clone(): RelaxNGPattern {
        const cloned = new RelaxNGPattern(this.type);
        cloned.name = this.name;
        cloned.namespace = this.namespace;
        cloned.datatype = this.datatype;
        cloned.datatypeLibrary = this.datatypeLibrary;
        cloned.value = this.value;
        cloned.refName = this.refName;
        cloned.combine = this.combine;
        cloned.href = this.href;
        cloned.ns = this.ns;
        cloned.textContent = this.textContent;

        this.attributes.forEach((value, key) => {
            cloned.attributes.set(key, value);
        });

        for (const child of this.children) {
            cloned.addChild(child.clone()); // This will set parent automatically
        }

        return cloned;
    }

    toJSON(): any {
        const result: any = {
            type: this.type
        };

        if (this.name) result.name = this.name;
        if (this.namespace) result.namespace = this.namespace;
        if (this.datatype) result.datatype = this.datatype;
        if (this.datatypeLibrary) result.datatypeLibrary = this.datatypeLibrary;
        if (this.value) result.value = this.value;
        if (this.refName) result.refName = this.refName;
        if (this.combine) result.combine = this.combine;
        if (this.href) result.href = this.href;
        if (this.ns) result.ns = this.ns;
        if (this.textContent) result.textContent = this.textContent;
        if (this.attributes.size > 0) result.attributes = Object.fromEntries(this.attributes);
        if (this.children.length > 0) result.children = this.children.map(child => child.toJSON());

        return result;
    }
}