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
    
    addParticle(particle: ContentModel): void {
        this.particles.push(particle);
    }
    
    getParticles(): ContentModel[] {
        return this.particles;
    }
    
    validate(children: string[], context?: ValidationContext): ValidationResult {
        const particle = this.toParticle(context);
        try {
            particle.resolve();
            particle.validate(children);
            return ValidationResult.success();
        } catch (error) {
            return ValidationResult.error((error as Error).message);
        }
    }

    toParticle(context?: ValidationContext): ValidationParticle {
        const choice = new ChoiceParticle();
        choice.setCardinality(this.minOccurs, this.maxOccurs);
        for (const particle of this.particles) {
            choice.addComponent(particle.toParticle(context));
        }
        return choice;
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