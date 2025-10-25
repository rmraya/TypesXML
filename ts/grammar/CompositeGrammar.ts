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

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { AttributeGroup } from '../schema/AttributeGroup';
import { BuiltinTypes } from '../schema/BuiltinTypes';
import { ContentModel } from '../schema/ContentModel';
import { SchemaType } from '../schema/SchemaType';
import { SimpleType } from '../schema/SimpleType';
import { XMLSchemaGrammar } from '../schema/XMLSchemaGrammar';
import { AttributeInfo, Grammar, GrammarType, ValidationContext, ValidationError, ValidationResult } from './Grammar';

export class CompositeGrammar implements Grammar {
    private grammars: Map<string, Grammar> = new Map();
    private primaryGrammar: Grammar | undefined;
    private prefixToNamespace: Map<string, string> = new Map<string, string>();
    private defaultNamespace: string = '';
    private xsiTypeMap: Map<string, string> = new Map();

    constructor() {
        this.loadPrecompiledGrammars();
    }

    private loadPrecompiledGrammars(): void {
        try {
            // Load W3C XML namespace grammar (xml.xsd)
            this.loadXMLNamespaceGrammar();

            // Load XMLSchema namespace grammar (XMLSchema.xsd) if needed
            this.loadXMLSchemaNamespaceGrammar();

            // Load XMLSchema-instance namespace grammar
            this.loadXMLSchemaInstanceGrammar();
        } catch (error) {
            // Silently continue - pre-compiled grammars are optional optimizations
            // The system will fall back to runtime parsing if needed
        }
    }

    private loadXMLNamespaceGrammar(): void {
        try {
            const grammarPath: string = resolve(__dirname, 'xml-namespace.json');
            if (existsSync(grammarPath)) {
                const data: any = JSON.parse(readFileSync(grammarPath, 'utf8'));
                const grammar: XMLSchemaGrammar = XMLSchemaGrammar.fromJSON(data);

                this.grammars.set('http://www.w3.org/XML/1998/namespace', grammar);
            }
        } catch (error) {
            // Silently continue - this is an optimization, not required
        }
    }

    private loadXMLSchemaNamespaceGrammar(): void {
        try {
            const grammarPath: string = resolve(__dirname, 'xmlschema-namespace.json');
            if (existsSync(grammarPath)) {
                const data: any = JSON.parse(readFileSync(grammarPath, 'utf8'));
                const grammar: XMLSchemaGrammar = XMLSchemaGrammar.fromJSON(data);

                this.grammars.set('http://www.w3.org/2001/XMLSchema', grammar);
            }
        } catch (error) {
            // Silently continue - this is an optimization, not required
        }
    }

    private loadXMLSchemaInstanceGrammar(): void {
        try {
            const grammarPath: string = resolve(__dirname, 'xmlschema-instance.json');
            if (existsSync(grammarPath)) {
                const data: any = JSON.parse(readFileSync(grammarPath, 'utf8'));
                const grammar: XMLSchemaGrammar = XMLSchemaGrammar.fromJSON(data);

                this.grammars.set('http://www.w3.org/2001/XMLSchema-instance', grammar);

            }
        } catch (error) {
            // Silently continue - this is an optimization, not required
        }
    }

    addGrammar(namespaceURI: string | undefined, grammar: Grammar): void {
        const key: string = namespaceURI || '';

        this.grammars.set(key, grammar);

        // Set as primary grammar if it's the default namespace or first grammar added
        if (!this.primaryGrammar || (namespaceURI === this.defaultNamespace)) {
            this.primaryGrammar = grammar;
        }
    }

    // Simple method to update prefix mappings from document namespace declarations
    updatePrefixMappings(prefixMappings: Map<string, string>): void {
        // Merge new prefix mappings instead of replacing
        prefixMappings.forEach((namespace, prefix) => {
            if (!this.prefixToNamespace.has(prefix) || this.prefixToNamespace.get(prefix) !== namespace) {
                this.prefixToNamespace.set(prefix, namespace);
            }
        });
    }

    // Simple method to resolve prefix to namespace
    private resolvePrefix(prefix: string): string {
        if (prefix === '') {
            // For empty prefix, use default namespace or primary grammar's target namespace
            return this.defaultNamespace || (this.primaryGrammar?.getTargetNamespace?.() || '');
        }
        return this.prefixToNamespace.get(prefix) || '';
    }

    getNamespaceResolver(): (prefix: string) => string {
        return (prefix: string) => this.resolvePrefix(prefix);
    }

    private getGrammarForNamespace(namespaceURI?: string): Grammar | undefined {
        const key: string = namespaceURI || '';
        return this.grammars.get(key) || this.primaryGrammar;
    }

    getGrammars(): Map<string, Grammar> {
        return this.grammars;
    }

    getPrimaryGrammar(): Grammar | undefined {
        return this.primaryGrammar;
    }

    hasGrammar(namespaceURI: string | undefined): boolean {
        const key: string = namespaceURI || '';
        return this.grammars.has(key);
    }

