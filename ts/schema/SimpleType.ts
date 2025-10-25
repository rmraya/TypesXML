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

import { SchemaType } from "./SchemaType";
import { ValidationResult } from "../grammar/Grammar";
import { XMLUtils } from "../XMLUtils";

export class SimpleType extends SchemaType {
    private variety: 'atomic' | 'list' | 'union' = 'atomic';
    private restrictions: Map<string, string> = new Map();
    private enumeration?: string[];
    private patterns?: RegExp[];
    private minLength?: number;
    private maxLength?: number;
    private length?: number;
    private minInclusive?: string;
    private maxInclusive?: string;
    private minExclusive?: string;
    private maxExclusive?: string;
    private totalDigits?: number;
    private fractionDigits?: number;
    private whiteSpace?: 'preserve' | 'replace' | 'collapse';
    private customValidator?: (value: string) => ValidationResult;
    private typeName?: string; // For unresolved type references
    private unionMemberTypes?: string[]; // For union types
    private listItemType?: string; // For list types

    constructor(name?: string, targetNamespace?: string) {
        super(name, targetNamespace);
        if (name) {
            this.validateName(name);
        }
    }

    isSimpleType(): boolean {
        return true;
    }

    isComplexType(): boolean {
        return false;
    }

    getVariety(): 'atomic' | 'list' | 'union' {
        return this.variety;
    }

    setVariety(variety: 'atomic' | 'list' | 'union'): void {
        this.variety = variety;
    }

    addRestriction(facet: string, value: string): void {
        this.validateFacet(facet, value);
        this.restrictions.set(facet, value);
        
        // Set specific properties for known facets
        switch (facet) {
            case 'enumeration':
                if (!this.enumeration) {
                    this.enumeration = [];
                }
                this.enumeration.push(value);
                break;
            case 'pattern':
                if (!this.patterns) {
                    this.patterns = [];
                }
                this.patterns.push(new RegExp(value));
                break;
            case 'minLength':
                this.minLength = parseInt(value);
                break;
            case 'maxLength':
                this.maxLength = parseInt(value);
                break;
            case 'length':
                this.length = parseInt(value);
                break;
            case 'minInclusive':
                this.minInclusive = value;
                break;
            case 'maxInclusive':
                this.maxInclusive = value;
                break;
            case 'minExclusive':
                this.minExclusive = value;
                break;
            case 'maxExclusive':
                this.maxExclusive = value;
                break;
            case 'totalDigits':
                this.totalDigits = parseInt(value);
                break;
            case 'fractionDigits':
                this.fractionDigits = parseInt(value);
                break;
            case 'whiteSpace':
                this.whiteSpace = value as 'preserve' | 'replace' | 'collapse';
                break;
        }
    }

    hasEnumeration(): boolean {
        return this.enumeration !== undefined && this.enumeration.length > 0;
    }

    getEnumeration(): string[] {
        return this.enumeration || [];
    }

    hasPattern(): boolean {
        return this.patterns !== undefined && this.patterns.length > 0;
    }

    getPatterns(): RegExp[] {
        return this.patterns || [];
    }

    hasMinLength(): boolean {
        return this.minLength !== undefined;
    }

    getMinLength(): number {
        return this.minLength || 0;
    }

    hasMaxLength(): boolean {
        return this.maxLength !== undefined;
    }

    getMaxLength(): number {
        return this.maxLength || Number.MAX_SAFE_INTEGER;
    }

    hasLength(): boolean {
        return this.length !== undefined;
    }

    getLength(): number {
        return this.length || 0;
    }

    hasMinInclusive(): boolean {
        return this.minInclusive !== undefined;
    }

    getMinInclusive(): number {
        return parseFloat(this.minInclusive || '0');
    }

    hasMaxInclusive(): boolean {
        return this.maxInclusive !== undefined;
    }

    getMaxInclusive(): number {
        return parseFloat(this.maxInclusive || '0');
    }

    hasMinExclusive(): boolean {
        return this.minExclusive !== undefined;
    }

    getMinExclusive(): number {
        return parseFloat(this.minExclusive || '0');
    }

    hasMaxExclusive(): boolean {
        return this.maxExclusive !== undefined;
    }

    getMaxExclusive(): number {
        return parseFloat(this.maxExclusive || '0');
    }

