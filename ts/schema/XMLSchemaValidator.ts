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

import { ValidationContext, ValidationError, ValidationResult } from "../grammar/Grammar";
import { XMLAttribute } from "../XMLAttribute";
import { ComplexType } from "./ComplexType";
import { SimpleType } from "./SimpleType";
import { XMLSchemaGrammar } from "./XMLSchemaGrammar";

export class XMLSchemaValidator {
    private grammar?: XMLSchemaGrammar;
    
    // Validation state - tracks element hierarchy during validation
    private elementStack: Array<{
        name: string;
        childrenNames: string[];  // Changed from QualifiedName[] to string[]
        textContent: string;
        attributes: Map<string, string>;
        startValidated: boolean;
    }> = [];
    
    private namespaceStack: Array<Map<string, string>> = [];
    private currentNamespaces: Map<string, string> = new Map();

    constructor(grammar?: XMLSchemaGrammar) {
        if (grammar) {
            this.grammar = grammar;
        }
        this.initializeNamespaces();
    }

    setGrammar(grammar: XMLSchemaGrammar): void {
        this.grammar = grammar;
    }

    getGrammar(): XMLSchemaGrammar | undefined {
        return this.grammar;
    }

    startElement(name: string, attributes: XMLAttribute[]): ValidationResult {
        if (!this.grammar) {
            return ValidationResult.success();
        }

        // Process namespace declarations and update namespace context
        this.pushNamespaceContext();
        this.processNamespaceDeclarations(attributes);

        // Resolve qualified name
        const qname: string = name;
        
        // Convert attributes to string map
        const attributeMap: Map<string, string> = new Map<string, string>();
        for (const attr of attributes) {
            if (!attr.getName().startsWith('xmlns')) { // Skip namespace declarations
                const attrName: string = attr.getName();
                attributeMap.set(attrName, attr.getValue());
            }
        }

        // Create element context
        const elementContext: {
            name: string;
            childrenNames: string[];
            textContent: string;
            attributes: Map<string, string>;
            startValidated: boolean;
        } = {
            name: qname,
            childrenNames: [] as string[],  
            textContent: '',
            attributes: attributeMap,
            startValidated: false
        };

        // Add to parent's children list if we have a parent
        if (this.elementStack.length > 0) {
            const parent: {
                name: string;
                childrenNames: string[];
                textContent: string;
                attributes: Map<string, string>;
                startValidated: boolean;
            } = this.elementStack[this.elementStack.length - 1];
            parent.childrenNames.push(qname.toString());
        }

        // Push to element stack
        this.elementStack.push(elementContext);

        // Validate element declaration and attributes
        const result: ValidationResult = this.validateElementStart(qname, attributeMap);
        elementContext.startValidated = result.isValid;

        return result;
    }

    characters(text: string): void {
        if (this.elementStack.length > 0) {
            const current: {
                name: string;
                childrenNames: string[];
                textContent: string;
                attributes: Map<string, string>;
                startValidated: boolean;
            } = this.elementStack[this.elementStack.length - 1];
            current.textContent += text;
        }
    }

    endElement(name: string): ValidationResult {
        if (!this.grammar || this.elementStack.length === 0) {
            return ValidationResult.success();
        }

        const elementContext: {
            name: string;
            childrenNames: string[];
            textContent: string;
            attributes: Map<string, string>;
            startValidated: boolean;
        } = this.elementStack.pop()!;
        const qname: string = name;

        // Verify element name matches
        if (elementContext.name !== qname) {
            return ValidationResult.error(`Element name mismatch: expected ${elementContext.name}, got ${qname}`);
        }

        // Validate element content only if start element validation succeeded
        let result: ValidationResult = ValidationResult.success();
        if (elementContext.startValidated) {
            result = this.validateElementContent(elementContext);
        }

        // Pop namespace context
        this.popNamespaceContext();

        return result;
    }

    reset(): void {
        this.elementStack = [];
        this.namespaceStack = [];
        this.initializeNamespaces();
    }

    // Private validation methods
    private validateElementStart(qname: string, attributes: Map<string, string>): ValidationResult {
        if (!this.grammar) return ValidationResult.success();

        const errors: ValidationError[] = [];

        // Create validation context for element and attribute validation
        const context: ValidationContext = {
            attributes: attributes,
            childrenNames: [],
            textContent: '',
            attributeOnly: true // Only validate attributes at element start
        };

        // Validate element declaration exists
        const elementResult: ValidationResult = this.grammar.validateElement(qname, context);
        if (!elementResult.isValid) {
            errors.push(...elementResult.errors);
        }

        // Validate attributes if element declaration is valid
        if (elementResult.isValid) {
            const attrResult: ValidationResult = this.grammar.validateAttributes(qname, attributes, context);
            if (!attrResult.isValid) {
                errors.push(...attrResult.errors);
            }
        }

        return errors.length > 0 ? new ValidationResult(false, errors) : ValidationResult.success();
    }

