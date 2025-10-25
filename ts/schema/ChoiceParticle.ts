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
        // Flatten all components by resolving them and replacing with their resolved particles
        const newComponents: ValidationParticle[] = [];
        
        for (let i = 0; i < this.components.length; i++) {
            const component = this.components[i];
            if (!component.isResolved()) {
                const resolvedParticles = component.resolve();
                // Add all resolved particles to replace this component
                newComponents.push(...resolvedParticles);
            } else {
                // Component already resolved, keep as-is
                newComponents.push(component);
            }
        }
        
        // Replace components with flattened list
        this.components = newComponents;
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
        
        // Handle empty children case
        if (children.length === 0) {
            if (this.minOccurs > 0) {
                throw new Error(`Choice validation failed: expected at least ${this.minOccurs} choice selections, got 0`);
            }
            return;
        }
        
        // Try to consume all children by repeatedly applying the choice
        let remainingChildren = [...children];
        let choiceCount = 0;
        
        while (remainingChildren.length > 0 && (this.maxOccurs === -1 || choiceCount < this.maxOccurs)) {
            let matchFound = false;
            let bestMatch: { component: ValidationParticle, consumed: number } | null = null;
            let componentErrors: string[] = [];
            
            // Try each choice component to see which one can consume the most elements
            for (const component of this.components) {
                try {
                    // For ElementNameParticle, we need to see how many elements it can consume
                    if (component instanceof ElementNameParticle) {
                        const elementName = component.getElementName();
                        let consumed = 0;
                        
                        // Count how many consecutive matching elements we can consume
                        for (const child of remainingChildren) {
                            if (child === elementName && (component.getMaxOccurs() === -1 || consumed < component.getMaxOccurs())) {
                                consumed++;
                            } else {
                                break;
                            }
                        }
                        
                        if (consumed >= component.getMinOccurs()) {
                            // This component can consume some elements
                            if (!bestMatch || consumed > bestMatch.consumed) {
                                bestMatch = { component, consumed };
                            }
                            matchFound = true;
                        }
                    } else {
                        // For other particle types, try to validate a subset of children
                        // This is a simplified approach - may need refinement for complex particles
                        component.validate(remainingChildren);
                        bestMatch = { component, consumed: remainingChildren.length };
                        matchFound = true;
                        break;
                    }
                } catch (error) {
                    const errorMsg = (error as Error).message;
                    componentErrors.push(`${component.constructor.name}: ${errorMsg}`);
                }
            }
            
            if (!matchFound || !bestMatch) {
                // No component could match any remaining children
                const allErrors = componentErrors.join('; ');
                throw new Error(`Choice validation failed: none of the choice components could validate the remaining children [${remainingChildren.join(', ')}]. Errors: ${allErrors}`);
            }
            
            // Consume the matched elements
            remainingChildren = remainingChildren.slice(bestMatch.consumed);
            choiceCount++;
        }
        
        // Check if we have unconsumed children
        if (remainingChildren.length > 0) {
            if (this.maxOccurs === -1) {
                throw new Error(`Choice validation failed: all choice components rejected the remaining children [${remainingChildren.join(', ')}]`);
            } else {
                throw new Error(`Choice validation failed: reached maximum occurrences (${this.maxOccurs}) but still have unconsumed children [${remainingChildren.join(', ')}]`);
            }
        }
        
        // Check if we meet minimum occurrences
        if (choiceCount < this.minOccurs) {
            throw new Error(`Choice validation failed: expected at least ${this.minOccurs} choice selections, got ${choiceCount}`);
        }
    }

    toBNF(): string {
        const componentBNFs: string[] = this.components.map(comp => comp.toBNF());
        let result: string = `(${componentBNFs.join(' | ')})`;
        
        const min: number = this.minOccurs;
        const max: number = this.maxOccurs;
        
        if (min === 1 && max === 1) {
            return result;
        } else if (min === 0 && max === 1) {
            return `${result}?`;
        } else if (min === 0 && max === -1) {
            return `${result}*`;
        } else if (min === 1 && max === -1) {
            return `${result}+`;
        } else {
            const maxStr: string = max === -1 ? 'unbounded' : max.toString();
            return `${result}{${min},${maxStr}}`;
        }
    }
}