    isNumericType(): boolean {
        if (!this.baseType || !this.baseType.getName()) {
            return false;
        }
        
        const fullTypeName = this.baseType.getName()!;
        const colonIndex = fullTypeName.indexOf(':');
        const baseTypeName = colonIndex >= 0 ? fullTypeName.substring(colonIndex + 1) : fullTypeName;
        return ['decimal', 'integer', 'float', 'double', 'byte', 'short', 'int', 'long', 
                'unsignedByte', 'unsignedShort', 'unsignedInt', 'unsignedLong',
                'positiveInteger', 'nonPositiveInteger', 'negativeInteger', 'nonNegativeInteger']
                .includes(baseTypeName);
    }

    setCustomValidator(validator: (value: string) => ValidationResult): void {
        this.customValidator = validator;
    }

    getCustomValidator(): ((value: string) => ValidationResult) | undefined {
        return this.customValidator;
    }

    hasCustomValidator(): boolean {
        return this.customValidator !== undefined;
    }

    setTypeName(typeName: string): void {
        this.typeName = typeName;
    }

    getTypeName(): string | undefined {
        return this.typeName;
    }

    getUnionMemberTypes(): string[] | undefined {
        return this.unionMemberTypes;
    }

    setUnionMemberTypes(types: string[]): void {
        this.unionMemberTypes = types;
        this.variety = 'union';
    }

    getListItemType(): string | undefined {
        return this.listItemType;
    }

    setListItemType(itemType: string): void {
        this.validateTypeReference(itemType);
        this.listItemType = itemType;
        this.variety = 'list';
    }

    // Schema validation methods
    
    private validateName(name: string): void {
        if (!name) {
            throw new Error('SimpleType name cannot be empty');
        }
        
        // Skip validation for Clark notation (expanded QNames like {namespace}localName)
        if (name.startsWith('{')) {
            const closeBrace = name.indexOf('}');
            if (closeBrace !== -1) {
                // This is Clark notation - only validate the local name part
                const localName = name.substring(closeBrace + 1);
                if (!XMLUtils.isValidNCName(localName)) {
                    throw new Error(`SimpleType local name '${localName}' is not a valid NCName`);
                }
                return;
            }
        }
        
        // Handle qualified names (prefix:localName) vs NCNames
        const colonIndex = name.indexOf(':');
        if (colonIndex !== -1) {
            // Qualified name - validate both prefix and local name as NCNames
            const prefix = name.substring(0, colonIndex);
            const localName = name.substring(colonIndex + 1);
            
            if (!XMLUtils.isValidNCName(prefix)) {
                throw new Error(`SimpleType name prefix '${prefix}' is not a valid NCName`);
            }
            if (!XMLUtils.isValidNCName(localName)) {
                throw new Error(`SimpleType name local part '${localName}' is not a valid NCName`);
            }
        } else {
            // Simple NCName
            if (!XMLUtils.isValidNCName(name)) {
                throw new Error(`SimpleType name '${name}' is not a valid NCName`);
            }
        }
    }

    private validateFacet(facet: string, value: string): void {
        // Validate facet name
        const validFacets = [
            'enumeration', 'pattern', 'minLength', 'maxLength', 'length',
            'minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive',
            'totalDigits', 'fractionDigits', 'whiteSpace'
        ];
        
        if (!validFacets.includes(facet)) {
            throw new Error(`Unknown facet: ${facet}`);
        }
        
        // Validate facet values
        switch (facet) {
            case 'minLength':
            case 'maxLength':
            case 'length':
            case 'totalDigits':
            case 'fractionDigits':
                const numValue = parseInt(value);
                if (isNaN(numValue) || numValue < 0) {
                    throw new Error(`Facet ${facet} must be a non-negative integer, got '${value}'`);
                }
                break;
            case 'minInclusive':
            case 'maxInclusive':
            case 'minExclusive':
            case 'maxExclusive':
                // Values will be validated against base type during processing
                break;
            case 'whiteSpace':
                if (!['preserve', 'replace', 'collapse'].includes(value)) {
                    throw new Error(`WhiteSpace facet must be 'preserve', 'replace', or 'collapse', got '${value}'`);
                }
                break;
            case 'pattern':
                try {
                    new RegExp(value);
                } catch (error) {
                    throw new Error(`Invalid regex pattern: ${value}`);
                }
                break;
        }
    }

