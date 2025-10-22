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

import { Grammar, GrammarType, AttributeInfo, ValidationContext, ValidationResult, ValidationError } from "../grammar/Grammar";
import { NotationDecl } from "../dtd/NotationDecl";
import { SchemaType } from "./SchemaType";
import { SimpleType } from "./SimpleType";
import { ComplexType } from "./ComplexType";
import { SchemaElementDecl } from "./Element";
import { SchemaAttributeDecl } from "./Attribute";
import { BuiltinTypes } from "./BuiltinTypes";
import { XMLSchemaValidator } from "./XMLSchemaValidator";
import { ContentModel } from "./ContentModel";
import { XMLUtils } from "../XMLUtils";

export class XMLSchemaGrammar implements Grammar {
    private targetNamespace: string = '';
    private schemaLocation?: string;
    private elementFormDefault: boolean = false;
    private attributeFormDefault: boolean = false;

    // Type definitions
    private types: Map<string, SchemaType> = new Map();

    // Element and attribute declarations
    private elementDeclarations: Map<string, SchemaElementDecl> = new Map();
    private attributeDeclarations: Map<string, SchemaAttributeDecl> = new Map();

    // Group definitions
    private groupDefinitions: Map<string, ContentModel> = new Map();

    // Namespace mappings
    private namespaces: Map<string, string> = new Map();

    // Entity reference tracking for canonicalization compatibility
    private entityReferences: Map<string, string> = new Map();

    // XML Schema validator for validation logic
    private validator: XMLSchemaValidator;
    
    // Validation mode (set by SAXParser)
    private validatingMode: boolean = false;

    constructor(targetNamespace?: string, schemaLocation?: string) {
        if (targetNamespace) {
            this.targetNamespace = targetNamespace;
        }
        if (schemaLocation) {
            this.schemaLocation = schemaLocation;
        }

        // Initialize built-in types
        BuiltinTypes.initialize();

        // Initialize validator with this grammar
        this.validator = new XMLSchemaValidator(this);
    }
    
    setValidating(validating: boolean): void {
        this.validatingMode = validating;
    }
    
    isValidating(): boolean {
        return this.validatingMode;
    }

    getType(): GrammarType {
        return GrammarType.XML_SCHEMA;
    }

    getGrammarType(): GrammarType {
        return GrammarType.XML_SCHEMA;
    }

    getTargetNamespace(): string {
        return this.targetNamespace;
    }

    getNamespaceDeclarations(): Map<string, string> {
        return this.namespaces;
    }

    addNamespaceDeclaration(prefix: string, uri: string): void {
        this.namespaces.set(prefix, uri);
    }

    setTargetNamespace(namespace: string): void {
        this.targetNamespace = namespace;
    }

    getSchemaLocation(): string | undefined {
        return this.schemaLocation;
    }

    setSchemaLocation(location: string): void {
        this.schemaLocation = location;
    }

    setFormDefaults(elementFormDefault: boolean, attributeFormDefault: boolean): void {
        this.elementFormDefault = elementFormDefault;
        this.attributeFormDefault = attributeFormDefault;
    }

    getElementFormDefault(): boolean {
        return this.elementFormDefault;
    }

    getAttributeFormDefault(): boolean {
        return this.attributeFormDefault;
    }

    // Type management
    addTypeDefinition(name: string, type: SchemaType): void {
        this.validateTypeDefinition(name, type);
        this.types.set(name, type);
    }

