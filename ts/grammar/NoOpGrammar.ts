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

import { AttributeInfo, Grammar, GrammarType, ValidationContext, ValidationResult } from './Grammar';

export class NoOpGrammar implements Grammar {

    validateElement(element: string, content: ValidationContext): ValidationResult {
        return ValidationResult.success();
    }

    validateAttributes(element: string, attributes: Map<string, string>, context: ValidationContext): ValidationResult {
        return ValidationResult.success();
    }

    getElementAttributes(element: string): Map<string, AttributeInfo> {
        return new Map();
    }

    getDefaultAttributes(element: string): Map<string, string> {
        return new Map();
    }

    resolveEntity(name: string): string | undefined {
        return undefined;
    }

    addEntityReferenceUsage(originalReference: string, expandedText: string): void {
    }

    getOriginalEntityReference(expandedText: string): string | undefined {
        return undefined;
    }

    clearEntityReferenceTracking(): void {
    }

    getGrammarType(): GrammarType {
        return GrammarType.NONE;
    }

    getTargetNamespace(): string | undefined {
        return undefined;
    }

    getNamespaceDeclarations(): Map<string, string> {
        return new Map();
    }

    toJSON(): any {
        return {
            grammarType: 'none',
            version: '1.0'
        };
    }
}