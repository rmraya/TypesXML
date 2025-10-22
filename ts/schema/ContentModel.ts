import { ValidationResult, ValidationError } from "../grammar/Grammar";
import { ValidationParticle } from "./ValidationParticle";
import { ElementNameParticle } from "./ElementNameParticle";
import { SequenceParticle } from "./SequenceParticle";
import { ChoiceParticle } from "./ChoiceParticle";
import { Model, ValidationContext } from "./Model";

export abstract class ContentModel implements Model {
    protected minOccurs: number;
    protected maxOccurs: number;
    
    constructor(minOccurs?: number, maxOccurs?: number) {
        this.minOccurs = minOccurs ?? 1;
        this.maxOccurs = maxOccurs ?? 1;
    }
    
    getMinOccurs(): number {
        return this.minOccurs;
    }
    
    getMaxOccurs(): number {
        return this.maxOccurs;
    }
    
    abstract getType(): string;
    abstract toParticle(context?: ValidationContext): ValidationParticle;
    
    isUnbounded(): boolean {
        return this.maxOccurs === -1 || this.maxOccurs === Number.POSITIVE_INFINITY;
    }
    
    abstract validate(children: string[], context?: ValidationContext): ValidationResult;
    abstract canAccept(element: string, position: number, children: string[]): boolean;
    abstract getPossibleElements(position: number, children: string[]): string[];
}