    getTypeDefinition(name: string): SchemaType | undefined {
        // Handle different name formats: local names, qualified names, and Clark notation
        let resolvedType: SchemaType | undefined;
        
        // First try exact lookup (for local names and already resolved names)
        resolvedType = this.types.get(name);
        if (resolvedType) {
            return resolvedType;
        }
        
        // Handle qualified names (prefix:localName)
        const colonIndex = name.indexOf(':');
        if (colonIndex !== -1) {
            const prefix = name.substring(0, colonIndex);
            const localName = name.substring(colonIndex + 1);
            
            // Special handling for XML Schema namespace
            if (prefix === 'xs' || prefix === 'xsd') {
                return BuiltinTypes.getType(name) || BuiltinTypes.getType(localName);
            }
            
            // Resolve prefix to namespace URI
            const namespaceUri = this.namespaces.get(prefix);
            if (namespaceUri) {
                // Try Clark notation lookup
                const clarkNotation = `{${namespaceUri}}${localName}`;
                resolvedType = this.types.get(clarkNotation);
                if (resolvedType) {
                    return resolvedType;
                }
                
                // Try local name lookup if this is the target namespace
                if (namespaceUri === this.targetNamespace) {
                    resolvedType = this.types.get(localName);
                    if (resolvedType) {
                        return resolvedType;
                    }
                }
            }
            
            // For unknown prefixes, try the local name as fallback
            resolvedType = this.types.get(localName);
            if (resolvedType) {
                return resolvedType;
            }
        }
        
        // Handle Clark notation ({namespace}localName)
        if (name.startsWith('{')) {
            const closeBrace = name.indexOf('}');
            if (closeBrace !== -1) {
                const namespaceUri = name.substring(1, closeBrace);
                const localName = name.substring(closeBrace + 1);
                
                // Try local name lookup if this is the target namespace
                if (namespaceUri === this.targetNamespace) {
                    resolvedType = this.types.get(localName);
                    if (resolvedType) {
                        return resolvedType;
                    }
                }
            }
        }
        
        // Check built-in types (including XML Schema types)
        resolvedType = BuiltinTypes.getType(name);
        if (resolvedType) {
            return resolvedType;
        }
        
        // Final fallback: try various forms of the name
        // This handles cases where qualified names weren't properly normalized
        if (colonIndex !== -1) {
            const localName = name.substring(colonIndex + 1);
            resolvedType = BuiltinTypes.getType(localName);
            if (resolvedType) {
                return resolvedType;
            }
        }
        
        return undefined;
    }

    getTypeDefinitions(): Map<string, SchemaType> {
        return this.types;
    }

    // Group definition management
    addGroupDefinition(name: string, group: ContentModel): void {
        this.groupDefinitions.set(name, group);
    }

    getGroupDefinition(name: string): ContentModel | undefined {
        return this.groupDefinitions.get(name);
    }

    getGroupDefinitions(): Map<string, ContentModel> {
        return this.groupDefinitions;
    }

    // Element declaration management
    addElementDeclaration(name: string, element: SchemaElementDecl): void {
        this.validateElementDeclaration(name, element);
        this.elementDeclarations.set(name, element);
    }

    getElementDeclaration(name: string): SchemaElementDecl | undefined {
        return this.elementDeclarations.get(name);
    }

    getElementDeclarations(): Map<string, SchemaElementDecl> {
        return this.elementDeclarations;
    }

    // Attribute declaration management
    addAttributeDeclaration(name: string, attribute: SchemaAttributeDecl): void {
        this.validateAttributeDeclaration(name, attribute);
        this.attributeDeclarations.set(name, attribute);
    }

    getAttributeDeclaration(name: string): SchemaAttributeDecl | undefined {
        return this.attributeDeclarations.get(name);
    }

    getAttributeDeclarations(): Map<string, SchemaAttributeDecl> {
        return this.attributeDeclarations;
    }

    // Grammar interface implementation
    validateElement(elementName: string, context: ValidationContext): ValidationResult {
        const elementDecl: SchemaElementDecl | undefined = this.getElementDeclaration(elementName);
        if (!elementDecl) {
            return ValidationResult.error(`No declaration found for element '${elementName.toString()}'`);
        }

        // Check if element is abstract
        if (elementDecl.isAbstract()) {
            return ValidationResult.error(`Abstract element '${elementName.toString()}' cannot be used directly`);
        }

        // Validate against element's type
        const elementType: SchemaType | undefined = elementDecl.resolveType(this);
        if (!elementType) {
            return ValidationResult.error(`No type found for element '${elementName.toString()}'`);
        }

        return this.validateAgainstType(elementName, context, elementType);
    }

    getElementContentModel(elementName: string) {
        const elementDecl: SchemaElementDecl | undefined = this.getElementDeclaration(elementName);
        if (!elementDecl) {
            return undefined;
        }

        const type: SchemaType | undefined = elementDecl.resolveType(this);
        if (type && type.isComplexType()) {
            const complexType: ComplexType = type as ComplexType;
            return complexType.getContentModel();
        }

        return undefined;
    }

    validateAttributes(elementName: string, attributes: Map<string, string>, context: ValidationContext): ValidationResult {
        const elementDecl: SchemaElementDecl | undefined = this.getElementDeclaration(elementName);
        if (!elementDecl) {
            return ValidationResult.success();
        }

        const type: SchemaType | undefined = elementDecl.resolveType(this);
        if (!type) {
            return ValidationResult.success();
        }
        if (!type.isComplexType()) {
            // Simple types don't have attributes
            if (attributes.size > 0) {
                return ValidationResult.error(`Element '${elementName.toString()}' with simple type cannot have attributes`);
            }
            return ValidationResult.success();
        }

        const complexType: ComplexType = type as ComplexType;
        return this.validator.validateAttributesForGrammar(elementName, attributes, complexType);
    }

