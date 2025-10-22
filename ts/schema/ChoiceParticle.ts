import { ValidationParticle } from './ValidationParticle';
import { ElementNameParticle } from './ElementNameParticle';

export class ChoiceParticle implements ValidationParticle {
    private components: ValidationParticle[] = [];
    private minOccurs: number = 1;
    private maxOccurs: number = 1;
    private resolved: boolean = false;
    private namespaceResolver?: (prefix: string) => string;
    private substitutionGroupResolver?: (elementName: string, substitutionHead: string) => boolean;

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
        // Only resolve child components, but keep this choice as a unit
        for (let i = 0; i < this.components.length; i++) {
            const component = this.components[i];
            if (!component.isResolved()) {
                component.resolve();
            }
        }
        this.resolved = true;
        return [this]; // Return self as a resolved choice particle
    }

    isResolved(): boolean {
        return this.resolved;
    }

    setNamespaceResolver(resolver: (prefix: string) => string): void {
        this.namespaceResolver = resolver;
        // Propagate to child particles
        for (const component of this.components) {
            if (component instanceof ElementNameParticle) {
                component.setNamespaceResolver(resolver);
            }
        }
    }

    setSubstitutionGroupResolver(resolver: (elementName: string, substitutionHead: string) => boolean): void {
        this.substitutionGroupResolver = resolver;
        // Propagate to child particles
        for (const component of this.components) {
            if (component instanceof ElementNameParticle) {
                component.setSubstitutionGroupResolver(resolver);
            }
        }
    }

    validate(children: string[]): void {
        if (!this.isResolved()) {
            throw new Error('Choice particle must be resolved before validation');
        }
        
        const validElementNames = new Set<string>();
        const validElementParticles: ElementNameParticle[] = [];
        
        for (const component of this.components) {
            if (component instanceof ElementNameParticle) {
                const elementName = (component as ElementNameParticle).getElementName();
                validElementNames.add(elementName);
                validElementParticles.push(component as ElementNameParticle);
            }
        }

        // Check each child element against valid choices
        for (const childName of children) {
            let isValidChoice = false;
            for (const particle of validElementParticles) {
                const matches = particle.matches(childName);
                if (matches) {
                    isValidChoice = true;
                    break;
                }
            }
            if (!isValidChoice) {
                const validNames = Array.from(validElementNames).join(', ');
                const actualElements = children.join(', ');
                throw new Error(
                    `Choice validation failed: element '${childName}' is not a valid choice. Valid options: [${validNames}]. Actual elements: [${actualElements}]`
                );
            }
        }

        // Then check cardinality (treat -1 as unbounded)
        if (children.length < this.minOccurs || (this.maxOccurs !== -1 && children.length > this.maxOccurs)) {
            const validNames = Array.from(validElementNames).join(', ');
            const maxStr = this.maxOccurs === -1 ? 'unbounded' : this.maxOccurs.toString();
            throw new Error(
                `Choice validation failed: expected ${this.minOccurs}-${maxStr} elements from [${validNames}], got ${children.length}`
            );
        }
    }
}