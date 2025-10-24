import { AnyParticle } from './AnyParticle';
import { ChoiceParticle } from './ChoiceParticle';
import { ElementNameParticle } from './ElementNameParticle';
import { ValidationParticle } from './ValidationParticle';

interface ConsumptionState {
    position: number;
    componentIndex: number;
    occurrenceCounts: number[];
    consumed: boolean[];
}

class SequenceValidationError extends Error {
    constructor(
        message: string,
        public failedAtComponent: number,
        public position: number,
        public expectedElements: string[],
        public actualElements: string[]
    ) {
        super(message);
        this.name = 'SequenceValidationError';
    }
}

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

        // Handle empty sequence case
        if (this.components.length === 0) {
            if (children.length > 0) {
                throw new Error(`Empty sequence cannot contain elements. Actual elements: [${children.join(', ')}]`);
            }
            return;
        }

        // For most common case: sequence with single repeating component
        if (this.components.length === 1) {
            const component = this.components[0];
            try {
                component.validate(children);
                return;
            } catch (e) {
                throw new SequenceValidationError(
                    `Sequence validation failed: ${(e as Error).message}`,
                    0,
                    0,
                    this.getExpectedElementNames(),
                    children
                );
            }
        }

        // Use consumption tracking for complex sequences
        const result = this.validateWithConsumptionTracking(children);
        if (!result.success) {
            throw new SequenceValidationError(
                result.error!,
                result.failedComponent!,
                result.position!,
                this.getExpectedElementNames(),
                children
            );
        }
    }

    private validateWithConsumptionTracking(children: string[]): {
        success: boolean;
        error?: string;
        failedComponent?: number;
        position?: number;
    } {
        let sequenceMatches = 0;
        let position = 0;

        while (position < children.length && (this.maxOccurs === -1 || sequenceMatches < this.maxOccurs)) {
            const initialPosition = position;
            const state: ConsumptionState = {
                position: 0,
                componentIndex: 0,
                occurrenceCounts: new Array(this.components.length).fill(0),
                consumed: new Array(children.length).fill(false)
            };

            const sequenceResult: { success: boolean; newPosition?: number; failedComponent?: number } = this.tryMatchSequence(children, position, state);
            if (sequenceResult.success) {
                position = sequenceResult.newPosition!;
                sequenceMatches++;

                // Avoid infinite loop if no elements were consumed
                if (position === initialPosition) {
                    break;
                }
            } else {
                // Check if remaining components are optional for partial match
                if (this.canCompleteWithOptionalComponents(state.componentIndex)) {
                    sequenceMatches++;
                }
                break;
            }
        }

        // Check if we consumed all children
        if (position !== children.length) {
            return {
                success: false,
                error: `Sequence validation failed: unconsumed elements starting at position ${position}. Actual elements: [${children.join(', ')}]`,
                position: position
            };
        }

        // Check sequence cardinality
        if (sequenceMatches < this.minOccurs) {
            return {
                success: false,
                error: `Sequence validation failed: expected at least ${this.minOccurs} complete sequences, got ${sequenceMatches}. Actual elements: [${children.join(', ')}]`,
                position: 0
            };
        }

        if (this.maxOccurs !== -1 && sequenceMatches > this.maxOccurs) {
            return {
                success: false,
                error: `Sequence validation failed: expected at most ${this.maxOccurs} complete sequences, got ${sequenceMatches}. Actual elements: [${children.join(', ')}]`,
                position: 0
            };
        }

        return { success: true };
    }

    private tryMatchSequence(children: string[], startPosition: number, state: ConsumptionState): {
        success: boolean;
        newPosition?: number;
        failedComponent?: number;
    } {
        let position = startPosition;

        for (let componentIndex = 0; componentIndex < this.components.length; componentIndex++) {
            const component = this.components[componentIndex];
            const minOccurs = component.getMinOccurs();
            const maxOccurs = component.getMaxOccurs();

            const matchResult = this.matchComponent(component, children, position, minOccurs, maxOccurs);

            if (!matchResult.success) {
                if (minOccurs === 0) {
                    // Optional component, continue to next
                    continue;
                } else {
                    return {
                        success: false,
                        failedComponent: componentIndex
                    };
                }
            }

            position = matchResult.newPosition!;
            state.occurrenceCounts[componentIndex] = matchResult.matchCount!;
        }

        return {
            success: true,
            newPosition: position
        };
    }

    private matchComponent(
        component: ValidationParticle,
        children: string[],
        startPosition: number,
        minOccurs: number,
        maxOccurs: number
    ): {
        success: boolean;
        newPosition?: number;
        matchCount?: number;
    } {
        let position = startPosition;
        let matchCount = 0;

        if (component instanceof ElementNameParticle) {
            // Match consecutive elements for this component
            while (position < children.length &&
                (maxOccurs === -1 || matchCount < maxOccurs) &&
                component.matches(children[position])) {
                position++;
                matchCount++;
            }

            if (matchCount < minOccurs) {
                return { success: false };
            }

            return {
                success: true,
                newPosition: position,
                matchCount: matchCount
            };

        } else if (component instanceof ChoiceParticle) {
            // For choices within sequences, we need to try consuming elements from current position
            // until the choice can validate them or we can't consume any more

            let bestMatchPosition = position;
            let bestMatchCount = 0;

            // Try consuming different numbers of elements to see what the choice can validate
            for (let endPos = position + 1; endPos <= children.length; endPos++) {
                const choiceElements = children.slice(position, endPos);
                try {
                    component.validate(choiceElements);
                    bestMatchPosition = endPos;
                    bestMatchCount = choiceElements.length;
                    // Continue trying with more elements to find the longest match
                } catch (e) {
                    // This number of elements doesn't work for the choice, try next size
                    // Don't break - continue trying with more elements
                }
            }

            if (bestMatchCount === 0 && minOccurs > 0) {
                return { success: false };
            }

            if (bestMatchCount < minOccurs) {
                return { success: false };
            }

            return {
                success: true,
                newPosition: bestMatchPosition,
                matchCount: bestMatchCount
            };

        } else if (component instanceof AnyParticle) {
            // Handle xs:any component
            const anyElements: string[] = [];

            while (position < children.length && (maxOccurs === -1 || anyElements.length < maxOccurs)) {
                const elementMatches = component.matches(children[position], component.getTargetNamespace());
                if (elementMatches) {
                    anyElements.push(children[position]);
                    position++;
                } else {
                    break;
                }
            }

            if (anyElements.length < minOccurs) {
                return { success: false };
            }

            try {
                component.validate(anyElements);
                return {
                    success: true,
                    newPosition: position,
                    matchCount: anyElements.length
                };
            } catch (e) {
                return { success: false };
            }

        } else {
            // Handle other particle types (simplified)
            if (position < children.length) {
                try {
                    component.validate([children[position]]);
                    return {
                        success: true,
                        newPosition: position + 1,
                        matchCount: 1
                    };
                } catch (e) {
                    return { success: false };
                }
            } else if (minOccurs === 0) {
                return {
                    success: true,
                    newPosition: position,
                    matchCount: 0
                };
            } else {
                return { success: false };
            }
        }
    }

    private canCompleteWithOptionalComponents(startComponentIndex: number): boolean {
        for (let i = startComponentIndex; i < this.components.length; i++) {
            if (this.components[i].getMinOccurs() > 0) {
                return false;
            }
        }
        return true;
    }

    private getExpectedElementNames(): string[] {
        const names: string[] = [];
        for (const component of this.components) {
            if (component instanceof ElementNameParticle) {
                names.push(component.getElementName());
            } else if (component instanceof ChoiceParticle) {
                for (const choiceComp of component.getComponents()) {
                    if (choiceComp instanceof ElementNameParticle) {
                        names.push(choiceComp.getElementName());
                    }
                }
            }
        }
        return names;
    }

    setSubstitutionGroupResolver(resolver: (elementName: string, substitutionHead: string) => boolean): void {
        // Propagate to child particles
        for (const component of this.components) {
            if (component.setSubstitutionGroupResolver) {
                component.setSubstitutionGroupResolver(resolver);
            }
        }
    }

    toBNF(): string {
        const componentBNFs: string[] = this.components.map(comp => comp.toBNF());
        let result: string = `(${componentBNFs.join(' ')})`;

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