    private validateElementContent(elementContext: { 
        name: string; 
        childrenNames: string[];  // Changed from QualifiedName[] to string[]
        textContent: string; 
        attributes: Map<string, string> 
    }): ValidationResult {
        if (!this.grammar) return ValidationResult.success();

        // Create full validation context
        const context: ValidationContext = {
            attributes: elementContext.attributes,
            childrenNames: elementContext.childrenNames,  // Updated property name
            textContent: elementContext.textContent,
            attributeOnly: false
        };

        // Validate element content
        // Use string names directly for the method call
        const children: string[] = elementContext.childrenNames;
        return this.grammar.validateElementContent(
            elementContext.name, 
            children, 
            elementContext.textContent, 
            context
        );
    }

    private processNamespaceDeclarations(attributes: XMLAttribute[]): void {
        for (const attr of attributes) {
            const name: string = attr.getName();
            const value: string = attr.getValue();
            
            if (name === 'xmlns') {
                // Default namespace declaration
                this.currentNamespaces.set('', value);
            } else if (name.startsWith('xmlns:')) {
                // Prefixed namespace declaration
                const prefix: string = name.substring(6);
                this.currentNamespaces.set(prefix, value);
            }
        }
    }

    private pushNamespaceContext(): void {
        // Save current namespace context
        this.namespaceStack.push(new Map(this.currentNamespaces));
    }

    private popNamespaceContext(): void {
        // Restore previous namespace context
        if (this.namespaceStack.length > 0) {
            this.currentNamespaces = this.namespaceStack.pop()!;
        }
    }

    private initializeNamespaces(): void {
        this.currentNamespaces = new Map();
        // Set standard XML namespace
        this.currentNamespaces.set('xml', 'http://www.w3.org/XML/1998/namespace');
    }


    validateAttributesForGrammar(elementName: string, attributes: Map<string, string>, complexType?: ComplexType): ValidationResult {
        if (!complexType) {
            return ValidationResult.success();
        }

        const declaredAttrs = complexType.getAttributes();
        const errors: ValidationError[] = [];

        // Convert attribute maps to use string keys for easier comparison
        const attributesByKey: Map<string, string> = new Map<string, string>();
        const attributeEntries: [string, string][] = Array.from(attributes.entries());
        for (const [qname, value] of attributeEntries) {
            const key: string = this.getQualifiedKey(qname);
            attributesByKey.set(key, value);
        }

        const declaredAttrsByKey: Map<string, any> = new Map<string, any>();
        const declaredAttrEntries: [string, any][] = Array.from(declaredAttrs.entries());
        for (const [qname, attrDecl] of declaredAttrEntries) {
            const key: string = this.getQualifiedKey(qname);
            declaredAttrsByKey.set(key, attrDecl);
        }

        // Check required attributes
        const declaredAttrEntries2: [string, any][] = Array.from(declaredAttrs.entries());
        for (const [name, attrDecl] of declaredAttrEntries2) {
            const key: string = this.getQualifiedKey(name);
            if (attrDecl.getUse() === 'required' && !attributesByKey.has(key)) {
                errors.push(new ValidationError(`Required attribute '${name.toString()}' is missing`));
            }
        }

        // Check prohibited attributes
        const attributeEntries2: [string, string][] = Array.from(attributes.entries());
        for (const [name] of attributeEntries2) {
            const key: string = this.getQualifiedKey(name);
            const attrDecl: any = declaredAttrsByKey.get(key);
            if (attrDecl && attrDecl.getUse() === 'prohibited') {
                errors.push(new ValidationError(`Prohibited attribute '${name.toString()}' is present`));
            }
        }

        // Validate attribute values and check for undeclared attributes
        const attributeEntries3: [string, string][] = Array.from(attributes.entries());
        for (const [name, value] of attributeEntries3) {
            const key: string = this.getQualifiedKey(name);
            const attrDecl: any = declaredAttrsByKey.get(key);
            if (attrDecl) {
                // Validate declared attribute value
                const resolvedType: any = attrDecl.resolveType(this.grammar);
                
                // Check fixed value constraint
                const fixedValue: string | undefined = attrDecl.getFixedValue();
                if (fixedValue && value !== fixedValue) {
                    errors.push(new ValidationError(`Attribute '${name.toString()}' has fixed value '${fixedValue}' but got '${value}'`));
                    continue; // Skip further validation if fixed value doesn't match
                }
                
                if (resolvedType && resolvedType.isSimpleType()) {
                    const valueResult: ValidationResult = this.validateSimpleType(value, resolvedType as SimpleType);
                    if (!valueResult.isValid) {
                        errors.push(...valueResult.errors);
                    }
                }
            } else {
                // Check if undeclared attribute is allowed
                if (!complexType.getAllowsAnyAttributes()) {
                    // Check if it's a namespace declaration or xml: attribute (always allowed)
                    const colonIndex: number = name.indexOf(':');
                    const localName: string = colonIndex >= 0 ? name.substring(colonIndex + 1) : name;
                    const prefix: string = colonIndex >= 0 ? name.substring(0, colonIndex) : '';
                    const namespaceURI: string = this.currentNamespaces.get(prefix) || '';
                    
                    if (localName !== 'xmlns' && 
                        !name.startsWith('xmlns:') && 
                        namespaceURI !== 'http://www.w3.org/XML/1998/namespace' &&
                        namespaceURI !== 'http://www.w3.org/2001/XMLSchema-instance') {
                        errors.push(new ValidationError(`Undeclared attribute '${name}' not allowed`));
                    }
                }
            }
        }

        return errors.length > 0 ? new ValidationResult(false, errors) : ValidationResult.success();
    }

