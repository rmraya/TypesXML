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

import { AttributeInfo, AttributeUse } from '../grammar/Grammar.js';
import { SchemaTypeValidator } from './SchemaTypeValidator.js';

export class SchemaAttributeDecl {

    private name: string;
    private namespace: string | undefined;
    private type: string;
    private use: AttributeUse;
    private defaultValue: string | undefined;
    private fixedValue: string | undefined;
    private enumeration: string[];
    private patterns: string[];
    private minInclusive: number | undefined;
    private maxInclusive: number | undefined;
    private unionAlternatives: Array<{enumerations: string[], patterns: string[]}>;

    constructor(
        name: string,
        type: string = 'xs:string',
        use: AttributeUse = AttributeUse.OPTIONAL,
        defaultValue?: string,
        fixedValue?: string,
        namespace?: string
    ) {
        this.name = name;
        this.namespace = namespace;
        this.type = type;
        this.use = use;
        this.defaultValue = defaultValue;
        this.fixedValue = fixedValue;
        this.enumeration = [];
        this.patterns = [];
        this.minInclusive = undefined;
        this.maxInclusive = undefined;
        this.unionAlternatives = [];
    }

    getName(): string {
        return this.name;
    }

    getNamespace(): string | undefined {
        return this.namespace;
    }

    getType(): string {
        return this.type;
    }

    getUse(): AttributeUse {
        return this.use;
    }

    getDefaultValue(): string | undefined {
        return this.defaultValue;
    }

    getFixedValue(): string | undefined {
        return this.fixedValue;
    }

    setEnumeration(values: string[]): void {
        this.enumeration = values.slice();
    }

    getEnumeration(): string[] {
        return this.enumeration;
    }

    setPatterns(values: string[]): void {
        this.patterns = values.slice();
    }

    setMinInclusive(value: number): void {
        this.minInclusive = value;
    }

    setMaxInclusive(value: number): void {
        this.maxInclusive = value;
    }

    setUnionAlternatives(alts: Array<{enumerations: string[], patterns: string[]}>): void {
        this.unionAlternatives = alts.slice();
    }

    isValid(value: string): boolean {
        if (this.fixedValue !== undefined && value !== this.fixedValue) {
            return false;
        }
        // Union: valid if any member type accepts the value.
        if (this.unionAlternatives.length > 0) {
            for (let i: number = 0; i < this.unionAlternatives.length; i++) {
                const alt: {enumerations: string[], patterns: string[]} = this.unionAlternatives[i];
                const matchesEnum: boolean = alt.enumerations.length === 0 || alt.enumerations.indexOf(value) !== -1;
                const matchesPattern: boolean = alt.patterns.length === 0 || this.testPatterns(value, alt.patterns);
                if (matchesEnum && matchesPattern) {
                    return true;
                }
            }
            return false;
        }
        // Restriction: enumeration check.
        if (this.enumeration.length > 0) {
            let found: boolean = false;
            for (let i: number = 0; i < this.enumeration.length; i++) {
                if (this.enumeration[i] === value) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                return false;
            }
        }
        // Restriction: pattern check.
        if (this.patterns.length > 0 && !this.testPatterns(value, this.patterns)) {
            return false;
        }
        // Restriction: range check.
        if (this.minInclusive !== undefined || this.maxInclusive !== undefined) {
            const num: number = parseFloat(value);
            if (isNaN(num)) {
                return false;
            }
            if (this.minInclusive !== undefined && num < this.minInclusive) {
                return false;
            }
            if (this.maxInclusive !== undefined && num > this.maxInclusive) {
                return false;
            }
        }
        return SchemaTypeValidator.validate(value, this.type);
    }

    private testPatterns(value: string, patterns: string[]): boolean {
        for (let i: number = 0; i < patterns.length; i++) {
            try {
                if (new RegExp('^(?:' + patterns[i] + ')$').test(value)) {
                    return true;
                }
            } catch (e) {
                // Unrecognised XSD regex syntax — skip this pattern.
            }
        }
        return false;
    }

    toAttributeInfo(): AttributeInfo {
        return new AttributeInfo(
            this.name,
            this.type,
            this.use,
            this.defaultValue,
            this.fixedValue,
            this.namespace
        );
    }
}