    getElementAttributes(elementName: string): Map<string, AttributeInfo> {
        const elementDecl: SchemaElementDecl | undefined = this.getElementDeclaration(elementName);
        if (!elementDecl) {
            return new Map();
        }

        const type: SchemaType | undefined = elementDecl.resolveType(this);
        if (type && type.isComplexType()) {
            const complexType: ComplexType = type as ComplexType;
            return complexType.getAttributeInfos();
        }

        return new Map();
    }

    getDefaultAttributes(elementName: string): Map<string, string> {
        const elementDecl: SchemaElementDecl | undefined = this.getElementDeclaration(elementName);
        if (!elementDecl) {
            return new Map();
        }

        const type: SchemaType | undefined = elementDecl.resolveType(this);
        if (type && type.isComplexType()) {
            const complexType: ComplexType = type as ComplexType;
            return complexType.getDefaultAttributes();
        }

        return new Map();
    }

    getMissingDefaultAttributes(elementName: string, providedAttributes: Map<string, string>): Map<string, string> {
        // Get all missing attributes with default values that should be added
        const result: Map<string, string> = new Map<string, string>();
        const elementDecl: SchemaElementDecl | undefined = this.getElementDeclaration(elementName);

        if (!elementDecl) {
            return result;
        }

        const type: SchemaType | undefined = elementDecl.resolveType(this);
        if (type && type.isComplexType()) {
            const complexType: ComplexType = type as ComplexType;
            const declaredAttrs: Map<string, SchemaAttributeDecl> = complexType.getAttributes();

            const declaredAttrEntries: [string, SchemaAttributeDecl][] = Array.from(declaredAttrs.entries());
            for (const [name, attrDecl] of declaredAttrEntries) {
                // If attribute is not provided and has a default/fixed value
                if (!providedAttributes.has(name) && attrDecl.hasDefaultValue()) {
                    const defaultValue: string | undefined = attrDecl.getEffectiveDefaultValue();
                    if (defaultValue) {
                        result.set(name, defaultValue);
                    }
                }
            }
        }

        return result;
    }

    validateElementContent(elementName: string, children: string[], textContent: string, context: ValidationContext): ValidationResult {
        const elementDecl: SchemaElementDecl | undefined = this.getElementDeclaration(elementName);
        if (!elementDecl) {
            return ValidationResult.error(`No declaration found for element '${elementName.toString()}'`);
        }

        const type: SchemaType | undefined = elementDecl.resolveType(this);
        if (!type) {
            return ValidationResult.error(`No type found for element '${elementName.toString()}'`);
        }
        if (type.isSimpleType()) {
            // Simple content: no child elements allowed, validate text content
            if (children.length > 0) {
                return ValidationResult.error(`Element '${elementName.toString()}' with simple type cannot have child elements`);
            }
            return this.validateSimpleType(textContent, type as SimpleType);
        } else {
            const complexType: ComplexType = type as ComplexType;


            return this.validateComplexTypeContent(children, textContent, complexType);
        }
    }

    validateAttributeValue(elementName: string, attributeName: string, value: string, context: ValidationContext): ValidationResult {
        const elementDecl: SchemaElementDecl | undefined = this.getElementDeclaration(elementName);
        if (!elementDecl) {
            return ValidationResult.success();
        }

        const type: SchemaType | undefined = elementDecl.resolveType(this);
        if (!type || !type.isComplexType()) {
            return ValidationResult.success();
        }

        const complexType: ComplexType = type as ComplexType;
        const attrDecl: SchemaAttributeDecl | undefined = complexType.getAttribute(attributeName);
        if (!attrDecl) {
            return ValidationResult.error(`No declaration found for attribute '${attributeName.toString()}'`);
        }

        return this.validateSimpleType(value, attrDecl.getType());
    }

    resolveEntity(name: string): string | undefined {
        // Entity methods (for DTD compatibility)
        // XML Schema doesn't support general entities like DTD
        return undefined;
    }

    getEntityValue(entityName: string): string | undefined {
        // XML Schema doesn't support general entities like DTD
        return undefined;
    }

    hasEntity(entityName: string): boolean {
        return false;
    }

    getNotation(notationName: string): NotationDecl | undefined {
        // Notation methods (for DTD compatibility)
        // XML Schema doesn't support notations in the same way as DTD
        return undefined;
    }

    hasNotation(notationName: string): boolean {
        return false;
    }

