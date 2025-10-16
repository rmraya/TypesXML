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

// Namespace-aware naming
export class QualifiedName {
    constructor(
        public localName: string,
        public namespaceURI: string = '',
        public prefix: string = ''
    ) { }

    equals(other: QualifiedName): boolean {
        return this.localName === other.localName &&
            this.namespaceURI === other.namespaceURI;
    }

    toString(): string {
        return this.prefix ? `${this.prefix}:${this.localName}` : this.localName;
    }

    // For backward compatibility with string-based element names
    static fromString(name: string): QualifiedName {
        const colonIndex = name.indexOf(':');
        if (colonIndex !== -1) {
            const prefix = name.substring(0, colonIndex);
            const localName = name.substring(colonIndex + 1);
            return new QualifiedName(localName, '', prefix);
        }
        return new QualifiedName(name);
    }
}

// Unified attribute information
export class AttributeInfo {
    constructor(
        public name: QualifiedName,
        public datatype: string,
        public use: AttributeUse,
        public defaultValue?: string,
        public fixedValue?: string
    ) { }
}

export enum AttributeUse {
    REQUIRED = 'required',
    OPTIONAL = 'optional',
    IMPLIED = 'implied',
    FIXED = 'fixed',
    PROHIBITED = 'prohibited'
}

// Validation context
export class ValidationContext {
    constructor(
        public children: QualifiedName[],
        public attributes: Map<QualifiedName, string>,
        public textContent: string,
        public parent?: QualifiedName
    ) { }
}

// Validation result
export class ValidationError {
    constructor(
        public message: string,
        public location?: string
    ) { }
}

export class ValidationWarning {
    constructor(
        public message: string,
        public location?: string
    ) { }
}

export class ValidationResult {
    constructor(
        public isValid: boolean,
        public errors: ValidationError[] = [],
        public warnings: ValidationWarning[] = []
    ) { }

    static success(): ValidationResult {
        return new ValidationResult(true);
    }

    static error(message: string, location?: string): ValidationResult {
        return new ValidationResult(false, [new ValidationError(message, location)]);
    }

    static warning(message: string, location?: string): ValidationResult {
        const result = new ValidationResult(true);
        result.warnings.push(new ValidationWarning(message, location));
        return result;
    }
}

// Grammar type enumeration
export enum GrammarType {
    DTD = 'dtd',
    XML_SCHEMA = 'xmlschema',
    RELAX_NG = 'relaxng',
    NONE = 'none'
}

// Main Grammar interface
export interface Grammar {
    // Core validation methods
    validateElement(element: QualifiedName, content: ValidationContext): ValidationResult;
    getElementAttributes(element: QualifiedName): Map<QualifiedName, AttributeInfo>;
    getDefaultAttributes(element: QualifiedName): Map<QualifiedName, string>;

    // Entity resolution (for DTD compatibility)
    resolveEntity(name: string): string | undefined;

    // Entity reference tracking (for canonicalization)
    addEntityReferenceUsage(originalReference: string, expandedText: string): void;
    getOriginalEntityReference(expandedText: string): string | undefined;
    clearEntityReferenceTracking(): void;

    // Grammar type identification
    getGrammarType(): GrammarType;

    // Namespace support
    getTargetNamespace(): string | undefined;
    getNamespaceDeclarations(): Map<string, string>;
}