    validateSimpleType(textContent: string, simpleType: SimpleType): ValidationResult {
        const errors: ValidationError[] = [];

        // Use custom validator if available (for built-in types)
        if (simpleType.hasCustomValidator()) {
            const customResult: ValidationResult = simpleType.getCustomValidator()!(textContent);
            if (!customResult.isValid) {
                return customResult;
            }
        }

        // Check enumeration constraints
        if (simpleType.hasEnumeration()) {
            if (!simpleType.getEnumeration().includes(textContent)) {
                errors.push(new ValidationError(`Value '${textContent}' is not in enumeration`));
            }
        }

        // Check pattern constraints
        if (simpleType.hasPattern()) {
            const patterns: RegExp[] = simpleType.getPatterns();
            let matches: boolean = false;
            for (const pattern of patterns) {
                if (pattern.test(textContent)) {
                    matches = true;
                    break;
                }
            }
            if (!matches) {
                errors.push(new ValidationError(`Value '${textContent}' does not match required pattern`));
            }
        }

        // Check length constraints
        if (simpleType.hasLength() && textContent.length !== simpleType.getLength()) {
            errors.push(new ValidationError(`Value length must be exactly ${simpleType.getLength()} characters`));
        }
        if (simpleType.hasMinLength() && textContent.length < simpleType.getMinLength()) {
            errors.push(new ValidationError(`Value too short (minimum ${simpleType.getMinLength()} characters)`));
        }
        if (simpleType.hasMaxLength() && textContent.length > simpleType.getMaxLength()) {
            errors.push(new ValidationError(`Value too long (maximum ${simpleType.getMaxLength()} characters)`));
        }

        // Check numeric range constraints
        if (simpleType.isNumericType()) {
            const numericValue: number = parseFloat(textContent);
            if (isNaN(numericValue)) {
                errors.push(new ValidationError(`Invalid numeric value: '${textContent}'`));
            } else {
                if (simpleType.hasMinInclusive() && numericValue < simpleType.getMinInclusive()) {
                    errors.push(new ValidationError(`Value too small (minimum ${simpleType.getMinInclusive()})`));
                }
                if (simpleType.hasMaxInclusive() && numericValue > simpleType.getMaxInclusive()) {
                    errors.push(new ValidationError(`Value too large (maximum ${simpleType.getMaxInclusive()})`));
                }
                if (simpleType.hasMinExclusive() && numericValue <= simpleType.getMinExclusive()) {
                    errors.push(new ValidationError(`Value must be greater than ${simpleType.getMinExclusive()}`));
                }
                if (simpleType.hasMaxExclusive() && numericValue >= simpleType.getMaxExclusive()) {
                    errors.push(new ValidationError(`Value must be less than ${simpleType.getMaxExclusive()}`));
                }
            }
        }

        return errors.length > 0 ? new ValidationResult(false, errors) : ValidationResult.success();
    }

    private getQualifiedKey(name: string): string {
        const colonIndex: number = name.indexOf(':');
        if (colonIndex >= 0) {
            const prefix: string = name.substring(0, colonIndex);
            const localName: string = name.substring(colonIndex + 1);
            const namespaceURI: string = this.currentNamespaces.get(prefix) || '';
            return namespaceURI ? `{${namespaceURI}}${localName}` : localName;
        }
        return name;
    }
}