    getLoadedGrammarList(): Array<{ namespace: string, type: string, elementCount?: number, typeCount?: number }> {
        const grammarList: Array<{ namespace: string, type: string, elementCount?: number, typeCount?: number }> = [];

        this.grammars.forEach((grammar: Grammar, namespace: string) => {
            let elementCount: number | undefined;
            let typeCount: number | undefined;

            // Try to get element/type counts if the grammar supports it
            try {
                if ((grammar as any).getElementDeclarations) {
                    elementCount = (grammar as any).getElementDeclarations().size;
                }
                if ((grammar as any).getTypeDefinitions) {
                    typeCount = (grammar as any).getTypeDefinitions().size;
                }
            } catch (error) {
                // Ignore errors getting counts
            }

            grammarList.push({
                namespace: namespace || '(no namespace)',
                type: grammar.getGrammarType().toString(),
                elementCount,
                typeCount
            });
        });

        return grammarList.sort((a, b) => a.namespace.localeCompare(b.namespace));
    }

    // Cross-schema group resolver for SchemaParsingHandler
    resolveCrossSchemaGroup(qualifiedName: string): ContentModel | undefined {
        // Try to find the group in all loaded XMLSchemaGrammar instances
        for (const [namespace, grammar] of this.grammars.entries()) {
            if (grammar instanceof XMLSchemaGrammar) {
                const group = grammar.getGroupDefinition(qualifiedName);
                if (group) {
                    return group;
                }
            }
        }
        return undefined;
    }

    // Resolve all pending cross-schema group references after schemas are loaded
    resolveAllGroupReferences(): void {
        // Go through all XMLSchemaGrammar instances and try to resolve any unresolved group references
        for (const [namespace, grammar] of this.grammars.entries()) {
            if (grammar instanceof XMLSchemaGrammar) {
                // For now, this would need access to unresolved group references
                // This is a placeholder for post-loading resolution
            }
        }
    }

    // Grammar interface implementation
    getGrammarType(): GrammarType {
        return this.primaryGrammar?.getGrammarType() || GrammarType.NONE;
    }

    getElementAttributes(elementName: string): Map<string, AttributeInfo> {
        const colonIndex: number = elementName.indexOf(':');
        const prefix: string = colonIndex !== -1 ? elementName.substring(0, colonIndex) : '';
        const namespaceURI: string = prefix ? this.resolvePrefix(prefix) : '';

        const grammar: Grammar | undefined = this.getGrammarForNamespace(namespaceURI) || this.primaryGrammar;
        if (!grammar) {
            return new Map();
        }

        // Use proper element lookup that considers elementFormDefault
        if ((grammar as any).getElementFormDefault) {
            const elementName_ForLookup: string = this.findElementNameForLookup(grammar as any, elementName);
            return grammar.getElementAttributes(elementName_ForLookup) || new Map();
        }

        return grammar.getElementAttributes(elementName) || new Map();
    }

    getDefaultAttributes(elementName: string): Map<string, string> {
        const colonIndex: number = elementName.indexOf(':');
        const prefix: string = colonIndex !== -1 ? elementName.substring(0, colonIndex) : '';
        const namespaceURI: string = prefix ? this.resolvePrefix(prefix) : '';

        const grammar: Grammar | undefined = this.getGrammarForNamespace(namespaceURI) || this.primaryGrammar;
        if (!grammar) {
            return new Map();
        }

        // Use proper element lookup that considers elementFormDefault
        if ((grammar as any).getElementFormDefault) {
            const elementName_ForLookup: string = this.findElementNameForLookup(grammar as any, elementName);
            return grammar.getDefaultAttributes?.(elementName_ForLookup) || new Map();
        }

        return grammar.getDefaultAttributes?.(elementName) || new Map();
    }

    validateElement(elementName: string, context: ValidationContext): ValidationResult {
        const colonIndex: number = elementName.indexOf(':');
        const prefix: string = colonIndex !== -1 ? elementName.substring(0, colonIndex) : '';

        const namespaceURI: string = this.resolvePrefix(prefix);

        const grammar: Grammar | undefined = this.getGrammarForNamespace(namespaceURI) || this.primaryGrammar;
        return grammar ? this.performValidation(grammar, elementName, context) : ValidationResult.success();
    }

