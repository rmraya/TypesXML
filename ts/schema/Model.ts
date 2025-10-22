import { ValidationParticle } from './ValidationParticle';

export interface ValidationContext {
    targetNamespace?: string;
    namespaceResolver?: (prefix: string) => string;
}

export interface Model {
    toParticle(context?: ValidationContext): ValidationParticle;
    getMinOccurs(): number;
    getMaxOccurs(): number;
    getType(): string;
}