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

import { Grammar, GrammarType, AttributeInfo, ValidationContext, ValidationResult } from './Grammar';
import { XMLSchemaGrammar } from '../schema/XMLSchemaGrammar';
import { ContentModel } from '../schema/ContentModel';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export class CompositeGrammar implements Grammar {
    private grammars: Map<string, Grammar> = new Map();
    private primaryGrammar: Grammar | undefined;
    private prefixToNamespace: Map<string, string> = new Map<string, string>();
    private defaultNamespace: string = '';

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

    getLoadedGrammarList(): Array<{namespace: string, type: string, elementCount?: number, typeCount?: number}> {
        const grammarList: Array<{namespace: string, type: string, elementCount?: number, typeCount?: number}> = [];
        
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
            const elementName_ForLookup = this.findElementNameForLookup(grammar as any, elementName);
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
            const elementName_ForLookup = this.findElementNameForLookup(grammar as any, elementName);
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
        const colonIndex: number = elementName.indexOf(':');
        const elementPrefix: string = colonIndex !== -1 ? elementName.substring(0, colonIndex) : '';
        const elementNamespaceURI: string = this.resolvePrefix(elementPrefix);
        
        const elementGrammar: Grammar | undefined = this.getGrammarForNamespace(elementNamespaceURI) || this.primaryGrammar;
        if (!elementGrammar) {
            return ValidationResult.success();
        }

        // For XMLSchemaGrammar, we need to validate attributes per namespace
        if (elementGrammar.getGrammarType().toString() === 'xmlschema') {
            return this.validateAttributesPerNamespace(elementName, attributes, context, elementGrammar);
        }
        
        // For other grammar types, delegate to the grammar
        return elementGrammar.validateAttributes(elementName, attributes, context);
    }

    private validateAttributesPerNamespace(elementName: string, attributes: Map<string, string>, context: ValidationContext, elementGrammar: Grammar): ValidationResult {
        const allErrors: any[] = [];

        // Group attributes by namespace
        const attributesByNamespace = new Map<string, Map<string, string>>();
        
        for (const [attrName, attrValue] of attributes) {
            const attrColonIndex: number = attrName.indexOf(':');
            let attrNamespaceURI: string = '';
            
            if (attrColonIndex !== -1) {
                // Prefixed attribute - resolve namespace
                const attrPrefix: string = attrName.substring(0, attrColonIndex);
                attrNamespaceURI = this.resolvePrefix(attrPrefix);
            } else {
                // Unprefixed attribute - belongs to no namespace (not default namespace)
                // According to XML Namespaces spec, unprefixed attributes are always in no namespace
                attrNamespaceURI = '';
            }
            
            // Use the actual namespace URI as key, or 'no-namespace' for empty namespace
            const namespaceKey = attrNamespaceURI || 'no-namespace';
            
            if (!attributesByNamespace.has(namespaceKey)) {
                attributesByNamespace.set(namespaceKey, new Map());
            }
            attributesByNamespace.get(namespaceKey)!.set(attrName, attrValue);
        }

        // Validate attributes from each namespace
        for (const [namespaceKey, namespacedAttributes] of attributesByNamespace) {
            let targetGrammar: Grammar | undefined;
            
            if (namespaceKey === 'no-namespace') {
                // Unprefixed attributes - validate against element's grammar
                targetGrammar = elementGrammar;
            } else {
                // Prefixed attributes - find appropriate grammar for their namespace
                targetGrammar = this.getGrammarForNamespace(namespaceKey);
                if (!targetGrammar) {
                    // If no specific grammar found for the namespace, validate against element's grammar
                    // This handles cases where attributes from unknown namespaces should be checked
                    targetGrammar = elementGrammar;
                }
            }

            if (targetGrammar) {
                const namespaceResult = (targetGrammar as any).validateAttributes(elementName, namespacedAttributes, context);
                if (!namespaceResult.isValid) {
                    allErrors.push(...namespaceResult.errors);
                }
            }
        }

        return allErrors.length > 0 ? new ValidationResult(false, allErrors) : ValidationResult.success();
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

        // If this is attribute-only validation, only validate attributes
        if (context.attributeOnly) {
            // Get the element's type for attribute validation
            const elementType: any = elementDecl.resolveType(grammar);
            if (!elementType) {
                return ValidationResult.error(`No type found for element '${elementName.toString()}'`);
            }
            
            // Only validate attributes, not content
            if (elementType.isComplexType && elementType.isComplexType()) {
                return this.validateComplexTypeAttributes(context.attributes, elementType);
            }
            
            // Simple types don't have attributes (except for built-in ones)
            return ValidationResult.success();
        }

        // Full element validation (including content)
        const elementType: any = elementDecl.resolveType(grammar);
        if (!elementType) {
            return ValidationResult.error(`No type found for element '${elementName.toString()}'`);
        }

        // Perform type validation with our namespace resolver
        return this.validateAgainstType(elementName, context, elementType, grammar);
    }

    private validateAgainstType(elementName: string, context: ValidationContext, type: any, grammar: any): ValidationResult {
        if (type.isSimpleType && type.isSimpleType()) {
            return this.validateSimpleType(context.textContent || '', type);
        } else if (type.isComplexType && type.isComplexType()) {
            return this.validateComplexType(elementName, context, type, grammar);
        }
        
        return ValidationResult.error(`Unknown type for element '${elementName.toString()}'`);
    }

    private validateSimpleType(textContent: string, simpleType: any): ValidationResult {
        // Basic simple type validation - can be enhanced
        return ValidationResult.success();
    }

    private validateComplexType(elementName: string, context: ValidationContext, complexType: any, grammar: any): ValidationResult {
        // Validate attributes first - use the simple stub for now to avoid double validation
        // Note: Attributes are already validated by SAXParser.validateAttributes() 
        const attributeValidation: ValidationResult = this.validateComplexTypeAttributes(context.attributes, complexType);
        if (!attributeValidation.isValid) {
            return attributeValidation;
        }

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

    private validateComplexTypeAttributes(attributes: Map<string, string>, complexType: any): ValidationResult {
        // This method should delegate to the proper Grammar.validateAttributes method
        // However, we need the element name and context which are not passed here
        // For now, return success - actual attribute validation happens in validateAttributes method
        return ValidationResult.success();
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
            }
            return ValidationResult.success();
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

    private validateContentModelWithNamespaceResolver(contentModel: any, children: string[], grammar: any): ValidationResult {
        try {
            // Create substitution group resolver
            const substitutionGroupResolver = (elementName: string, substitutionHead: string): boolean => {
                // Look up the element declaration
                const elementDecl = grammar.getElementDeclaration(elementName);
                if (!elementDecl) {
                    return false;
                }
                
                // Check if this element's substitution group matches the head
                const substitutionGroup = elementDecl.getSubstitutionGroup();
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
            const targetNS = grammar.getTargetNamespace();
            if (targetNS) {
                const prefix = this.findPrefixForNamespace(targetNS);
                if (prefix) {
                    const qualifiedName = `${prefix}:${elementName}`;
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
}