    addEntityReferenceUsage(originalReference: string, expandedText: string): void {
        // Entity reference tracking for canonicalization
        this.entityReferences.set(expandedText, originalReference);
    }

    getOriginalEntityReference(expandedText: string): string | undefined {
        return this.entityReferences.get(expandedText);
    }

    clearEntityReferenceTracking(): void {
        this.entityReferences.clear();
    }

    private validateAgainstType(element: string, content: ValidationContext, type: SchemaType): ValidationResult {
        if (type.isSimpleType()) {
            return this.validateSimpleType(content.textContent, type as SimpleType);
        } else {
            return this.validateComplexType(element, content, type as ComplexType);
        }
    }

    private validateComplexType(element: string, content: ValidationContext, complexType: ComplexType): ValidationResult {
        // Validate attributes
        const attrResult: ValidationResult = this.validateComplexTypeAttributes(content.attributes, complexType);
        if (!attrResult.isValid) {
            return attrResult;
        }

        // Skip content validation if attributeOnly flag is set
        if (content.attributeOnly) {
            return ValidationResult.success();
        }

        // Validate content
        // Convert string names to QualifiedName objects
        const children: string[] = content.childrenNames;
        return this.validateComplexTypeContent(children, content.textContent, complexType);
    }

    private validateComplexTypeAttributes(attributes: Map<string, string>, complexType: ComplexType): ValidationResult {
        const declaredAttrs: Map<string, SchemaAttributeDecl> = complexType.getAttributes();
        const errors: ValidationError[] = [];

        // Convert attribute maps to use string keys for easier comparison
        const attributesByKey: Map<string, string> = new Map<string, string>();
        const attributeEntries: [string, string][] = Array.from(attributes.entries());
        for (let [qname, value] of attributeEntries) {
            attributesByKey.set(qname, value);
        }

        const declaredAttrsByKey: Map<string, SchemaAttributeDecl> = new Map<string, SchemaAttributeDecl>();
        const declaredAttrEntries: [string, SchemaAttributeDecl][] = Array.from(declaredAttrs.entries());
        for (const [qname, attrDecl] of declaredAttrEntries) {
            declaredAttrsByKey.set(qname, attrDecl);
        }

        // Check required attributes
        const declaredAttrEntries2: [string, SchemaAttributeDecl][] = Array.from(declaredAttrs.entries());
        for (const [name, attrDecl] of declaredAttrEntries2) {
            if (attrDecl.getUse() === 'required' && !attributesByKey.has(name)) {
                errors.push(new ValidationError(`Required attribute '${name.toString()}' is missing`));
            }
        }

        // Check prohibited attributes
        const attributeEntries2: [string, string][] = Array.from(attributes.entries());
        for (const [name] of attributeEntries2) {
            const attrDecl: SchemaAttributeDecl | undefined = declaredAttrsByKey.get(name);
            if (attrDecl && attrDecl.getUse() === 'prohibited') {
                errors.push(new ValidationError(`Prohibited attribute '${name.toString()}' is present`));
            }
        }

        // Validate attribute values and check for undeclared attributes
        const attributeEntries3: [string, string][] = Array.from(attributes.entries());
        for (const [name, value] of attributeEntries3) {
            const attrDecl: SchemaAttributeDecl | undefined = declaredAttrsByKey.get(name);
            if (attrDecl) {
                // Validate declared attribute value
                const resolvedType: SimpleType = attrDecl.resolveType(this);

                // Check fixed value constraint
                const fixedValue: string | undefined = attrDecl.getFixedValue();
                if (fixedValue && value !== fixedValue) {
                    errors.push(new ValidationError(`Attribute '${name.toString()}' has fixed value '${fixedValue}' but got '${value}'`));
                    continue; // Skip further validation if fixed value doesn't match
                }

                const valueResult: ValidationResult = this.validateSimpleType(value, resolvedType);
                if (!valueResult.isValid) {
                    errors.push(...valueResult.errors);
                }
            } else {
                // Check if undeclared attribute is allowed
                if (!complexType.getAllowsAnyAttributes()) {
                    // Check if it's a namespace declaration or xml: attribute (always allowed)
                    const colonIndex: number = name.indexOf(':');
                    const localName: string = colonIndex !== -1 ? name.substring(colonIndex + 1) : name;
                    const prefix: string = colonIndex !== -1 ? name.substring(0, colonIndex) : '';

                    if (localName !== 'xmlns' &&
                        !name.startsWith('xmlns:') &&
                        prefix !== 'xml') {
                        errors.push(new ValidationError(`Undeclared attribute '${name}' not allowed`));
                    }
                }
            }
        }

        return errors.length > 0 ? new ValidationResult(false, errors) : ValidationResult.success();
    }

