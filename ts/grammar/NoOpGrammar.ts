/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *******************************************************************************/

import { AttributeInfo, Grammar, GrammarType, QualifiedName, ValidationContext, ValidationResult } from './Grammar';

export class NoOpGrammar implements Grammar {

    validateElement(element: QualifiedName, content: ValidationContext): ValidationResult {
        return ValidationResult.success();
    }

    getElementAttributes(element: QualifiedName): Map<QualifiedName, AttributeInfo> {
        return new Map();
    }

    getDefaultAttributes(element: QualifiedName): Map<QualifiedName, string> {
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
}