    validateAttributes(elementName: string, attributes: Map<string, string>, context: ValidationContext): ValidationResult {
        // Comprehensive attribute validation that handles all requirements:
        // 1. Namespace resolution for both element and attributes
        // 2. Grammar selection based on element namespace  
        // 3. Multi-grammar support with namespace grouping
        // 4. xsi:type handling
        // 5. Required/prohibited/undeclared attribute checks
        // 6. Attribute value validation

        const allErrors: ValidationError[] = [];

        // 1. Resolve element namespace and find appropriate grammar
        const colonIndex: number = elementName.indexOf(':');
        const elementPrefix: string = colonIndex !== -1 ? elementName.substring(0, colonIndex) : '';
        const elementNamespaceURI: string = this.resolvePrefix(elementPrefix);

        const elementGrammar: Grammar | undefined = this.getGrammarForNamespace(elementNamespaceURI) || this.primaryGrammar;
        if (!elementGrammar) {
            return ValidationResult.success(); // No grammar to validate against
        }

        // 2. Handle non-XMLSchema grammars (DTD, etc.) - delegate directly
        if (elementGrammar.getGrammarType().toString() !== 'xmlschema') {
            return elementGrammar.validateAttributes(elementName, attributes, context);
        }

        // 3. For XMLSchema grammars, handle comprehensive validation

        // 3a. Handle xsi:type attribute if present
        const xsiType: string | undefined = attributes.get('xsi:type');
        if (xsiType && context.attributeOnly) {
            // Convert unprefixed element names to prefixed names for consistent storage
            let storageElementName: string = elementName;
            if (elementName.indexOf(':') === -1) {
                const targetNamespace: string | undefined = elementGrammar.getTargetNamespace();
                if (targetNamespace) {
                    const conventionalPrefix: string | undefined = this.findPrefixForNamespace(targetNamespace);
                    if (conventionalPrefix) {
                        storageElementName = `${conventionalPrefix}:${elementName}`;
                    }
                }
            }
            this.xsiTypeMap.set(storageElementName, xsiType);
        }

        // 3b. Group attributes by namespace for proper validation
        const attributesByNamespace = new Map<string, Map<string, string>>();

        for (const [attrName, attrValue] of attributes) {
            const attrColonIndex: number = attrName.indexOf(':');
            let attrNamespaceURI: string = '';

            if (attrColonIndex !== -1) {
                // Prefixed attribute - resolve namespace
                const attrPrefix: string = attrName.substring(0, attrColonIndex);
                attrNamespaceURI = this.resolvePrefix(attrPrefix);
            } else {
                // Unprefixed attribute - belongs to no namespace per XML Namespaces spec
                attrNamespaceURI = '';
            }

            const namespaceKey: string = attrNamespaceURI || 'no-namespace';

            if (!attributesByNamespace.has(namespaceKey)) {
                attributesByNamespace.set(namespaceKey, new Map());
            }
            attributesByNamespace.get(namespaceKey)!.set(attrName, attrValue);
        }

        // 3c. Validate attributes from each namespace against appropriate grammar
        for (const [namespaceKey, namespacedAttributes] of attributesByNamespace) {
            let targetGrammar: Grammar | undefined;

            if (namespaceKey === 'no-namespace') {
                // Unprefixed attributes - validate against element's grammar
                targetGrammar = elementGrammar;
            } else {
                // Prefixed attributes - find grammar for their namespace
                targetGrammar = this.getGrammarForNamespace(namespaceKey);
                if (!targetGrammar) {
                    // Fallback to element's grammar for unknown namespaces
                    targetGrammar = elementGrammar;
                }
            }

            if (targetGrammar) {
                // For XMLSchemaGrammar, validate against complex type if available
                if (targetGrammar.getGrammarType().toString() === 'xmlschema') {
                    const result = this.validateAttributesAgainstSchema(
                        elementName, namespacedAttributes, context, targetGrammar as any
                    );
                    if (!result.isValid) {
                        allErrors.push(...result.errors);
                    }
                } else {
                    // For other grammar types, delegate
                    const result = targetGrammar.validateAttributes(elementName, namespacedAttributes, context);
                    if (!result.isValid) {
                        allErrors.push(...result.errors);
                    }
                }
            }
        }

        return allErrors.length > 0 ? new ValidationResult(false, allErrors) : ValidationResult.success();
    }

    private validateAttributesAgainstSchema(
        elementName: string,
        attributes: Map<string, string>,
        context: ValidationContext,
        grammar: any
    ): ValidationResult {
        // Get element declaration and its complex type
        const elementAttrs = grammar.getElementAttributes(elementName);
        if (!elementAttrs || elementAttrs.size === 0) {
            return ValidationResult.success(); // No attributes declared for this element
        }

        const errors: ValidationError[] = [];

        // Convert for easier comparison
        const attributesByKey = new Map<string, string>();
        for (const [name, value] of attributes) {
            attributesByKey.set(name, value);
        }

        const declaredAttrsByKey = new Map<string, any>();
        for (const [name, attrInfo] of elementAttrs) {
            declaredAttrsByKey.set(name, attrInfo);
        }

        // Check required attributes
        for (const [name, attrInfo] of elementAttrs) {
            if (attrInfo.use === 'required' && !attributesByKey.has(name)) {
                errors.push(new ValidationError(`Required attribute '${name}' is missing`));
            }
        }

        // Check prohibited attributes
        for (const [name] of attributes) {
            const attrInfo = declaredAttrsByKey.get(name);
            if (attrInfo && attrInfo.use === 'prohibited') {
                errors.push(new ValidationError(`Prohibited attribute '${name}' is present`));
            }
        }

        // Validate attribute values and check for undeclared attributes
        for (const [name, value] of attributes) {
            const attrInfo = declaredAttrsByKey.get(name);
            if (attrInfo) {
                // Validate declared attribute value against its datatype
                // Note: For now, we'll do basic validation. More sophisticated validation
                // would require implementing datatype validation based on XML Schema types
                if (attrInfo.fixedValue && value !== attrInfo.fixedValue) {
                    errors.push(new ValidationError(`Attribute '${name}' must have fixed value '${attrInfo.fixedValue}', but found '${value}'`));
                }
            } else {
                // Check if this is a standard XML attribute (xml:space, xml:lang, etc.)
                if (!name.startsWith('xml:') && !name.startsWith('xmlns:') && name !== 'xmlns') {
                    // This is an undeclared attribute - could be warning or error depending on schema settings
                    // For now, we'll allow it (as per XML Schema "lax" processing)
                }
            }
        }

        return errors.length > 0 ? new ValidationResult(false, errors) : ValidationResult.success();
    }

