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
import { SchemaFacets, SchemaTypeValidator } from './SchemaTypeValidator.js';

export class SchemaAttributeDecl {

    private name: string;
    private namespace: string | undefined;
    private type: string;
    private use: AttributeUse;
    private defaultValue: string | undefined;
    private fixedValue: string | undefined;
    private facets: SchemaFacets;
    private unionAlternatives: Array<{facets: SchemaFacets, baseType: string}>;

    constructor(
        name: string,
        type: string = 'string',
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
        this.facets = {};
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
        this.facets.enumeration = values.slice();
    }

    getEnumeration(): string[] {
        return this.facets.enumeration || [];
    }

    setPatterns(values: string[][]): void {
        this.facets.patterns = values.slice();
    }

    setMinInclusive(value: string): void {
        this.facets.minInclusive = value;
    }

    setMaxInclusive(value: string): void {
        this.facets.maxInclusive = value;
    }

    setMinExclusive(value: string): void {
        this.facets.minExclusive = value;
    }

    setMaxExclusive(value: string): void {
        this.facets.maxExclusive = value;
    }

    setLength(value: number): void {
        this.facets.length = value;
    }

    setMinLength(value: number): void {
        this.facets.minLength = value;
    }

    setMaxLength(value: number): void {
        this.facets.maxLength = value;
    }

    setTotalDigits(value: number): void {
        this.facets.totalDigits = value;
    }

    setFractionDigits(value: number): void {
        this.facets.fractionDigits = value;
    }

    setWhiteSpace(value: string): void {
        this.facets.whiteSpace = value;
    }

    setIsList(value: boolean): void {
        this.facets.isList = value;
    }

    setUnionAlternatives(alts: Array<{facets: SchemaFacets, baseType: string}>): void {
        this.unionAlternatives = alts.slice();
    }

    isValid(value: string): boolean {
        if (this.fixedValue !== undefined && value !== this.fixedValue) {
            return false;
        }
        if (this.unionAlternatives.length > 0) {
            for (let i: number = 0; i < this.unionAlternatives.length; i++) {
                const alt: {facets: SchemaFacets, baseType: string} = this.unionAlternatives[i];
                if (SchemaTypeValidator.validate(value, alt.baseType) && SchemaTypeValidator.validateFacets(value, alt.facets, alt.baseType)) {
                    return true;
                }
            }
            return false;
        }
        if (!SchemaTypeValidator.validateFacets(value, this.facets, this.type)) {
            return false;
        }
        let normalized: string = value;
        if (this.facets.whiteSpace === 'replace') {
            normalized = value.replaceAll(/[\t\n\r]/g, ' ');
        } else if (this.facets.whiteSpace === 'collapse') {
            normalized = value.replaceAll(/[\t\n\r ]+/g, ' ').trim();
        }
        return SchemaTypeValidator.validate(normalized, this.type);
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
