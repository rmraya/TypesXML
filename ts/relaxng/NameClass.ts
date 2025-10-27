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

export abstract class NameClass {
    abstract matches(localName: string, namespaceURI: string | null): boolean;
    abstract toString(): string;
    abstract equals(other: NameClass): boolean;

    choice(other: NameClass): NameClass {
        return new ChoiceNameClass(this, other);
    }

    except(other: NameClass): NameClass {
        return new ExceptNameClass(this, other);
    }
}

export class LocalNameClass extends NameClass {
    private localName: string;
    private namespaceURI: string | null;

    constructor(localName: string, namespaceURI: string | null = null) {
        super();
        this.localName = localName;
        this.namespaceURI = namespaceURI;
    }

    matches(localName: string, namespaceURI: string | null): boolean {
        return this.localName === localName && this.namespaceURI === namespaceURI;
    }

    toString(): string {
        if (this.namespaceURI) {
            return `{${this.namespaceURI}}${this.localName}`;
        }
        return this.localName;
    }

    equals(other: NameClass): boolean {
        return other instanceof LocalNameClass &&
               this.localName === other.localName &&
               this.namespaceURI === other.namespaceURI;
    }

    getLocalName(): string {
        return this.localName;
    }

    getNamespaceURI(): string | null {
        return this.namespaceURI;
    }
}

export class AnyNameClass extends NameClass {
    matches(localName: string, namespaceURI: string | null): boolean {
        return true;
    }

    toString(): string {
        return '*';
    }

    equals(other: NameClass): boolean {
        return other instanceof AnyNameClass;
    }
}

export class NsNameClass extends NameClass {
    private namespaceURI: string | null;

    constructor(namespaceURI: string | null) {
        super();
        this.namespaceURI = namespaceURI;
    }

    matches(localName: string, namespaceURI: string | null): boolean {
        return this.namespaceURI === namespaceURI;
    }

    toString(): string {
        if (this.namespaceURI) {
            return `{${this.namespaceURI}}*`;
        }
        return '{*}*';
    }

    equals(other: NameClass): boolean {
        return other instanceof NsNameClass &&
               this.namespaceURI === other.namespaceURI;
    }

    getNamespaceURI(): string | null {
        return this.namespaceURI;
    }
}

export class ChoiceNameClass extends NameClass {
    private first: NameClass;
    private second: NameClass;

    constructor(first: NameClass, second: NameClass) {
        super();
        this.first = first;
        this.second = second;
    }

    matches(localName: string, namespaceURI: string | null): boolean {
        return this.first.matches(localName, namespaceURI) ||
               this.second.matches(localName, namespaceURI);
    }

    toString(): string {
        return `(${this.first.toString()} | ${this.second.toString()})`;
    }

    equals(other: NameClass): boolean {
        if (!(other instanceof ChoiceNameClass)) {
            return false;
        }
        return (this.first.equals(other.first) && this.second.equals(other.second)) ||
               (this.first.equals(other.second) && this.second.equals(other.first));
    }

    getFirst(): NameClass {
        return this.first;
    }

    getSecond(): NameClass {
        return this.second;
    }
}

export class ExceptNameClass extends NameClass {
    private included: NameClass;
    private excluded: NameClass;

    constructor(included: NameClass, excluded: NameClass) {
        super();
        this.included = included;
        this.excluded = excluded;
    }

    matches(localName: string, namespaceURI: string | null): boolean {
        return this.included.matches(localName, namespaceURI) &&
               !this.excluded.matches(localName, namespaceURI);
    }

    toString(): string {
        return `(${this.included.toString()} - ${this.excluded.toString()})`;
    }

    equals(other: NameClass): boolean {
        return other instanceof ExceptNameClass &&
               this.included.equals(other.included) &&
               this.excluded.equals(other.excluded);
    }

    getIncluded(): NameClass {
        return this.included;
    }

    getExcluded(): NameClass {
        return this.excluded;
    }
}

export class NameClassFactory {
    static anyName(): NameClass {
        return new AnyNameClass();
    }

    static localName(name: string): NameClass {
        return new LocalNameClass(name, null);
    }

    static qualifiedName(localName: string, namespaceURI: string): NameClass {
        return new LocalNameClass(localName, namespaceURI);
    }

    static nsName(namespaceURI: string | null): NameClass {
        return new NsNameClass(namespaceURI);
    }

    static fromPattern(pattern: any): NameClass {
        if (pattern.type === 'name') {
            const ns = pattern.namespace || null;
            const localName = pattern.name || pattern.textContent || '';
            return new LocalNameClass(localName, ns);
        } else if (pattern.type === 'anyName') {
            return new AnyNameClass();
        } else if (pattern.type === 'nsName') {
            return new NsNameClass(pattern.ns || null);
        } else if (pattern.type === 'choice') {
            const children = pattern.children || [];
            if (children.length >= 2) {
                let result = this.fromPattern(children[0]);
                for (let i = 1; i < children.length; i++) {
                    result = result.choice(this.fromPattern(children[i]));
                }
                return result;
            }
        }
        
        return new AnyNameClass();
    }
}