    private validateTypeReference(typeRef: string): void {
        if (!typeRef) {
            throw new Error('Type reference cannot be empty');
        }
        
        // Handle qualified names vs local names
        const colonIndex = typeRef.indexOf(':');
        if (colonIndex !== -1) {
            // Qualified name - validate both prefix and local name as NCNames
            const prefix = typeRef.substring(0, colonIndex);
            const localName = typeRef.substring(colonIndex + 1);
            
            if (!XMLUtils.isValidNCName(prefix)) {
                throw new Error(`Type reference prefix '${prefix}' is not a valid NCName`);
            }
            if (!XMLUtils.isValidNCName(localName)) {
                throw new Error(`Type reference local part '${localName}' is not a valid NCName`);
            }
        } else {
            // Simple name - check if it's built-in or validate as NCName
            if (!this.isBuiltInType(typeRef) && !XMLUtils.isValidNCName(typeRef)) {
                throw new Error(`Type reference '${typeRef}' is not valid`);
            }
        }
    }

    private isBuiltInType(typeName: string): boolean {
        const builtInTypes = [
            'string', 'boolean', 'decimal', 'float', 'double', 'duration', 'dateTime', 'time', 'date',
            'gYearMonth', 'gYear', 'gMonthDay', 'gDay', 'gMonth', 'hexBinary', 'base64Binary', 'anyURI',
            'QName', 'NOTATION', 'normalizedString', 'token', 'language', 'NMTOKEN', 'NMTOKENS', 'Name',
            'NCName', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'integer', 'nonPositiveInteger',
            'negativeInteger', 'long', 'int', 'short', 'byte', 'nonNegativeInteger', 'unsignedLong',
            'unsignedInt', 'unsignedShort', 'unsignedByte', 'positiveInteger', 'anySimpleType'
        ];
        return builtInTypes.includes(typeName);
    }

    validate(): void {
        // Comprehensive validation of simple type definition
        if (this.getName()) {
            this.validateName(this.getName()!);
        }
        
        // Validate variety-specific constraints
        switch (this.variety) {
            case 'list':
                if (!this.listItemType) {
                    throw new Error('List simple type must have itemType defined');
                }
                this.validateTypeReference(this.listItemType);
                break;
            case 'union':
                if (!this.unionMemberTypes || this.unionMemberTypes.length === 0) {
                    throw new Error('Union simple type must have memberTypes defined');
                }
                for (const memberType of this.unionMemberTypes) {
                    this.validateTypeReference(memberType);
                }
                break;
        }
        
        // Validate facet combinations and constraints
        if (this.length !== undefined && (this.minLength !== undefined || this.maxLength !== undefined)) {
            throw new Error('Length facet cannot be used with minLength or maxLength');
        }
        
        if (this.minLength !== undefined && this.maxLength !== undefined && this.minLength > this.maxLength) {
            throw new Error(`minLength (${this.minLength}) cannot be greater than maxLength (${this.maxLength})`);
        }
        
        if (this.totalDigits !== undefined && this.fractionDigits !== undefined && 
            this.fractionDigits > this.totalDigits) {
            throw new Error(`fractionDigits (${this.fractionDigits}) cannot be greater than totalDigits (${this.totalDigits})`);
        }
        
        // Validate range constraints
        const hasMinInclusive = this.minInclusive !== undefined;
        const hasMaxInclusive = this.maxInclusive !== undefined;
        const hasMinExclusive = this.minExclusive !== undefined;
        const hasMaxExclusive = this.maxExclusive !== undefined;
        
        if ((hasMinInclusive && hasMinExclusive) || (hasMaxInclusive && hasMaxExclusive)) {
            throw new Error('Cannot specify both inclusive and exclusive bounds for the same limit');
        }
        
        // Validate numeric range consistency if both bounds are specified
        if ((hasMinInclusive || hasMinExclusive) && (hasMaxInclusive || hasMaxExclusive)) {
            const minValue = hasMinInclusive ? parseFloat(this.minInclusive!) : parseFloat(this.minExclusive!);
            const maxValue = hasMaxInclusive ? parseFloat(this.maxInclusive!) : parseFloat(this.maxExclusive!);
            
            if (!isNaN(minValue) && !isNaN(maxValue)) {
                if (minValue > maxValue || 
                    (hasMinExclusive && hasMaxExclusive && minValue >= maxValue)) {
                    throw new Error('Invalid range: minimum bound must be less than maximum bound');
                }
            }
        }
    }
}