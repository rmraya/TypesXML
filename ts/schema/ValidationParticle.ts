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

export interface ValidationParticle {
    getComponents(): ValidationParticle[];

    addComponent(component: ValidationParticle): void;

    getMinOccurs(): number;

    getMaxOccurs(): number;

    setCardinality(minOccurs: number, maxOccurs: number): void;

    resolve(): ValidationParticle[];

    isResolved(): boolean;

    validate(children: string[]): void;

    setSubstitutionGroupResolver?(resolver: (elementName: string, substitutionHead: string) => boolean): void;

    // Debug method to represent content model in BNF form
    toBNF(): string;
}