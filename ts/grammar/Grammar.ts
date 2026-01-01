/*******************************************************************************
 * Copyright (c) 2023-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

// Unified attribute information
export class AttributeInfo {
    constructor(
        public name: string,
        public datatype: string,
        public use: AttributeUse,
        public defaultValue?: string,
        public fixedValue?: string,
        public namespace?: string | null
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
        public childrenNames: string[],
        public attributes: Map<string, string>,
        public parent?: string,
        public attributeOnly: boolean = false
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
    validateElement(element: string, children: string[]): ValidationResult;
    validateAttributes(element: string, attributes: Map<string, string>): ValidationResult;
    getElementAttributes(element: string): Map<string, AttributeInfo>;
    getDefaultAttributes(element: string): Map<string, string>;

    // Entity resolution (for DTD compatibility)
    resolveEntity(name: string): string | undefined;

    // Grammar type identification
    getGrammarType(): GrammarType;

    // Namespace support
    getTargetNamespace(): string | undefined;
    getNamespaceDeclarations(): Map<string, string>;

}