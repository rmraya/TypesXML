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

import { NotationDecl } from "../dtd/NotationDecl";
import { AttributeInfo, Grammar, GrammarType, ValidationContext, ValidationResult } from "../grammar/Grammar";
import { XMLUtils } from "../XMLUtils";
import { SchemaAttributeDecl } from "./Attribute";
import { AttributeGroup } from "./AttributeGroup";
import { BuiltinTypes } from "./BuiltinTypes";
import { ComplexType } from "./ComplexType";
import { ContentModel } from "./ContentModel";
import { SchemaElementDecl } from "./Element";
import { SchemaType } from "./SchemaType";

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

    // Attribute group definitions
    private attributeGroupDefinitions: Map<string, AttributeGroup> = new Map();

    // Namespace mappings
    private namespaces: Map<string, string> = new Map();

    // Entity reference tracking for canonicalization compatibility
    private entityReferences: Map<string, string> = new Map();

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

    addGroupDefinition(name: string, group: ContentModel): void {
        this.groupDefinitions.set(name, group);
    }

    getGroupDefinition(name: string): ContentModel | undefined {
        return this.groupDefinitions.get(name);
    }

    getGroupDefinitions(): Map<string, ContentModel> {
        return this.groupDefinitions;
    }

    addAttributeGroupDefinition(name: string, group: AttributeGroup): void {
        this.attributeGroupDefinitions.set(name, group);
    }

    getAttributeGroupDefinition(name: string): AttributeGroup | undefined {
        return this.attributeGroupDefinitions.get(name);
    }

    getAttributeGroupDefinitions(): Map<string, AttributeGroup> {
        return this.attributeGroupDefinitions;
    }

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

    validateElement(elementName: string, context: ValidationContext): ValidationResult {
        // XMLSchemaGrammar only provides infrastructure - no validation logic
        // Just verify element exists in schema
        const elementDecl: SchemaElementDecl | undefined = this.getElementDeclaration(elementName);
        if (!elementDecl) {
            return ValidationResult.error(`No declaration found for element '${elementName.toString()}'`);
        }

        if (elementDecl.isAbstract()) {
            return ValidationResult.error(`Abstract element '${elementName.toString()}' cannot be used directly`);
        }

        // Element exists - validation will be handled by CompositeGrammar
        return ValidationResult.success();
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
        // XMLSchemaGrammar only provides infrastructure - no validation logic
        // Just verify element exists and perform basic structural checks
        const elementDecl: SchemaElementDecl | undefined = this.getElementDeclaration(elementName);
        if (!elementDecl) {
            return ValidationResult.success();
        }

        const type: SchemaType | undefined = elementDecl.resolveType(this);
        if (!type) {
            return ValidationResult.success();
        }

        // Basic structural check: simple types cannot have attributes
        if (!type.isComplexType() && attributes.size > 0) {
            return ValidationResult.error(`Element '${elementName.toString()}' with simple type cannot have attributes`);
        }

        // Detailed attribute validation will be handled by CompositeGrammar
        return ValidationResult.success();
    }

    getElementAttributes(elementName: string): Map<string, AttributeInfo> {
        const elementDecl: SchemaElementDecl | undefined = this.getElementDeclaration(elementName);
        if (!elementDecl) {
            return new Map();
        }

        const type: SchemaType | undefined = elementDecl.resolveType(this);
        if (type && type.isComplexType()) {
            const complexType: ComplexType = type as ComplexType;
            const attrs = complexType.getAttributeInfos();
            return attrs;
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
        // XMLSchemaGrammar only provides structure information
        // Actual validation is handled by CompositeGrammar
        return ValidationResult.success();
    }

    // ========================================================================
    // CONTENT VALIDATION METHODS REMOVED
    // Content validation is now handled by CompositeGrammar
    // XMLSchemaGrammar only provides infrastructure and schema structure validation
    // ========================================================================

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

    static fromJSON(data: {
        targetNamespace?: string;
        schemaLocation?: string;
        elementFormDefault?: boolean;
        attributeFormDefault?: boolean;
        namespaces?: Record<string, string>;
    }): XMLSchemaGrammar {
        // Deserialization from pre-compiled grammars
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