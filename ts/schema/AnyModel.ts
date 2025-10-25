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