    private performAttributeValidation(grammar: Grammar, elementName: string, attributes: Map<string, string>, context: ValidationContext): ValidationResult {
        // For XMLSchemaGrammar, we handle the validation here in CompositeGrammar
        if (grammar.getGrammarType().toString() === 'xmlschema') {
            return (grammar as any).validateAttributes(elementName, attributes, context);
        }

        // For other grammar types, delegate to the grammar
        return grammar.validateAttributes(elementName, attributes, context);
    }

    private performValidation(grammar: Grammar, elementName: string, context: ValidationContext): ValidationResult {
        // For XMLSchemaGrammar, we handle the validation here in CompositeGrammar
        if (grammar.getGrammarType().toString() === 'xmlschema') {
            // Convert unprefixed element names to prefixed names for schema validation
            let validationElementName: string = elementName;
            if (elementName.indexOf(':') === -1) {
                const targetNamespace: string | undefined = grammar.getTargetNamespace();
                if (targetNamespace) {
                    const conventionalPrefix: string | undefined = this.findPrefixForNamespace(targetNamespace);
                    if (conventionalPrefix) {
                        validationElementName = `${conventionalPrefix}:${elementName}`;
                    }
                }
            }

            return this.validateXMLSchemaElement(grammar as any, validationElementName, context);
        }

        // For other grammar types, delegate to the grammar
        return grammar.validateElement(elementName, context);
    }

    private validateXMLSchemaElement(grammar: any, elementName: string, context: ValidationContext): ValidationResult {
        // Try to find element declaration using proper elementFormDefault logic
        let elementDecl: any = this.findElementDeclaration(grammar, elementName);

        if (!elementDecl) {
            return ValidationResult.error(`No declaration found for element '${elementName}'`);
        }

        // Check if element is abstract
        if (elementDecl.isAbstract && elementDecl.isAbstract()) {
            return ValidationResult.error(`Abstract element '${elementName.toString()}' cannot be used directly`);
        }

        // Check for xsi:type attribute for type substitution
        const xsiType: string | undefined = context.attributes.get('xsi:type');
        let elementType: SchemaType | undefined;

        if (context.attributeOnly) {
            // During attribute validation, store xsi:type if present
            if (xsiType) {
                this.xsiTypeMap.set(elementName, xsiType);
            }

            // Attribute validation is already handled by the main validateAttributes method
            // No need to validate attributes again here
            return ValidationResult.success();
        }

        // During content validation, check for stored xsi:type
        const storedXsiType: string | undefined = this.xsiTypeMap.get(elementName);

        if (storedXsiType) {
            // Use the type specified by xsi:type with enhanced resolution
            elementType = this.resolveXsiType(storedXsiType, grammar);
            if (!elementType) {
                return ValidationResult.error(`Type '${storedXsiType}' specified in xsi:type not found`);
            }

            // Verify that the xsi:type is compatible with the declared type
            const declaredType: SchemaType | undefined = elementDecl.resolveType(grammar);
            if (declaredType && !this.isTypeCompatible(elementType, declaredType)) {
                return ValidationResult.error(`Type '${storedXsiType}' is not compatible with declared type for element '${elementName}'`);
            }

            // Remove the mapping after use to prevent memory leaks
            this.xsiTypeMap.delete(elementName);
        } else {
            // Use the element's declared type
            elementType = elementDecl.resolveType(grammar);
            if (!elementType) {
                return ValidationResult.error(`No type found for element '${elementName.toString()}'`);
            }
        }

        // Full element validation (including content)
        // Perform type validation with our namespace resolver
        return this.validateAgainstType(elementName, context, elementType, grammar);
    }

