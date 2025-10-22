import { ValidationResult, ValidationError } from '../grammar/Grammar';
import { ContentModel } from './ContentModel';
import { ValidationParticle } from './ValidationParticle';
import { SequenceParticle } from './SequenceParticle';
import { ElementModel } from './ElementModel';
import { ValidationContext } from './Model';

export class AllModel extends ContentModel {
    private particles: ElementModel[] = [];
    
    constructor(minOccurs?: number, maxOccurs?: number) {
        super(minOccurs, maxOccurs);
    }
    
    getType(): string {
        return 'all';
    }
    
    addParticle(particle: ElementModel): void {
        this.particles.push(particle);
    }
    
    getParticles(): ElementModel[] {
        return this.particles;
    }
    
    validate(children: string[], context?: ValidationContext): ValidationResult {
        const elementCounts = new Map<string, number>();

        for (const child of children) {
            const key: string = child.toString();
            elementCounts.set(key, (elementCounts.get(key) || 0) + 1);
        }

        const errors: ValidationError[] = [];

        for (const particle of this.particles) {
            const key: string = particle.getElementName().toString();
            const count: number = elementCounts.get(key) || 0;

            if (count < particle.getMinOccurs()) {
                errors.push(new ValidationError(
                    `Element '${key}' must appear at least ${particle.getMinOccurs()} times, found ${count}`,
                    key
                ));
            }

            if (!particle.isUnbounded() && count > particle.getMaxOccurs()) {
                errors.push(new ValidationError(
                    `Element '${key}' must appear at most ${particle.getMaxOccurs()} times, found ${count}`,
                    key
                ));
            }

            elementCounts.delete(key);
        }

        elementCounts.forEach((count: number, key: string) => {
            errors.push(new ValidationError(`Unexpected element in all group: ${key} (${count} occurrences)`));
        });

        return errors.length > 0 ? 
            new ValidationResult(false, errors) : 
            ValidationResult.success();
    }

    toParticle(context?: ValidationContext): ValidationParticle {
        const sequence: SequenceParticle = new SequenceParticle();
        sequence.setCardinality(this.minOccurs, this.maxOccurs);
        for (const particle of this.particles) {
            sequence.addComponent(particle.toParticle(context));
        }
        return sequence;
    }

    canAccept(element: string, position: number, children: string[]): boolean {
        for (const particle of this.particles) {
            if (particle.canAccept(element, position, children)) {
                return true;
            }
        }
        return false;
    }
    
    getPossibleElements(position: number, children: string[]): string[] {
        const possible: string[] = [];
        for (const particle of this.particles) {
            possible.push(...particle.getPossibleElements(position, children));
        }
        return possible;
    }
}