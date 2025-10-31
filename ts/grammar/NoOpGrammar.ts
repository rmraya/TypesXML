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

import { XMLUtils } from '../XMLUtils';
import { AttributeInfo, Grammar, GrammarType, ValidationContext, ValidationResult } from './Grammar';

export class NoOpGrammar implements Grammar {

    validateElement(element: string, content: ValidationContext): ValidationResult {
        XMLUtils.ignoreUnused(element, content);
        return ValidationResult.success();
    }

    validateAttributes(element: string, attributes: Map<string, string>, context: ValidationContext): ValidationResult {
        XMLUtils.ignoreUnused(element, attributes, context);
        return ValidationResult.success();
    }

    getElementAttributes(element: string): Map<string, AttributeInfo> {
        XMLUtils.ignoreUnused(element);
        return new Map();
    }

    getDefaultAttributes(element: string): Map<string, string> {
        XMLUtils.ignoreUnused(element);
        return new Map();
    }

    resolveEntity(name: string): string | undefined {
        XMLUtils.ignoreUnused(name);
        return undefined;
    }

    addEntityReferenceUsage(originalReference: string, expandedText: string): void {
        XMLUtils.ignoreUnused(originalReference, expandedText);
    }

    getOriginalEntityReference(expandedText: string): string | undefined {
        XMLUtils.ignoreUnused(expandedText);
        return undefined;
    }

    consumeEntityReference(expandedText: string): string | undefined {
        XMLUtils.ignoreUnused(expandedText);
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