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

import { } from "../grammar/Grammar";
import { SchemaType } from "./SchemaType";
import { XMLSchemaGrammar } from "./XMLSchemaGrammar";
import { XMLUtils } from "../XMLUtils";

export class SchemaElementDecl {
    private name: string;
    private type?: SchemaType;
    private typeName?: string;
    private minOccurs: number = 1;
    private maxOccurs: number | 'unbounded' = 1;
    private nillable: boolean = false;
    private abstract: boolean = false;
    private substitutionGroup?: string;
    private defaultValue?: string;
    private fixedValue?: string;
    private form: 'qualified' | 'unqualified' = 'unqualified';

    constructor(name: string) {
        this.validateName(name);
        this.name = name;
    }

    getName(): string {
        return this.name;
    }

    setName(name: string): void {
        this.name = name;
    }

    getType(): SchemaType | undefined {
        return this.type;
    }

    setType(type: SchemaType): void {
        this.type = type;
    }

    getTypeName(): string | undefined {
        return this.typeName;
    }

    setTypeName(typeName: string): void {
        this.typeName = typeName;
    }

    getMinOccurs(): number {
        return this.minOccurs;
    }

    setMinOccurs(minOccurs: number): void {
        this.validateOccurrence(minOccurs, this.maxOccurs);
        this.minOccurs = minOccurs;
    }

    getMaxOccurs(): number | 'unbounded' {
        return this.maxOccurs;
    }

    setMaxOccurs(maxOccurs: number | 'unbounded'): void {
        this.validateOccurrence(this.minOccurs, maxOccurs);
        this.maxOccurs = maxOccurs;
    }

    isNillable(): boolean {
        return this.nillable;
    }

    setNillable(nillable: boolean): void {
        this.nillable = nillable;
    }

    isAbstract(): boolean {
        return this.abstract;
    }

    setAbstract(abstract: boolean): void {
        this.abstract = abstract;
    }

    getSubstitutionGroup(): string | undefined {
        return this.substitutionGroup;
    }

    setSubstitutionGroup(substitutionGroup: string): void {
        this.substitutionGroup = substitutionGroup;
    }

    getDefaultValue(): string | undefined {
        return this.defaultValue;
    }

    setDefaultValue(value: string): void {
        this.validateValueConstraints(value, this.fixedValue);
        this.defaultValue = value;
    }

    getFixedValue(): string | undefined {
        return this.fixedValue;
    }

    setFixedValue(value: string): void {
        this.validateValueConstraints(this.defaultValue, value);
        this.fixedValue = value;
    }

    getForm(): 'qualified' | 'unqualified' {
        return this.form;
    }

    setForm(form: 'qualified' | 'unqualified'): void {
        this.form = form;
    }

    hasDefaultValue(): boolean {
        return this.defaultValue !== undefined || this.fixedValue !== undefined;
    }

    getEffectiveDefaultValue(): string | undefined {
        return this.fixedValue || this.defaultValue;
    }

    // Resolve type from grammar if type name is set but type object is not
    resolveType(grammar: XMLSchemaGrammar): SchemaType | undefined {
        if (this.type) {
            return this.type;
        }
        
        if (this.typeName) {
            return grammar.getTypeDefinition(this.typeName);
        }
        
        return undefined;
    }

    // Schema validation methods
    
    private validateName(name: string): void {
        if (!name) {
            throw new Error('Element name cannot be empty');
        }
        
        // XML Schema spec: Element names must be valid NCNames (no spaces, no colons except for qualified names)
        // Check for invalid characters first (like spaces)
        if (name.includes(' ') || name.includes('\t') || name.includes('\n') || name.includes('\r')) {
            throw new Error(`Element name '${name}' contains invalid whitespace characters - XML Schema element names must be valid NCNames`);
        }
        
        // Skip validation for Clark notation (expanded QNames like {namespace}localName)
        if (name.startsWith('{')) {
            const closeBrace = name.indexOf('}');
            if (closeBrace !== -1) {
                // This is Clark notation - only validate the local name part
                const localName = name.substring(closeBrace + 1);
                if (!XMLUtils.isValidNCName(localName)) {
                    throw new Error(`Element local name '${localName}' is not a valid NCName`);
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
                throw new Error(`Element name prefix '${prefix}' is not a valid NCName`);
            }
            if (!XMLUtils.isValidNCName(localName)) {
                throw new Error(`Element name local part '${localName}' is not a valid NCName`);
            }
        } else {
            // Simple NCName - must be valid
            if (!XMLUtils.isValidNCName(name)) {
                throw new Error(`Element name '${name}' is not a valid NCName - XML Schema element names cannot contain spaces or invalid characters`);
            }
        }
    }

    private validateOccurrence(minOccurs: number, maxOccurs: number | 'unbounded'): void {
        if (minOccurs < 0) {
            throw new Error(`minOccurs must be non-negative, got ${minOccurs}`);
        }
        if (maxOccurs !== 'unbounded' && typeof maxOccurs === 'number' && maxOccurs < minOccurs) {
            throw new Error(`maxOccurs (${maxOccurs}) must be greater than or equal to minOccurs (${minOccurs})`);
        }
    }

    private validateValueConstraints(defaultValue?: string, fixedValue?: string): void {
        // Schema spec: element cannot have both default and fixed values
        if (defaultValue !== undefined && fixedValue !== undefined) {
            throw new Error('Element cannot have both default and fixed values');
        }
    }

    validate(): void {
        // Comprehensive validation of element declaration
        this.validateName(this.name);
        this.validateOccurrence(this.minOccurs, this.maxOccurs);
        this.validateValueConstraints(this.defaultValue, this.fixedValue);
        
        // Schema spec: abstract elements cannot have default/fixed values
        if (this.abstract && (this.defaultValue !== undefined || this.fixedValue !== undefined)) {
            throw new Error('Abstract elements cannot have default or fixed values');
        }
        
        // Schema spec: elements with type and inline type are mutually exclusive
        if (this.type !== undefined && this.typeName !== undefined) {
            throw new Error('Element cannot have both inline type and type reference');
        }
    }
}