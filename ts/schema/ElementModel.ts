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
    }
    
    getElementName(): string {
        return this.elementName;
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
        const particle = new ElementNameParticle(this.elementName.toString());
        particle.setCardinality(this.minOccurs, this.maxOccurs);
        return particle;
    }

    canAccept(element: string, position: number, children: string[]): boolean {
        if (element !== this.elementName) {
            return false;
        }
        
        const count = children.slice(0, position).filter(child =>
            child === this.elementName
        ).length + 1;
        
        return this.isUnbounded() || count <= this.maxOccurs;
    }
    
    getPossibleElements(position: number, children: string[]): string[] {
        const count = children.slice(0, position).filter(child =>
            child === this.elementName
        ).length;
        
        if (this.isUnbounded() || count < this.maxOccurs) {
            return [this.elementName];
        }
        
        return [];
    }
}