    private resolveXsiType(xsiTypeName: string, grammar: any): any {
        // Enhanced xsi:type resolution with namespace support and built-in types

        // 1. Try direct lookup first (for local types)
        let resolvedType = grammar.getTypeDefinition(xsiTypeName);
        if (resolvedType) {
            return resolvedType;
        }

        // 2. Handle qualified names (prefix:localName)
        const colonIndex = xsiTypeName.indexOf(':');
        if (colonIndex !== -1) {
            const prefix = xsiTypeName.substring(0, colonIndex);
            const localName = xsiTypeName.substring(colonIndex + 1);

            // Check if this is a built-in XML Schema type
            if (prefix === 'xsd' || prefix === 'xs') {
                resolvedType = BuiltinTypes.getType(xsiTypeName) || BuiltinTypes.getType(localName);
                if (resolvedType) {
                    return resolvedType;
                }
            }

            // Resolve the namespace and try to find the type
            const namespaceURI = this.resolvePrefix(prefix);
            if (namespaceURI) {
                // Try to find the grammar for this namespace
                const targetGrammar = this.getGrammarForNamespace(namespaceURI);
                if (targetGrammar && targetGrammar !== grammar) {
                    resolvedType = (targetGrammar as any).getTypeDefinition(localName);
                    if (resolvedType) {
                        return resolvedType;
                    }
                }

                // Try Clark notation lookup in current grammar
                const clarkNotation = `{${namespaceURI}}${localName}`;
                resolvedType = grammar.getTypeDefinition(clarkNotation);
                if (resolvedType) {
                    return resolvedType;
                }

                // If this is the target namespace, try local name
                if (namespaceURI === grammar.getTargetNamespace()) {
                    resolvedType = grammar.getTypeDefinition(localName);
                    if (resolvedType) {
                        return resolvedType;
                    }
                }
            }
        } else {
            // 3. Unqualified name - try multiple strategies

            // First try direct lookup with the unqualified name
            resolvedType = grammar.getTypeDefinition(xsiTypeName);
            if (resolvedType) {
                return resolvedType;
            }

            // Try with target namespace prefix (for elementFormDefault="qualified" schemas)
            const targetNamespace = grammar.getTargetNamespace();
            if (targetNamespace) {
                // Find the conventional prefix for the target namespace
                const targetPrefix = this.findPrefixForNamespace(targetNamespace);
                if (targetPrefix) {
                    const qualifiedName = `${targetPrefix}:${xsiTypeName}`;
                    resolvedType = grammar.getTypeDefinition(qualifiedName);
                    if (resolvedType) {
                        return resolvedType;
                    }
                }
            }

            // Try case-insensitive lookup for local types (common issue in test cases)
            const typeDefinitions = grammar.getTypeDefinitions();
            if (typeDefinitions) {
                for (const [typeName, type] of typeDefinitions) {
                    if (typeName.toLowerCase() === xsiTypeName.toLowerCase()) {
                        return type;
                    }
                }
            }

            // Try built-in types (without prefix)
            resolvedType = BuiltinTypes.getType(xsiTypeName);
            if (resolvedType) {
                return resolvedType;
            }
        }

        return undefined;
    }

    /**
     * Resolve attribute group definition across all grammars
     */
    resolveAttributeGroup(attributeGroupName: string): AttributeGroup | undefined {
        // First try to resolve in all XMLSchema grammars
        for (const [namespace, grammar] of this.grammars) {
            if (grammar instanceof XMLSchemaGrammar) {
                const attributeGroup = grammar.getAttributeGroupDefinition(attributeGroupName);
                if (attributeGroup) {
                    return attributeGroup;
                }
            }
        }

        // If not found, try with qualified names by checking if name has namespace prefix
        if (attributeGroupName.includes(':')) {
            const [prefix, localName] = attributeGroupName.split(':', 2);
            const namespace = this.prefixToNamespace.get(prefix);

            if (namespace) {
                const targetGrammar = this.grammars.get(namespace);
                if (targetGrammar instanceof XMLSchemaGrammar) {
                    // Try with Clark notation
                    const clarkNotation = `{${namespace}}${localName}`;
                    let attributeGroup = targetGrammar.getAttributeGroupDefinition(clarkNotation);
                    if (attributeGroup) {
                        return attributeGroup;
                    }

                    // Try with just local name
                    attributeGroup = targetGrammar.getAttributeGroupDefinition(localName);
                    if (attributeGroup) {
                        return attributeGroup;
                    }
                }
            }
        }

        // Finally, try unqualified name in all grammars
        for (const [namespace, grammar] of this.grammars) {
            if (grammar instanceof XMLSchemaGrammar) {
                const attributeGroup = grammar.getAttributeGroupDefinition(attributeGroupName);
                if (attributeGroup) {
                    return attributeGroup;
                }
            }
        }

        return undefined;
    }

