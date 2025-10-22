import { ValidationParticle } from './ValidationParticle';
import { ElementNameParticle } from './ElementNameParticle';
import { ChoiceParticle } from './ChoiceParticle';
import { AnyParticle } from './AnyParticle';

export class SequenceParticle implements ValidationParticle {
    private components: ValidationParticle[] = [];
    private minOccurs: number = 1;
    private maxOccurs: number = 1;
    private resolved: boolean = false;

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
        for (let i = 0; i < this.components.length; i++) {
            const component = this.components[i];
            if (!component.isResolved()) {
                const resolvedComponents = component.resolve();
                // Replace the component with its resolved form
                this.components.splice(i, 1, ...resolvedComponents);
                i += resolvedComponents.length - 1;
            }
        }
        this.resolved = true;
        return [this]; // Return self as resolved sequence
    }

    isResolved(): boolean {
        return this.resolved;
    }

    validate(children: string[]): void {
        if (!this.isResolved()) {
            throw new Error('Sequence particle must be resolved before validation');
        }



        // For most common case: sequence with single repeating component
        if (this.components.length === 1) {
            const component = this.components[0];
            
            // If the sequence contains a single component (like a choice that can repeat),
            // just validate all children against that component
            try {
                component.validate(children);

                return;
            } catch (e) {
                throw new Error(
                    `Sequence validation failed: ${(e as Error).message}. Actual elements: [${children.join(', ')}]`
                );
            }
        }

        // For complex sequences with multiple components, use original logic
        let position = 0;
        let sequenceMatches = 0;

        while (position < children.length && (this.maxOccurs === -1 || sequenceMatches < this.maxOccurs)) {
            let startPosition = position;
            let sequenceValid = true;



            // Try to match one complete sequence
            for (const component of this.components) {
                if (component instanceof ElementNameParticle) {
                    const elementName = (component as ElementNameParticle).getElementName();
                    const minOccurs = component.getMinOccurs();
                    const maxOccurs = component.getMaxOccurs();
                    
                    let matchCount = 0;
                    
                    // Count consecutive matching elements
                    while (position < children.length && 
                           (component as ElementNameParticle).matches(children[position]) && 
                           (maxOccurs === -1 || matchCount < maxOccurs)) {
                        position++;
                        matchCount++;
                    }
                    
                    // Check if we have enough matches
                    if (matchCount < minOccurs) {
                        // Not enough matches, sequence fails
                        sequenceValid = false;
                        break;
                    }
                } else if (component instanceof ChoiceParticle) {
                    // Handle choice component - collect elements that match this choice
                    let choiceElements: string[] = [];
                    
                    // Collect all consecutive elements that could match this choice
                    const validChoiceNames = new Set<string>();
                    const validChoiceParticles: ElementNameParticle[] = [];
                    for (const choiceComp of component.getComponents()) {
                        if (choiceComp instanceof ElementNameParticle) {
                            validChoiceNames.add((choiceComp as ElementNameParticle).getElementName());
                            validChoiceParticles.push(choiceComp as ElementNameParticle);
                        }
                    }
                    


                    // Use namespace-aware matching for choice elements
                    while (position < children.length) {
                        let matchesChoice = false;
                        for (const choiceParticle of validChoiceParticles) {
                            if (choiceParticle.matches(children[position])) {
                                matchesChoice = true;
                                break;
                            }
                        }
                        if (matchesChoice) {
                            choiceElements.push(children[position]);
                            position++;
                        } else {
                            break;
                        }
                    }

                    // Validate this choice
                    try {
                        component.validate(choiceElements);
                    } catch (e) {
                        // Choice validation failed, reset and exit
                        sequenceValid = false;
                        break;
                    }
                } else if (component instanceof AnyParticle) {
                    // Handle xs:any component - collect elements that match the namespace constraint
                    const anyParticle = component as AnyParticle;
                    const minOccurs = anyParticle.getMinOccurs();
                    const maxOccurs = anyParticle.getMaxOccurs();
                    

                    let matchCount = 0;
                    let anyElements: string[] = [];
                    
                    // Collect consecutive elements that match the xs:any constraint
                    while (position < children.length && (maxOccurs === -1 || matchCount < maxOccurs)) {
                        // For this implementation, we'll assume elements match if they would be
                        // consumed by the xs:any. In a full sequence, xs:any with namespace="##other"
                        // should match elements from foreign namespaces
                        const elementMatches = anyParticle.matches(children[position], anyParticle.getTargetNamespace());
                        
                        if (elementMatches) {
                            anyElements.push(children[position]);
                            position++;
                            matchCount++;
                        } else {
                            break;
                        }
                    }
                    
                    // Check minimum occurrence constraint
                    if (matchCount < minOccurs) {
                        sequenceValid = false;
                        break;
                    }
                    
                    // Validate the collected elements against the xs:any constraint
                    try {
                        anyParticle.validate(anyElements);
                    } catch (e) {
                        sequenceValid = false;
                        break;
                    }
                } else {
                    // Handle other particle types
                    try {
                        component.validate(children.slice(position));
                        // For now, assume it consumes one element (this is simplified)
                        position++;
                    } catch (e) {
                        sequenceValid = false;
                        break;
                    }
                }
            }

            // Check if we matched a complete sequence
            if (sequenceValid) {
                sequenceMatches++;
                // If we didn't consume any elements in this iteration but the sequence was valid
                // (e.g., all remaining components were optional), we should stop to avoid infinite loop
                if (position === startPosition) {
                    break;
                }
            } else {
                // Reset position and break
                position = startPosition;
                break;
            }
        }

        // If we've consumed all children but haven't completed a sequence, 
        // check if the remaining components are all optional
        // If we've consumed all children but haven't completed a sequence, 
        // check if the remaining components are all optional
        if (position === children.length && sequenceMatches === 0 && this.minOccurs > 0) {
            let canCompleteSequence = true;
            let pos = 0;
            
            // Check if we can match at least one complete sequence with the given children
            for (const component of this.components) {
                if (component instanceof ElementNameParticle) {
                    const elementName = (component as ElementNameParticle).getElementName();
                    const minOccurs = component.getMinOccurs();
                    const maxOccurs = component.getMaxOccurs();
                    
                    let matchCount = 0;
                    
                    // Count consecutive matching elements
                    while (pos < children.length && 
                           (component as ElementNameParticle).matches(children[pos]) && 
                           (maxOccurs === -1 || matchCount < maxOccurs)) {
                        pos++;
                        matchCount++;
                    }
                    
                    // Check if we have enough matches
                    if (matchCount < minOccurs) {
                        canCompleteSequence = false;
                        break;
                    }
                }
            }
            
            if (canCompleteSequence && pos === children.length) {
                sequenceMatches = 1;
            }
        }

        // Check if we consumed all children and have valid sequence count
        if (position !== children.length || sequenceMatches < this.minOccurs || (this.maxOccurs !== -1 && sequenceMatches > this.maxOccurs)) {
            throw new Error(
                `Sequence validation failed: expected ${this.minOccurs}-${this.maxOccurs === -1 ? 'unbounded' : this.maxOccurs} complete sequences, got ${sequenceMatches}. Actual elements: [${children.join(', ')}]`
            );
        }

    }

    setSubstitutionGroupResolver(resolver: (elementName: string, substitutionHead: string) => boolean): void {
        // Propagate to child particles
        for (const component of this.components) {
            if (component.setSubstitutionGroupResolver) {
                component.setSubstitutionGroupResolver(resolver);
            }
        }
    }
}