    private validateComplexTypeContent(children: string[], textContent: string, complexType: ComplexType): ValidationResult {
        if (complexType.isEmpty()) {
            // Empty content: no children or text allowed
            if (children.length > 0 || textContent.trim() !== '') {
                return ValidationResult.error(`Element with empty content cannot have child elements or text`);
            }
            return ValidationResult.success();
        } else if (complexType.hasSimpleContent()) {
            // Simple content: no child elements allowed
            if (children.length > 0) {
                return ValidationResult.error(`Element with simple content cannot have child elements`);
            }

            // Validate text content against the base type
            const baseType: SchemaType | undefined = complexType.getBaseType();
            if (baseType && baseType.isSimpleType()) {
                return this.validateSimpleType(textContent, baseType as SimpleType);
            } else if (baseType && baseType.isComplexType()) {
                // Extension of complex type with simple content - find the simple content base
                return this.validateSimpleContentInheritance(textContent, baseType as ComplexType);
            } else {
                // No base type specified - treat as xs:anyType (allows any text)
                return ValidationResult.success();
            }
        } else {
            // Complex content: validate child elements against content model
            if (!complexType.isMixed() && textContent.trim() !== '') {
                return ValidationResult.error(`Element with element-only content cannot have text content`);
            }

            // Validate against content model if present
            const contentModel = complexType.getContentModel();
            if (contentModel) {
                return contentModel.validate(children);
            } else {
                // No content model specified - allow any children (equivalent to xs:any)
                return ValidationResult.success();
            }
        }
    }

