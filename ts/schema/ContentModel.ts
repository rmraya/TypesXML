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


