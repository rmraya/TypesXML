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

import { AttributeInfo, AttributeUse } from "../grammar/Grammar";
import { SimpleType } from "./SimpleType";
import { XMLSchemaGrammar } from "./XMLSchemaGrammar";
import { XMLUtils } from "../XMLUtils";

export class SchemaAttributeDecl {
    private name: string;
    private type: SimpleType;
    private use: 'required' | 'optional' | 'prohibited' = 'optional';
    private defaultValue?: string;
    private fixedValue?: string;
    private form: 'qualified' | 'unqualified' = 'unqualified';

    constructor(name: string, type: SimpleType) {
        this.validateName(name);
        this.name = name;
        this.type = type;
    }

    getName(): string {
        return this.name;
    }

    setName(name: string): void {
        this.name = name;
    }

    getType(): SimpleType {
        return this.type;
    }

    setType(type: SimpleType): void {
        this.type = type;
    }

    getUse(): 'required' | 'optional' | 'prohibited' {
        return this.use;
    }

    setUse(use: 'required' | 'optional' | 'prohibited'): void {
        this.use = use;
    }

    getDefaultValue(): string | undefined {
        return this.defaultValue;
    }

    setDefaultValue(value: string): void {
        this.validateValueConstraints(value, this.fixedValue, this.use);
        this.defaultValue = value;
    }

    getFixedValue(): string | undefined {
        return this.fixedValue;
    }

    setFixedValue(value: string): void {
        this.validateValueConstraints(this.defaultValue, value, this.use);
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

    // Convert to Grammar framework AttributeInfo
    toAttributeInfo(): AttributeInfo {
        let attributeUse: AttributeUse;
        switch (this.use) {
            case 'required':
                attributeUse = AttributeUse.REQUIRED;
                break;
            case 'prohibited':
                attributeUse = AttributeUse.PROHIBITED;
                break;
            default:
                attributeUse = AttributeUse.OPTIONAL;
                break;
        }

        const fullTypeName = this.type.getName() || 'string';
        const colonIndex = fullTypeName.indexOf(':');
        const typeName = colonIndex >= 0 ? fullTypeName.substring(colonIndex + 1) : fullTypeName;

        return new AttributeInfo(
            this.name, 
            typeName, 
            attributeUse, 
            this.defaultValue,  // Pass defaultValue as 4th parameter
            this.fixedValue     // Pass fixedValue as 5th parameter
        );
    }

    // Resolve type from grammar if type name is set but needs resolution
    resolveType(grammar: XMLSchemaGrammar): SimpleType {
        // If type has a type name that needs resolution, try to resolve it
        const typeName = this.type.getTypeName();
        if (typeName) {
            const resolvedType = grammar.getTypeDefinition(typeName);
            if (resolvedType && resolvedType.isSimpleType()) {
                return resolvedType as SimpleType;
            }
        }
        
        return this.type;
    }

    // Schema validation methods
    
    private validateName(name: string): void {
        if (!name) {
            throw new Error('Attribute name cannot be empty');
        }
        
        // Skip validation for Clark notation (expanded QNames like {namespace}localName)
        if (name.startsWith('{')) {
            const closeBrace = name.indexOf('}');
            if (closeBrace !== -1) {
                // This is Clark notation - only validate the local name part
                const localName = name.substring(closeBrace + 1);
                if (!XMLUtils.isValidNCName(localName)) {
                    throw new Error(`Attribute local name '${localName}' is not a valid NCName`);
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
                throw new Error(`Attribute name prefix '${prefix}' is not a valid NCName`);
            }
            if (!XMLUtils.isValidNCName(localName)) {
                throw new Error(`Attribute name local part '${localName}' is not a valid NCName`);
            }
        } else {
            // Simple NCName
            if (!XMLUtils.isValidNCName(name)) {
                throw new Error(`Attribute name '${name}' is not a valid NCName`);
            }
        }
    }

    private validateValueConstraints(defaultValue?: string, fixedValue?: string, use?: string): void {
        // Schema spec: attribute cannot have both default and fixed values
        if (defaultValue !== undefined && fixedValue !== undefined) {
            throw new Error('Attribute cannot have both default and fixed values');
        }
        
        // Schema spec: prohibited attributes cannot have default or fixed values
        if (use === 'prohibited' && (defaultValue !== undefined || fixedValue !== undefined)) {
            throw new Error('Prohibited attributes cannot have default or fixed values');
        }
    }

    validate(): void {
        // Comprehensive validation of attribute declaration
        this.validateName(this.name);
        this.validateValueConstraints(this.defaultValue, this.fixedValue, this.use);
        
        if (!this.type) {
            throw new Error('Attribute must have a type');
        }
    }
}