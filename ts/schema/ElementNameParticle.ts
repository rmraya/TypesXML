import { ValidationParticle } from './ValidationParticle';

export class ElementNameParticle implements ValidationParticle {
    private components: ValidationParticle[] = [];
    private minOccurs: number = 1;
    private maxOccurs: number = 1;
    private elementName: string;
    private prefix: string;
    private localName: string;
    private resolved: boolean = false;
    private namespaceResolver?: (prefix: string) => string;
    private substitutionGroupResolver?: (elementName: string, substitutionHead: string) => boolean;

    constructor(elementName: string) {
        this.elementName = elementName;
        // Parse qualified name
        const colonIndex = elementName.indexOf(':');
        if (colonIndex !== -1) {
            this.prefix = elementName.substring(0, colonIndex);
            this.localName = elementName.substring(colonIndex + 1);
        } else {
            this.prefix = '';
            this.localName = elementName;
        }
    }

    getComponents(): ValidationParticle[] {
        return this.components;
    }

    addComponent(component: ValidationParticle): void {
        this.components.push(component);
    }

    getMinOccurs(): number {
        return this.minOccurs;
    }

    getMaxOccurs(): number {
        return this.maxOccurs;
    }

    setCardinality(minOccurs: number, maxOccurs: number): void {
        this.minOccurs = minOccurs;
        this.maxOccurs = maxOccurs;
    }

    resolve(): ValidationParticle[] {
        this.resolved = true;
        return [this];
    }

    isResolved(): boolean {
        return this.resolved;
    }

    validate(children: string[]): void {
        // Validate that children array matches this element's occurrence constraints
        if (children.length < this.minOccurs) {
            throw new Error(`ElementNameParticle validation failed: expected at least ${this.minOccurs} occurrences of '${this.elementName}', got ${children.length}`);
        }

        if (this.maxOccurs !== -1 && children.length > this.maxOccurs) {
            throw new Error(`ElementNameParticle validation failed: expected at most ${this.maxOccurs} occurrences of '${this.elementName}', got ${children.length}`);
        }

        // Validate that all children match this element
        for (const child of children) {
            if (!this.matches(child)) {
                throw new Error(`ElementNameParticle validation failed: element '${child}' does not match expected element '${this.elementName}'`);
            }
        }
    }

    getElementName(): string {
        return this.elementName;
    }

    getPrefix(): string {
        return this.prefix;
    }

    getLocalName(): string {
        return this.localName;
    }

    setNamespaceResolver(resolver: (prefix: string) => string): void {
        this.namespaceResolver = resolver;
    }

    setSubstitutionGroupResolver(resolver: (elementName: string, substitutionHead: string) => boolean): void {
        this.substitutionGroupResolver = resolver;
    }

    // Check if an element name matches this element particle
    matches(elementName: string, elementNamespaceURI?: string): boolean {
        // First try direct name matching
        if (this.elementName === elementName) {
            return true;
        }

        // Handle qualified names by comparing local names
        const elementColonIndex = elementName.indexOf(':');
        const elementLocalName = elementColonIndex !== -1 ? elementName.substring(elementColonIndex + 1) : elementName;

        // If this particle expects a qualified name, compare local names
        if (this.localName === elementLocalName) {
            return true;
        }

        // If we have a substitution group resolver, check if the element can substitute for this one
        if (this.substitutionGroupResolver) {
            return this.substitutionGroupResolver(elementName, this.elementName);
        }

        return false;
    }

    toBNF(): string {
        const name: string = this.elementName;
        const min: number = this.minOccurs;
        const max: number = this.maxOccurs;

        if (min === 1 && max === 1) {
            return name;
        } else if (min === 0 && max === 1) {
            return `${name}?`;
        } else if (min === 0 && max === -1) {
            return `${name}*`;
        } else if (min === 1 && max === -1) {
            return `${name}+`;
        } else {
            const maxStr: string = max === -1 ? 'unbounded' : max.toString();
            return `${name}{${min},${maxStr}}`;
        }
    }
}