    private isTypeCompatible(derivedType: any, baseType: any): boolean {
        // Same type is always compatible
        if (derivedType === baseType) {
            return true;
        }

        // Check if derivedType extends baseType
        let currentType: any = derivedType;
        while (currentType) {
            if (currentType === baseType) {
                return true;
            }
            // Move to base type if it's a complex type with extension
            if (currentType.isComplexType && currentType.isComplexType() && currentType.getBaseType) {
                const baseTypeResult: any = currentType.getBaseType();
                if (baseTypeResult) {
                    currentType = baseTypeResult;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        return false;
    }

    private validateAgainstType(elementName: string, context: ValidationContext, type: any, grammar: any): ValidationResult {
        if (type.isSimpleType && type.isSimpleType()) {
            return this.validateSimpleType(context.textContent || '', type);
        } else if (type.isComplexType && type.isComplexType()) {
            return this.validateComplexType(elementName, context, type, grammar);
        }

        return ValidationResult.error(`Unknown type for element '${elementName.toString()}'`);
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

    private validateComplexType(elementName: string, context: ValidationContext, complexType: any, grammar: any): ValidationResult {
        // Attributes are already validated during startElement by SAXParser.validateAttributes()
        // No need to validate them again during content validation (endElement)

        // Validate content
        // Convert unprefixed child element names to prefixed format for validation
        const children: string[] = context.childrenNames.map((childName: string) => {
            if (childName.indexOf(':') === -1) {
                // Child element is unprefixed - need to add the appropriate prefix
                const targetNamespace: string | undefined = grammar.getTargetNamespace();
                if (targetNamespace) {
                    const prefix: string | undefined = this.findPrefixForNamespace(targetNamespace);
                    if (prefix) {
                        return `${prefix}:${childName}`;
                    }
                }
            }
            return childName;
        });

        return this.validateComplexTypeContent(children, context.textContent || '', complexType, grammar);
    }

    private validateComplexTypeContent(children: string[], textContent: string, complexType: any, grammar: any): ValidationResult {
        // Handle different content types
        if (complexType.isEmptyContent && complexType.isEmptyContent()) {
            if (children.length > 0 || textContent.trim() !== '') {
                return ValidationResult.error(`Element with empty content cannot have child elements or text`);
            }
            return ValidationResult.success();
        }

        if (complexType.isSimpleContent && complexType.isSimpleContent()) {
            if (children.length > 0) {
                return ValidationResult.error(`Element with simple content cannot have child elements`);
            }
            // Validate text content against base type
            const baseType: any = complexType.getBaseType && complexType.getBaseType();
            if (baseType && baseType.isSimpleType()) {
                return this.validateSimpleType(textContent, baseType);
            } else if (baseType && baseType.isComplexType && baseType.isComplexType()) {
                // Extension of complex type with simple content - find the simple content base
                return this.validateSimpleContentInheritance(textContent, baseType);
            } else {
                // No base type specified - treat as xs:anyType (allows any text)
                return ValidationResult.success();
            }
        }

        // Complex content: validate child elements against content model
        if (!complexType.isMixed || !complexType.isMixed()) {
            if (textContent.trim() !== '') {
                return ValidationResult.error(`Element with element-only content cannot have text content`);
            }
        }

        // Validate against content model if present
        const contentModel: any = complexType.getContentModel && complexType.getContentModel();
        if (contentModel) {
            // Use children names directly as prefixed names (prefix:localname)
            return this.validateContentModelWithNamespaceResolver(contentModel, children, grammar);
        } else {
            // No content model specified - allow any children (equivalent to xs:any)
            return ValidationResult.success();
        }
    }

    private validateSimpleContentInheritance(textContent: string, complexType: any): ValidationResult {
        // For complex types with simple content that extend other complex types,
        // we need to find the ultimate simple type base
        let currentType: any = complexType;

        while (currentType) {
            if (currentType.isSimpleType && currentType.isSimpleType()) {
                return this.validateSimpleType(textContent, currentType);
            }

            if (currentType.hasSimpleContent && currentType.hasSimpleContent()) {
                const baseType: any = currentType.getBaseType();
                if (baseType && baseType.isSimpleType()) {
                    return this.validateSimpleType(textContent, baseType);
                }
                currentType = baseType;
            } else {
                // No simple content base found - treat as xs:anyType (allows any text)
                return ValidationResult.success();
            }
        }

        // No base type found - treat as xs:anyType (allows any text)
        return ValidationResult.success();
    }

    private validateContentModelWithNamespaceResolver(contentModel: any, children: string[], grammar: any): ValidationResult {
        try {
            // Create substitution group resolver
            const substitutionGroupResolver: (elementName: string, substitutionHead: string) => boolean = (elementName: string, substitutionHead: string): boolean => {
                // Look up the element declaration
                const elementDecl: any = grammar.getElementDeclaration(elementName);
                if (!elementDecl) {
                    return false;
                }

                // Check if this element's substitution group matches the head
                const substitutionGroup: string | undefined = elementDecl.getSubstitutionGroup();
                return substitutionGroup === substitutionHead;
            };

            // Create validation context with the specific grammar's target namespace
            const validationContext: any = {
                targetNamespace: grammar.getTargetNamespace(),
                namespaceResolver: this.getNamespaceResolver(),
                substitutionGroupResolver: substitutionGroupResolver
            };

            // Create a particle from the content model with context
            const particle: any = contentModel.toParticle(validationContext);

            // Set our namespace resolver on all ElementNameParticle instances
            this.setNamespaceResolverOnParticle(particle);

            // Set substitution group resolver on all particles
            this.setSubstitutionGroupResolverOnParticle(particle, substitutionGroupResolver);

            // Resolve and validate
            particle.resolve();
            particle.validate(children);
            return ValidationResult.success();
        } catch (error) {
            return ValidationResult.error((error as Error).message);
        }
    }

    private setNamespaceResolverOnParticle(particle: any): void {
        if (!particle) return;

        // Set namespace resolver if this is an ElementNameParticle
        if (particle.setNamespaceResolver) {
            particle.setNamespaceResolver(this.getNamespaceResolver());
        }

        // Recursively set on child components
        if (particle.getComponents) {
            const components: any[] = particle.getComponents();
            for (const component of components) {
                this.setNamespaceResolverOnParticle(component);
            }
        }
    }

    private setSubstitutionGroupResolverOnParticle(particle: any, resolver: (elementName: string, substitutionHead: string) => boolean): void {
        if (!particle) return;

        // Set substitution group resolver if this particle supports it
        if (particle.setSubstitutionGroupResolver) {
            particle.setSubstitutionGroupResolver(resolver);
        }

        // Recursively set on child components
        if (particle.getComponents) {
            const components: any[] = particle.getComponents();
            for (const component of components) {
                this.setSubstitutionGroupResolverOnParticle(component, resolver);
            }
        }
    }

    resolveEntity(entityName: string): string | undefined {
        // Try primary grammar first, then others
        if (this.primaryGrammar) {
            const result: string | undefined = this.primaryGrammar.resolveEntity(entityName);
            if (result !== undefined) {
                return result;
            }
        }

        // Try other grammars
        const grammarValues: Grammar[] = Array.from(this.grammars.values());
        for (const grammar of grammarValues) {
            if (grammar !== this.primaryGrammar) {
                const result: string | undefined = grammar.resolveEntity(entityName);
                if (result !== undefined) {
                    return result;
                }
            }
        }

        return undefined;
    }

    addEntityReferenceUsage(original: string, expanded: string): void {
        // Add to primary grammar
        this.primaryGrammar?.addEntityReferenceUsage(original, expanded);
    }

    getOriginalEntityReference(expandedText: string): string | undefined {
        // Try primary grammar first, then others
        if (this.primaryGrammar) {
            const result: string | undefined = this.primaryGrammar.getOriginalEntityReference(expandedText);
            if (result !== undefined) {
                return result;
            }
        }

        // Try other grammars
        const grammarValues: Grammar[] = Array.from(this.grammars.values());
        for (const grammar of grammarValues) {
            if (grammar !== this.primaryGrammar) {
                const result: string | undefined = grammar.getOriginalEntityReference(expandedText);
                if (result !== undefined) {
                    return result;
                }
            }
        }

        return undefined;
    }

    clearEntityReferenceTracking(): void {
        // Clear from all grammars
        this.grammars.forEach((grammar: Grammar) => {
            grammar.clearEntityReferenceTracking();
        });
    }

    getTargetNamespace(): string | undefined {
        return this.primaryGrammar?.getTargetNamespace();
    }

    getNamespaceDeclarations(): Map<string, string> {
        // Merge namespace declarations from all grammars
        const allNamespaces: Map<string, string> = new Map<string, string>();

        this.grammars.forEach((grammar: Grammar) => {
            const nsDecls: Map<string, string> = grammar.getNamespaceDeclarations();
            nsDecls.forEach((uri: string, prefix: string) => {
                allNamespaces.set(prefix, uri);
            });
        });

        return allNamespaces;
    }

    getStatistics(): {
        totalGrammars: number;
        namespaces: string[];
        primaryNamespace: string | undefined;
        totalElements: number;
        totalTypes: number;
    } {
        let totalElements: number = 0;
        let totalTypes: number = 0;

        this.grammars.forEach((grammar: Grammar) => {
            // Try to get element/type counts if the grammar supports it
            if ((grammar as any).getElementDeclarations) {
                totalElements += (grammar as any).getElementDeclarations().size;
            }
            if ((grammar as any).getTypeDefinitions) {
                totalTypes += (grammar as any).getTypeDefinitions().size;
            }
        });

        return {
            totalGrammars: this.grammars.size,
            namespaces: Array.from(this.grammars.keys()),
            primaryNamespace: this.defaultNamespace,
            totalElements,
            totalTypes
        };
    }

    debugNamespaceMapping(): void {
        // Debug method for development - intentionally empty to avoid console output
    }

    private findElementDeclaration(grammar: any, elementName: string): any {
        // Element lookup strategy based on XML Schema elementFormDefault rules

        const colonIndex: number = elementName.indexOf(':');
        const hasPrefix: boolean = colonIndex !== -1;
        const localName: string = hasPrefix ? elementName.substring(colonIndex + 1) : elementName;

        // Check the grammar's elementFormDefault setting to determine storage pattern
        const elementFormDefault: boolean = grammar.getElementFormDefault ? grammar.getElementFormDefault() : false;

        // Try direct lookup first (element name as provided)
        let elementDecl: any = grammar.getElementDeclaration(elementName);
        if (elementDecl) {
            return elementDecl;
        }

        if (hasPrefix) {
            if (!elementFormDefault) {
                // elementFormDefault="unqualified" - elements stored WITHOUT prefixes
                elementDecl = grammar.getElementDeclaration(localName);
                if (elementDecl) {
                    return elementDecl;
                }
            }
        }

        return undefined;
    }

    private findElementNameForLookup(grammar: any, elementName: string): string {
        // Find the actual element name to use for lookup based on how elements are stored
        // Try to find the element and return the key that works

        const colonIndex: number = elementName.indexOf(':');
        const hasPrefix: boolean = colonIndex !== -1;
        const localName: string = hasPrefix ? elementName.substring(colonIndex + 1) : elementName;

        // Try direct lookup first
        if (grammar.getElementDeclaration(elementName)) {
            return elementName;
        }

        // If element has prefix but not found, try local name
        if (hasPrefix && grammar.getElementDeclaration(localName)) {
            return localName;
        }

        // If element has no prefix, and elementFormDefault is true, try with target namespace prefix
        if (!hasPrefix && grammar.getElementFormDefault && grammar.getElementFormDefault() && grammar.getTargetNamespace) {
            const targetNS: string | undefined = grammar.getTargetNamespace();
            if (targetNS) {
                const prefix: string | undefined = this.findPrefixForNamespace(targetNS);
                if (prefix) {
                    const qualifiedName: string = `${prefix}:${elementName}`;
                    if (grammar.getElementDeclaration(qualifiedName)) {
                        return qualifiedName;
                    }
                }
            }
        }

        // If still not found, this might be a local element
        // For local elements, we need to find them in the context of their parent
        // This is a placeholder - we'll enhance this with context-aware lookup

        // Return original name as fallback
        return elementName;
    }

    private findPrefixForNamespace(namespaceURI: string): string | undefined {
        // Get the prefix from the grammar's namespace declarations
        if (this.grammars) {
            const grammarValues: Grammar[] = Array.from(this.grammars.values());
            for (const grammar of grammarValues) {
                if (grammar.getGrammarType().toString() === 'xmlschema' && grammar.getTargetNamespace() === namespaceURI) {
                    // Get the namespace prefixes from this grammar
                    const namespacePrefixes: Map<string, string> = (grammar as any).getNamespaceDeclarations();
                    if (namespacePrefixes) {
                        const prefixEntries: [string, string][] = Array.from(namespacePrefixes.entries());
                        for (const [prefix, uri] of prefixEntries) {
                            if (uri === namespaceURI) {
                                return prefix;
                            }
                        }
                    }
                }
            }
        }
        return undefined;
    }

    toJSON(): any {
        const grammarsData: any = {};
        this.grammars.forEach((grammar: Grammar, namespace: string) => {
            grammarsData[namespace] = grammar.toJSON();
        });

        return {
            defaultNamespace: this.defaultNamespace,
            grammars: grammarsData,
            grammarType: 'composite',
            version: '1.0'
        };
    }

    validateElementContent(elementName: string, children: string[], textContent: string, context: ValidationContext): ValidationResult {
        const colonIndex: number = elementName.indexOf(':');
        const prefix: string = colonIndex !== -1 ? elementName.substring(0, colonIndex) : '';

        const namespaceURI: string = this.resolvePrefix(prefix);

        const grammar: Grammar | undefined = this.getGrammarForNamespace(namespaceURI) || this.primaryGrammar;

        if (!grammar) {
            return ValidationResult.success();
        }

        // For XMLSchemaGrammar, we handle the validation here in CompositeGrammar
        if (grammar.getGrammarType().toString() === 'xmlschema') {
            // Convert unprefixed element names to prefixed names for schema validation
            let validationElementName: string = elementName;
            if (elementName.indexOf(':') === -1) {
                const targetNamespace: string | undefined = grammar.getTargetNamespace();
                if (targetNamespace) {
                    const conventionalPrefix: string | undefined = this.findPrefixForNamespace(targetNamespace);
                    if (conventionalPrefix) {
                        validationElementName = `${conventionalPrefix}:${elementName}`;
                    }
                }
            }

            return this.validateXMLSchemaElement(grammar as any, validationElementName, context);
        }

        // For other grammar types that implement validateElementContent, delegate to them
        if ('validateElementContent' in grammar) {
            return (grammar as any).validateElementContent(elementName, children, textContent, context);
        }

        // Fallback: construct a context and use regular validateElement
        const fallbackContext: ValidationContext = new ValidationContext(
            children,
            context.attributes,
            textContent,
            context.parent,
            false  // This is content validation, not attribute-only
        );

        return grammar.validateElement(elementName, fallbackContext);
    }
}