    private validateSimpleType(textContent: string, simpleType: SimpleType): ValidationResult {
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

    private validateSimpleContentInheritance(textContent: string, complexType: ComplexType): ValidationResult {
        // For complex types with simple content, we need to trace up the inheritance chain
        // to find the ultimate simple type that defines the text content validation

        const baseType: SchemaType | undefined = complexType.getBaseType();
        if (!baseType) {
            // No base type - treat as xs:anyType
            return ValidationResult.success();
        }

        if (baseType.isSimpleType()) {
            // Found the simple base type - validate against it
            return this.validateSimpleType(textContent, baseType as SimpleType);
        } else if (baseType.isComplexType()) {
            const baseComplexType: ComplexType = baseType as ComplexType;
            if (baseComplexType.hasSimpleContent()) {
                // Continue up the inheritance chain
                return this.validateSimpleContentInheritance(textContent, baseComplexType);
            } else {
                // Base has complex content - this shouldn't happen in valid schema
                return ValidationResult.error(`Invalid inheritance: simple content derived from complex content`);
            }
        }

        return ValidationResult.success();
    }

    // Serialization for pre-compiled grammars
    toJSON(): any {
        return {
            targetNamespace: this.targetNamespace,
            schemaLocation: this.schemaLocation,
            elementFormDefault: this.elementFormDefault,
            attributeFormDefault: this.attributeFormDefault,
            typeNames: Array.from(this.types.keys()),
            elementNames: Array.from(this.elementDeclarations.keys()),
            attributeNames: Array.from(this.attributeDeclarations.keys()),
            namespaces: Object.fromEntries(this.namespaces),
            grammarType: 'xmlschema',
            version: '1.0' // For future compatibility
        };
    }

    // Deserialization from pre-compiled grammars
    static fromJSON(data: { 
        targetNamespace?: string; 
        schemaLocation?: string; 
        elementFormDefault?: boolean; 
        attributeFormDefault?: boolean; 
        namespaces?: Record<string, string>; 
    }): XMLSchemaGrammar {
        const grammar: XMLSchemaGrammar = new XMLSchemaGrammar(data.targetNamespace, data.schemaLocation);
        grammar.elementFormDefault = data.elementFormDefault || false;
        grammar.attributeFormDefault = data.attributeFormDefault || false;

        // Restore namespaces
        if (data.namespaces) {
            grammar.namespaces = new Map(Object.entries(data.namespaces));
        }

        // Note: For now, we'll implement basic structure
        // Full type reconstruction can be added as needed
        // The key benefit is having the namespace and basic structure available

        return grammar;
    }

    // Schema validation methods
    
    private validateTypeDefinition(name: string, type: SchemaType): void {
        // Check for duplicate type definitions
        if (this.types.has(name)) {
            throw new Error(`Duplicate type definition: '${name}'`);
        }
        
        // Validate the type itself
        type.validate();
    }

    private validateTypeNameSyntax(typeName: string): void {
        // XML Schema spec: type names must be valid QNames or NCNames
        if (!typeName || typeName.trim().length === 0) {
            throw new Error('Type name cannot be empty');
        }
        
        // Handle qualified names (prefix:localName)
        const colonIndex = typeName.indexOf(':');
        if (colonIndex !== -1) {
            const prefix = typeName.substring(0, colonIndex);
            const localName = typeName.substring(colonIndex + 1);
            
            // XML Schema spec: both prefix and local name must be valid NCNames
            if (!XMLUtils.isValidNCName(prefix)) {
                throw new Error(`Type name prefix '${prefix}' is not a valid NCName`);
            }
            if (!XMLUtils.isValidNCName(localName)) {
                throw new Error(`Type name local part '${localName}' is not a valid NCName`);
            }
        } else if (typeName.startsWith('{')) {
            // Handle Clark notation {namespace}localName
            const closeBrace = typeName.indexOf('}');
            if (closeBrace === -1) {
                throw new Error(`Malformed Clark notation: missing closing brace in '${typeName}'`);
            }
            const localName = typeName.substring(closeBrace + 1);
            if (!XMLUtils.isValidNCName(localName)) {
                throw new Error(`Type name local part '${localName}' in Clark notation is not a valid NCName`);
            }
        } else {
            // Simple NCName
            if (!XMLUtils.isValidNCName(typeName)) {
                throw new Error(`Type name '${typeName}' is not a valid NCName`);
            }
        }
    }

    private validateElementDeclaration(name: string, element: SchemaElementDecl): void {
        // Check for duplicate element declarations - this IS forbidden by XML Schema spec
        if (this.elementDeclarations.has(name)) {
            throw new Error(`Duplicate element declaration: '${name}'`);
        }
        
        // Validate the element itself - check for spec violations
        element.validate();
        
        // Type reference validation - XML Schema spec allows forward references and cross-schema references
        // Only check for obvious syntax errors, not missing type resolution
        const typeName = element.getTypeName();
        if (typeName) {
            // XML Schema spec: Only validate that type name is syntactically valid
            // Missing types are NOT specification errors - they're implementation resolution issues
            try {
                this.validateTypeNameSyntax(typeName);
            } catch (error) {
                // Only throw for actual syntax violations forbidden by XML Schema spec
                throw new Error(`Element '${name}' has invalid type name syntax: ${(error as Error).message}`);
            }
        }
    }

    private validateAttributeDeclaration(name: string, attribute: SchemaAttributeDecl): void {
        // Check for duplicate attribute declarations
        if (this.attributeDeclarations.has(name)) {
            throw new Error(`Duplicate attribute declaration: '${name}'`);
        }
        
        // Validate the attribute itself
        attribute.validate();
    }

    private isValidTypeReference(typeName: string): boolean {
        // Use the enhanced getTypeDefinition method for validation
        const resolvedType = this.getTypeDefinition(typeName);
        return resolvedType !== undefined;
    }

    validateGrammar(): void {
        // Comprehensive grammar validation
        this.validateNamespaceConsistency();
        this.validateTypeReferences();
        
        // Validate content model constraints
        this.validateContentModelConstraints();
        this.validateSubstitutionGroups();
        this.validateCircularDependencies();
        this.validateGlobalUniqueness();
    }

    private validateNamespaceConsistency(): void {
        // Validate that all qualified names use declared namespace prefixes
        for (const [name, elementDecl] of this.elementDeclarations) {
            this.validateQualifiedName(name, 'element');
            
            const typeName = elementDecl.getTypeName();
            if (typeName && typeName.includes(':')) {
                this.validateQualifiedName(typeName, 'type reference');
            }
            
            const substitutionGroup = elementDecl.getSubstitutionGroup();
            if (substitutionGroup && substitutionGroup.includes(':')) {
                this.validateQualifiedName(substitutionGroup, 'substitution group');
            }
        }
        
        for (const [name] of this.types) {
            this.validateQualifiedName(name, 'type');
        }
        
        for (const [name] of this.attributeDeclarations) {
            this.validateQualifiedName(name, 'attribute');
        }
    }

    private validateQualifiedName(qname: string, context: string): void {
        const colonIndex = qname.indexOf(':');
        if (colonIndex !== -1) {
            const prefix = qname.substring(0, colonIndex);
            
            // Skip validation for XML Schema namespace (xs: prefix is implicitly valid)
            if (prefix === 'xs' || prefix === 'xsd') {
                return;
            }
            
            if (!this.namespaces.has(prefix)) {
                throw new Error(`Undefined namespace prefix '${prefix}' in ${context} '${qname}'`);
            }
        }
    }

    private validateTypeReferences(): void {
        // XML Schema spec: Check that all type references are syntactically valid
        // AND that required types actually exist (this is a spec requirement)
        
        for (const [name, elementDecl] of this.elementDeclarations) {
            const typeName = elementDecl.getTypeName();
            if (typeName) {
                try {
                    this.validateTypeNameSyntax(typeName);
                } catch (error) {
                    // In validating mode, throw for syntax errors (spec violations)
                    if (this.validatingMode) {
                        throw new Error(`Element '${name}' type reference syntax error: ${(error as Error).message}`);
                    }
                    // In non-validating mode, silently ignore syntax errors
                }
                
                // XML Schema spec: Type references MUST resolve to existing types
                // This is different from cross-schema resolution - it's about local schema validity
                const resolvedType = this.isValidTypeReference(typeName);
                if (!resolvedType) {
                    // Check if this is a local type that should exist
                    const isLocalReference = !typeName.includes(':') && !typeName.startsWith('{');
                    const isBuiltinType = typeName.startsWith('xs:') || typeName.startsWith('xsd:') || 
                                         this.isXMLSchemaBuiltinType(typeName);
                    
                    if (isLocalReference && !isBuiltinType) {
                        // Local type reference that doesn't exist - this IS a spec violation
                        const errorMsg = `Element '${name}' references undefined type '${typeName}' - local type must be defined in this schema`;
                        if (this.validatingMode) {
                            throw new Error(errorMsg);
                        }
                        // In non-validating mode, silently ignore the error
                    } else {
                        // Cross-schema or qualified reference - debug only (not a local spec violation)
                        console.debug(`Element '${name}' references type '${typeName}' - will be resolved during cross-schema processing`);
                    }
                }
            }
        }
        
        // Check complex type base type references for syntax errors and local resolution
        for (const [name, type] of this.types) {
            if (type.isComplexType()) {
                const complexType = type as ComplexType;
                const baseTypeQName = complexType.getBaseTypeQName();
                if (baseTypeQName) {
                    try {
                        this.validateTypeNameSyntax(baseTypeQName);
                    } catch (error) {
                        if (this.validatingMode) {
                            throw new Error(`Type '${name}' base type reference syntax error: ${(error as Error).message}`);
                        }
                        // In non-validating mode, silently ignore syntax errors
                    }
                    
                    // Check local base type resolution
                    const resolvedBaseType = this.isValidTypeReference(baseTypeQName);
                    if (!resolvedBaseType) {
                        const isLocalReference = !baseTypeQName.includes(':') && !baseTypeQName.startsWith('{');
                        const isBuiltinType = baseTypeQName.startsWith('xs:') || baseTypeQName.startsWith('xsd:') || 
                                             this.isXMLSchemaBuiltinType(baseTypeQName);
                        
                        if (isLocalReference && !isBuiltinType) {
                            const errorMsg = `Type '${name}' references undefined base type '${baseTypeQName}' - local base type must be defined in this schema`;
                            if (this.validatingMode) {
                                throw new Error(errorMsg);
                            }
                            // In non-validating mode, silently ignore the error
                        } else {
                            console.debug(`Type '${name}' references base type '${baseTypeQName}' - will be resolved during cross-schema processing`);
                        }
                    }
                }
            }
        }
    }
    
    private isXMLSchemaBuiltinType(typeName: string): boolean {
        // Common XML Schema built-in types (without namespace prefix)
        const builtinTypes = [
            'string', 'boolean', 'decimal', 'float', 'double', 'duration', 'dateTime', 'time', 'date',
            'gYearMonth', 'gYear', 'gMonthDay', 'gDay', 'gMonth', 'hexBinary', 'base64Binary',
            'anyURI', 'QName', 'NOTATION', 'normalizedString', 'token', 'language', 'NMTOKEN',
            'NMTOKENS', 'Name', 'NCName', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES',
            'integer', 'nonPositiveInteger', 'negativeInteger', 'long', 'int', 'short', 'byte',
            'nonNegativeInteger', 'unsignedLong', 'unsignedInt', 'unsignedShort', 'unsignedByte',
            'positiveInteger', 'anyType', 'anySimpleType'
        ];
        return builtinTypes.includes(typeName);
    }

    private validateSubstitutionGroups(): void {
        // Validate that substitution group heads exist and are valid
        for (const [name, elementDecl] of this.elementDeclarations) {
            const substitutionGroup = elementDecl.getSubstitutionGroup();
            if (substitutionGroup) {
                const headElement = this.getElementDeclaration(substitutionGroup);
                if (!headElement) {
                    throw new Error(`Element '${name}' references undefined substitution group head '${substitutionGroup}'`);
                }
                
                // Schema spec: substitution group head cannot be abstract in all cases
                // but this is a complex rule that depends on context, so we'll just warn
                if (headElement.isAbstract()) {
                    if (this.validatingMode) {
                        throw new Error(`Element '${name}' uses abstract substitution group head '${substitutionGroup}'`);
                    }
                    // In non-validating mode, silently ignore
                }
            }
        }
    }

    private validateCircularDependencies(): void {
        // Check for circular dependencies in type inheritance
        const visitedTypes = new Set<string>();
        const currentPath = new Set<string>();
        
        for (const [typeName, type] of this.types) {
            if (!visitedTypes.has(typeName)) {
                this.checkCircularDependency(typeName, type, visitedTypes, currentPath);
            }
        }
    }

    private checkCircularDependency(typeName: string, type: SchemaType, visited: Set<string>, currentPath: Set<string>): void {
        if (currentPath.has(typeName)) {
            throw new Error(`Circular dependency detected in type hierarchy: ${Array.from(currentPath).join(' -> ')} -> ${typeName}`);
        }
        
        if (visited.has(typeName)) {
            return;
        }
        
        visited.add(typeName);
        currentPath.add(typeName);
        
        // Check base type dependencies
        if (type.isComplexType()) {
            const complexType = type as ComplexType;
            const baseTypeQName = complexType.getBaseTypeQName();
            if (baseTypeQName) {
                const baseType = this.getTypeDefinition(baseTypeQName);
                if (baseType) {
                    this.checkCircularDependency(baseTypeQName, baseType, visited, currentPath);
                }
            }
        }
        
        currentPath.delete(typeName);
    }

    private validateGlobalUniqueness(): void {
        // Check for name conflicts between different component types
        const allNames = new Set<string>();
        
        // Elements should not conflict with types in same target namespace
        for (const name of this.elementDeclarations.keys()) {
            if (this.types.has(name)) {
                if (this.validatingMode) {
                    throw new Error(`Name conflict: '${name}' is defined as both element and type`);
                }
                // In non-validating mode, silently ignore
            }
        }
        
        // Check for attribute name conflicts with target namespace elements
        for (const name of this.attributeDeclarations.keys()) {
            if (name.startsWith(`{${this.targetNamespace}}`)) {
                const localName = name.substring(`{${this.targetNamespace}}`.length);
                if (this.elementDeclarations.has(localName)) {
                    if (this.validatingMode) {
                        throw new Error(`Name conflict: '${localName}' is defined as both element and attribute in target namespace`);
                    }
                    // In non-validating mode, silently ignore
                }
            }
        }
    }
    
    private validateContentModelConstraints(): void {
        // XML Schema Spec: xsd:all cannot be nested inside other content model groups
        // and must only appear at the top level of a complex type's content model
        
        for (const [typeName, type] of this.types) {
            if (type instanceof ComplexType) {
                this.validateContentModelInComplexType(typeName, type);
            }
        }
    }
    
    private validateContentModelInComplexType(typeName: string, complexType: ComplexType): void {
        // Check if this complex type has invalid content model nesting
        const contentModel = complexType.getContentModel();
        if (contentModel) {
            this.validateContentModelStructure(typeName, contentModel, false);
        }
    }
    
    private validateContentModelStructure(typeName: string, contentModel: any, withinGroup: boolean): void {
        if (!contentModel || typeof contentModel !== 'object') {
            return;
        }
        
        // Check for xsd:all inside other groups (sequence, choice)
        if (contentModel.type === 'all') {
            if (withinGroup) {
                throw new Error(`Invalid content model in complex type '${typeName}': xsd:all cannot be nested inside other content model groups (sequence, choice)`);
            }
        }
        
        // Recursively check nested content models
        if (contentModel.type === 'sequence' || contentModel.type === 'choice') {
            if (contentModel.particles) {
                for (const particle of contentModel.particles) {
                    this.validateContentModelStructure(typeName, particle, true);
                }
            }
        }
        
        // Check for multiple xsd:all at the same level
        if (contentModel.particles) {
            let allCount = 0;
            for (const particle of contentModel.particles) {
                if (particle && particle.type === 'all') {
                    allCount++;
                }
            }
            if (allCount > 1) {
                throw new Error(`Invalid content model in complex type '${typeName}': multiple xsd:all groups are not allowed at the same level`);
            }
        }
    }
}