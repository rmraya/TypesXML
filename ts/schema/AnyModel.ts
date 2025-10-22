import { ValidationResult } from '../grammar/Grammar';
import { ContentModel } from './ContentModel';
import { ValidationParticle } from './ValidationParticle';
import { AnyParticle } from './AnyParticle';
import { Model, ValidationContext } from './Model';

export class AnyModel extends ContentModel implements Model {
    private namespace: string;
    private processContents: string;
    
    constructor(namespace: string = '##any', processContents: string = 'lax', minOccurs?: number, maxOccurs?: number) {
        super(minOccurs, maxOccurs);
        this.namespace = namespace;
        this.processContents = processContents;
    }
    
    getNamespace(): string {
        return this.namespace;
    }
    
    getProcessContents(): string {
        return this.processContents;
    }
    
    getType(): string {
        return 'any';
    }
    
    validate(children: string[], context?: ValidationContext): ValidationResult {
        const particle = this.toParticle(context);
        try {
            particle.validate(children);
            return ValidationResult.success();
        } catch (error) {
            return ValidationResult.error((error as Error).message);
        }
    }

    toParticle(context?: ValidationContext): ValidationParticle {
        const targetNamespace = context?.targetNamespace;
        const anyParticle = new AnyParticle(this.namespace, this.processContents, targetNamespace);
        anyParticle.setCardinality(this.minOccurs, this.maxOccurs);
        return anyParticle;
    }

    canAccept(element: string, position: number, children: string[]): boolean {
        // Create a temporary particle to check if the element matches
        // Note: We don't have ValidationContext here, so we can't pass targetNamespace
        // This is a limitation of the canAccept interface - it should accept ValidationContext
        const anyParticle = new AnyParticle(this.namespace, this.processContents);
        return anyParticle.matches(element);
    }
    
    getPossibleElements(position: number, children: string[]): string[] {
        return [];
    }
}