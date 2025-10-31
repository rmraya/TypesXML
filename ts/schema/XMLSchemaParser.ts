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

import { dirname, isAbsolute, resolve } from "path";
import { Catalog } from "../Catalog";
import { XMLUtils } from "../XMLUtils";
import { SAXParser } from "../SAXParser";
import { SchemaAttributeDecl } from "./Attribute";
import { AttributeGroup } from "./AttributeGroup";
import { ComplexType } from "./ComplexType";
import { ContentModel } from "./ContentModel";
import { SchemaElementDecl } from "./Element";
import { SchemaParsingHandler } from "./SchemaParsingHandler";
import { SchemaType } from "./SchemaType";
import { SequenceModel } from "./SequenceModel";
import { XMLSchemaGrammar } from "./XMLSchemaGrammar";

export class XMLSchemaParser {
    private static instance: XMLSchemaParser;
    private catalog?: Catalog;
    private globalProcessedSchemas = new Set<string>(); // Tracks schemas processed to avoid redundant reparsing
    private currentlyParsingNamespaces = new Set<string>(); // Tracks namespaces currently being parsed
    private parsedGrammars = new Map<string, XMLSchemaGrammar>(); // Persistent cache
    private crossSchemaResolver?: (qualifiedName: string) => ContentModel | undefined;
    private crossSchemaAttributeGroupResolver?: (qualifiedName: string) => AttributeGroup | undefined;

    private resolveTypeAcrossSchemas(typeName: string, currentGrammar: XMLSchemaGrammar): SchemaType | undefined {
        for (const grammar of this.parsedGrammars.values()) {
            if (grammar === currentGrammar) {
                continue;
            }

            const resolved = grammar.getTypeDefinition(typeName);
            if (resolved) {
                return resolved;
            }

            if (!typeName.includes(':') && !typeName.startsWith('{')) {
                const targetNamespace = currentGrammar.getTargetNamespace?.();
                if (targetNamespace) {
                    const clarkName = `{${targetNamespace}}${typeName}`;
                    const clarkResolved = grammar.getTypeDefinition(clarkName);
                    if (clarkResolved) {
                        return clarkResolved;
                    }
                }
            }
        }

        return undefined;
    }

    private constructor() {
        // Private constructor for singleton
    }

    static getInstance(): XMLSchemaParser {
        if (!XMLSchemaParser.instance) {
            XMLSchemaParser.instance = new XMLSchemaParser();
        }
        return XMLSchemaParser.instance;
    }

    setCatalog(catalog: Catalog): void {
        this.catalog = catalog;
    }

    setCrossSchemaResolver(resolver: (qualifiedName: string) => ContentModel | undefined): void {
        this.crossSchemaResolver = resolver;
    }

    setCrossSchemaAttributeGroupResolver(resolver: (qualifiedName: string) => AttributeGroup | undefined): void {
        this.crossSchemaAttributeGroupResolver = resolver;
    }

    isSchemaAlreadyParsed(namespace?: string): boolean {
        // Use namespace as cache key since that's what matters for grammar lookup
        const cacheKey: string = namespace || '';
        return this.parsedGrammars.has(cacheKey);
    }

    isNamespaceCurrentlyBeingParsed(namespace?: string): boolean {
        const cacheKey: string = namespace || '';
        return this.currentlyParsingNamespaces.has(cacheKey);
    }

    getCachedSchema(namespace?: string): XMLSchemaGrammar | null {
        // Use namespace as cache key since that's what matters for grammar lookup
        const cacheKey: string = namespace || '';
        return this.parsedGrammars.get(cacheKey) || null;
    }

    hasProcessedSchemaPath(schemaPath: string): boolean {
        return this.globalProcessedSchemas.has(schemaPath);
    }

    parseSchema(schemaPath: string, defaultNamespace?: string, throwOnValidationError: boolean = false): XMLSchemaGrammar | null {
        // Use namespace as primary cache key; fall back to the absolute schema path when unavailable
        const cacheKey: string = defaultNamespace ?? schemaPath;

        const schemaAlreadyProcessed: boolean = this.globalProcessedSchemas.has(schemaPath);

        // Check if we already have a parsed grammar for this namespace or specific schema
        if (schemaAlreadyProcessed && this.parsedGrammars.has(cacheKey)) {
            return this.parsedGrammars.get(cacheKey)!;
        }

        try {
            // Track namespace being parsed to avoid recursive calls
            const inProgressKey: string = defaultNamespace ?? schemaPath;
            this.currentlyParsingNamespaces.add(inProgressKey);

            const schemaGrammar: XMLSchemaGrammar | null = this.parseSchemaFile(schemaPath, defaultNamespace, throwOnValidationError);

            // Remove from currently parsing when done
            this.currentlyParsingNamespaces.delete(inProgressKey);

            if (schemaGrammar) {
                // Set validating mode on grammar based on throwOnValidationError parameter
                schemaGrammar.setValidating(throwOnValidationError);

                // Perform comprehensive validation after parsing is complete
                schemaGrammar.validateGrammar();

                // Cache the parsed grammar
                this.parsedGrammars.set(cacheKey, schemaGrammar);
                this.globalProcessedSchemas.add(schemaPath);

                return schemaGrammar;
            }
            return null;
        } catch (error) {
            // Remove from currently parsing on error
            const inProgressKey: string = defaultNamespace ?? schemaPath;
            this.currentlyParsingNamespaces.delete(inProgressKey);
            console.warn(`XMLSchemaParser: Error parsing schema "${schemaPath}": ${(error as Error).message}`);
            return null;
        }
    }

    private parseSchemaFile(schemaPath: string, targetNamespace?: string, throwOnValidationError: boolean = false): XMLSchemaGrammar | null {
        try {
            const grammar: XMLSchemaGrammar = new XMLSchemaGrammar(targetNamespace);
            const parser: SAXParser = new SAXParser();

            // Pass the catalog to avoid creating new instances
            if (this.catalog) {
                parser.setCatalog(this.catalog);
            }

            const schemaHandler: SchemaParsingHandler = new SchemaParsingHandler(grammar, this.crossSchemaResolver);

            if (this.catalog) {
                schemaHandler.setCatalog(this.catalog);
            }

            // Parse the schema file
            parser.setContentHandler(schemaHandler);
            parser.parseFile(schemaPath);

            // Process schema imports and includes
            const imports = schemaHandler.getImports();
            const redefines: string[] = schemaHandler.getRedefines();
            const includes: string[] = schemaHandler.getIncludes();

            // Process redefines before includes/imports so original definitions are available for extension
            for (const redefineLocation of redefines) {
                if (!redefineLocation) {
                    continue;
                }
                try {
                    let resolvedPath: string = redefineLocation;
                    if (!isAbsolute(redefineLocation) && !redefineLocation.startsWith('http')) {
                        const schemaDir: string = dirname(schemaPath);
                        resolvedPath = resolve(schemaDir, redefineLocation);
                    }

                    const redefinedGrammar: XMLSchemaGrammar | null = this.parseSchema(resolvedPath, undefined, false);
                    if (redefinedGrammar) {
                        this.mergeRedefinedSchemaComponents(grammar, redefinedGrammar);
                    }
                } catch (error) {
                    console.warn(`Failed to process redefine: ${redefineLocation} - ${error}`);
                }
            }

            // Process includes first (inherit parent's target namespace)
            for (const includeLocation of includes) {
                if (includeLocation) {
                    try {
                        // Resolve include path relative to current schema
                        let resolvedPath: string = includeLocation;
                        if (!isAbsolute(includeLocation) && !includeLocation.startsWith('http')) {
                            const schemaDir: string = dirname(schemaPath);
                            resolvedPath = resolve(schemaDir, includeLocation);
                        }

                        // For xsd:include, the included schema inherits the parent's target namespace
                        // Use the parent schema's target namespace that was already parsed
                        const parentTargetNamespace = schemaHandler.getTargetNamespace();
                        const includedGrammar = this.parseSchema(resolvedPath, parentTargetNamespace, false);
                        if (includedGrammar && includedGrammar instanceof XMLSchemaGrammar) {
                            // Direct merge of components from included schema
                            // Components need proper namespace qualification since they inherit parent's target namespace

                            const includedTypes = (includedGrammar as any).types as Map<string, any>;
                            const includedElements = (includedGrammar as any).elementDeclarations as Map<string, any>;
                            const includedAttributes = (includedGrammar as any).attributeDeclarations as Map<string, any>;
                            const includedAttributeGroups = (includedGrammar as any).attributeGroupDefinitions as Map<string, AttributeGroup>;

                            // Get the namespace prefix for the target namespace
                            const parentPrefixes = schemaHandler.getNamespacePrefixes();
                            let targetPrefix = '';
                            for (const [prefix, uri] of parentPrefixes) {
                                if (uri === parentTargetNamespace) {
                                    targetPrefix = prefix;
                                    break;
                                }
                            }

                            // Copy with proper qualification for components that inherit the target namespace
                            for (const [name, type] of includedTypes) {
                                const qualifiedName = targetPrefix && !name.includes(':') ? `${targetPrefix}:${name}` : name;
                                grammar.addTypeDefinition(qualifiedName, type);
                            }

                            for (const [name, element] of includedElements) {
                                const qualifiedName = targetPrefix && !name.includes(':') ? `${targetPrefix}:${name}` : name;
                                grammar.addElementDeclaration(qualifiedName, element);
                            }

                            for (const [name, attribute] of includedAttributes) {
                                const qualifiedName = targetPrefix && !name.includes(':') ? `${targetPrefix}:${name}` : name;
                                grammar.addAttributeDeclaration(qualifiedName, attribute);
                            }

                            for (const [name, attributeGroup] of includedAttributeGroups) {
                                const qualifiedName = targetPrefix && !name.includes(':') ? `${targetPrefix}:${name}` : name;
                                grammar.addAttributeGroupDefinition(qualifiedName, attributeGroup);
                            }
                        }
                    } catch (error) {
                        console.warn(`Failed to process include: ${includeLocation} - ${error}`);
                    }
                }
            }

            // Process imports (parse imported schemas and cache them for the GrammarHandler)
            for (const importInfo of imports) {
                if (importInfo.namespace && importInfo.schemaLocation) {
                    try {
                        // Resolve import path relative to current schema
                        let resolvedPath: string = importInfo.schemaLocation;
                        if (!isAbsolute(importInfo.schemaLocation) && !importInfo.schemaLocation.startsWith('http')) {
                            const schemaDir: string = dirname(schemaPath);
                            resolvedPath = resolve(schemaDir, importInfo.schemaLocation);
                        }

                        // For xsd:import, parse the imported schema with its own target namespace
                        // The imported grammar will be cached and available to the GrammarHandler
                        this.parseSchema(resolvedPath, importInfo.namespace, false);
                    } catch (error) {
                        console.warn(`Failed to process import: ${importInfo.schemaLocation} - ${error}`);
                    }
                }
            }

            // Transfer namespace prefixes from handler to grammar
            const namespacePrefixes: Map<string, string> = schemaHandler.getNamespacePrefixes();
            const namespacePrefixEntries: [string, string][] = Array.from(namespacePrefixes.entries());
            for (const [prefix, uri] of namespacePrefixEntries) {
                grammar.addNamespaceDeclaration(prefix, uri);
            }

            // Transfer group definitions from handler to grammar
            const groupDefinitions: Map<string, ContentModel> = schemaHandler.getGroupDefinitions();
            const groupEntries: [string, ContentModel][] = Array.from(groupDefinitions.entries());
            for (const [name, group] of groupEntries) {
                grammar.addGroupDefinition(name, group);
            }

            // Transfer attribute group definitions from handler to grammar
            const attributeGroupDefinitions: Map<string, AttributeGroup> = schemaHandler.getAttributeGroupDefinitions();
            const attributeGroupEntries: [string, AttributeGroup][] = Array.from(attributeGroupDefinitions.entries());
            for (const [name, attributeGroup] of attributeGroupEntries) {
                grammar.addAttributeGroupDefinition(name, attributeGroup);
            }

            // Resolve attribute group references now that all includes have been processed
            this.resolveAttributeGroupReferences(schemaHandler, grammar);

            // Resolve type references - this handles both syntax validation and resolution
            this.resolveTypeHierarchy(grammar);

            return grammar;
        } catch (error) {
            // In validation mode, throw errors instead of just logging them
            if (throwOnValidationError) {
                throw error;
            } else {
                // Only log actual parsing errors, not type resolution issues
                console.warn(`Schema file parsing failed for ${schemaPath}:`, (error as Error).message);
                return null;
            }
        }
    }

    parseInlineSchema(schemaContent: string, targetNamespace?: string): XMLSchemaGrammar {
        const grammar: XMLSchemaGrammar = new XMLSchemaGrammar(targetNamespace);
        const parser: SAXParser = new SAXParser();

        // Pass the catalog to avoid creating new instances
        if (this.catalog) {
            parser.setCatalog(this.catalog);
        }

    const schemaHandler: SchemaParsingHandler = new SchemaParsingHandler(grammar, this.crossSchemaResolver);

        if (this.catalog) {
            schemaHandler.setCatalog(this.catalog);
        }

        // Parse the schema content
        parser.setContentHandler(schemaHandler);
        parser.parseString(schemaContent);

        // Transfer namespace prefixes from handler to grammar
        const namespacePrefixes: Map<string, string> = schemaHandler.getNamespacePrefixes();
        const namespacePrefixEntries: [string, string][] = Array.from(namespacePrefixes.entries());
        for (const [prefix, uri] of namespacePrefixEntries) {
            grammar.addNamespaceDeclaration(prefix, uri);
        }

        // Transfer group definitions from handler to grammar
        const groupDefinitions: Map<string, ContentModel> = schemaHandler.getGroupDefinitions();
        const groupEntries: [string, ContentModel][] = Array.from(groupDefinitions.entries());
        for (const [name, group] of groupEntries) {
            grammar.addGroupDefinition(name, group);
        }

        // Resolve type references
        this.resolveTypeHierarchy(grammar);

        return grammar;
    }

    private resolveTypeHierarchy(grammar: XMLSchemaGrammar): void {
        // Phase 1: Resolve element type references
        const elementDeclarations: Map<string, any> = grammar.getElementDeclarations();
        const elementEntries: [string, any][] = Array.from(elementDeclarations.entries());

        for (const [elementName, elementDecl] of elementEntries) {
            XMLUtils.ignoreUnused(elementName);
            const typeName: any = elementDecl.getTypeName();
            if (typeName && !elementDecl.getType()) {
                // Use the enhanced getTypeDefinition method which handles qualified names
                let typeDefinition: any = grammar.getTypeDefinition(typeName.toString());
                if (!typeDefinition) {
                    typeDefinition = this.resolveTypeAcrossSchemas(typeName.toString(), grammar);
                }

                if (typeDefinition) {
                    elementDecl.setType(typeDefinition);
                }
                // Note: We don't log unresolved types here anymore - that's handled by validateTypeReferences
                // which distinguishes between syntax errors and resolution issues
            }
        }

        // Phase 2: Resolve attribute type references  
        const attributeDeclarations: Map<string, any> = grammar.getAttributeDeclarations();
        const attributeEntries: [string, any][] = Array.from(attributeDeclarations.entries());

        for (const [attributeName, attributeDecl] of attributeEntries) {
            XMLUtils.ignoreUnused(attributeName);
            const attributeType = attributeDecl.getType();
            if (attributeType) {
                const typeName: any = attributeType.getTypeName();
                if (typeName && !attributeType.isBuiltInType && !attributeType.isBuiltInType()) {
                    let typeDefinition: any = grammar.getTypeDefinition(typeName.toString());
                    if (!typeDefinition) {
                        typeDefinition = this.resolveTypeAcrossSchemas(typeName.toString(), grammar);
                    }

                    if (typeDefinition) {
                        // Update the attribute's type with the resolved type
                        attributeDecl.setType(typeDefinition);
                    }
                }
            }
        }

        // Phase 3: Resolve complex type base type references
        const typeDefinitions: Map<string, any> = grammar.getTypeDefinitions();
        const typeEntries: [string, any][] = Array.from(typeDefinitions.entries());

        for (const [typeName, typeDefinition] of typeEntries) {
            XMLUtils.ignoreUnused(typeName);
            if (typeDefinition.isComplexType && typeDefinition.isComplexType()) {
                const baseTypeQName = typeDefinition.getBaseTypeQName();
                if (baseTypeQName && !typeDefinition.getBaseType()) {
                    let baseType = this.resolveTypeAcrossSchemas(baseTypeQName, grammar);
                    if (!baseType) {
                        baseType = grammar.getTypeDefinition(baseTypeQName);
                    }

                    if (baseType && baseType !== typeDefinition) {
                        typeDefinition.setBaseType(baseType);
                    }
                }
            }
        }

        // Phase 4: Resolve simple type base type references (for restrictions and extensions)
        for (const [typeName, typeDefinition] of typeEntries) {
            if (typeDefinition.isSimpleType && typeDefinition.isSimpleType()) {
                const baseTypeName = typeDefinition.getTypeName();
                if (baseTypeName && !typeDefinition.getBaseType &&
                    baseTypeName !== typeName) { // Avoid self-reference
                    let baseType = this.resolveTypeAcrossSchemas(baseTypeName, grammar);
                    if (!baseType) {
                        baseType = grammar.getTypeDefinition(baseTypeName);
                    }

                    if (baseType && typeDefinition.setBaseType && baseType !== typeDefinition) {
                        typeDefinition.setBaseType(baseType);
                    }
                }
            }
        }

        // Phase 5: Provide fallback types for critical elements that couldn't be resolved
        // This prevents complete validation failures for schemas with external dependencies
        for (const [elementName, elementDecl] of elementEntries) {
            XMLUtils.ignoreUnused(elementName);
            const typeName: any = elementDecl.getTypeName();
            if (typeName && !elementDecl.getType()) {
                // As a final fallback, try to create a simple string type for unresolved references
                // This prevents complete validation failures for schemas with external dependencies
                const fallbackType = grammar.getTypeDefinition('string') || grammar.getTypeDefinition('xs:string');
                if (fallbackType) {
                    elementDecl.setType(fallbackType);
                }
            }
        }
    }

    private resolveAttributeGroupReferences(handler: SchemaParsingHandler, grammar: XMLSchemaGrammar): void {
        // Resolve attribute group references after all parsing is complete
        const attributeGroupReferences = handler.getAttributeGroupReferences();
        for (const reference of attributeGroupReferences) {
            const { refQName, targetComplexType, elementPath } = reference;
            let resolved = false;

            // First try to resolve within the current grammar
            let attributeGroup = grammar.getAttributeGroupDefinition(refQName);
            if (!attributeGroup && this.crossSchemaAttributeGroupResolver) {
                // Try cross-schema resolution
                attributeGroup = this.crossSchemaAttributeGroupResolver(refQName);
            }

            if (!attributeGroup) {
                for (const cachedGrammar of this.parsedGrammars.values()) {
                    attributeGroup = cachedGrammar.getAttributeGroupDefinition(refQName);
                    if (attributeGroup) {
                        break;
                    }
                }
            }

            if (attributeGroup) {
                // Expand the attribute group by copying its attributes to the complex type
                const attributes = attributeGroup.getAttributes();
                for (const [attrName, attr] of attributes) {
                    targetComplexType.addAttribute(attrName, attr);
                }
                resolved = true;
            }

            if (!resolved) {
                console.warn(`Could not resolve attribute group reference: ${refQName} at ${elementPath}`);
            }
        }
    }

    private mergeRedefinedSchemaComponents(target: XMLSchemaGrammar, source: XMLSchemaGrammar): void {
        const namespace: string = target.getTargetNamespace?.() || source.getTargetNamespace?.() || '';

        const extractLocalName = (qualifiedName: string | undefined): string => {
            if (!qualifiedName) {
                return '';
            }

            if (qualifiedName.startsWith('{')) {
                const closeBrace: number = qualifiedName.indexOf('}');
                return closeBrace !== -1 ? qualifiedName.substring(closeBrace + 1) : qualifiedName;
            }

            const colonIndex: number = qualifiedName.indexOf(':');
            return colonIndex !== -1 ? qualifiedName.substring(colonIndex + 1) : qualifiedName;
        };

        const getCandidateNames = (grammar: XMLSchemaGrammar, name: string | undefined, localName: string): string[] => {
            const candidates: Set<string> = new Set();
            if (name && name.length > 0) {
                candidates.add(name);
            }
            if (localName.length > 0) {
                candidates.add(localName);
                if (namespace) {
                    candidates.add(`{${namespace}}${localName}`);
                }

                const namespaceDecls: Map<string, string> = grammar.getNamespaceDeclarations();
                for (const [prefix, uri] of namespaceDecls.entries()) {
                    if (uri === namespace && prefix) {
                        candidates.add(`${prefix}:${localName}`);
                    }
                }
            }
            return Array.from(candidates.values());
        };

        const resolveTypeInGrammar = (grammar: XMLSchemaGrammar, name: string | undefined, localName: string): SchemaType | undefined => {
            for (const candidate of getCandidateNames(grammar, name, localName)) {
                const match: SchemaType | undefined = grammar.getTypeDefinition(candidate);
                if (match) {
                    return match;
                }
            }
            return undefined;
        };

        // Merge namespace declarations from the redefined schema so aliases remain available
        const sourceNamespaces: Map<string, string> = source.getNamespaceDeclarations();
        for (const [prefix, uri] of sourceNamespaces.entries()) {
            const targetNamespaces: Map<string, string> = target.getNamespaceDeclarations();
            if (!targetNamespaces.has(prefix)) {
                target.addNamespaceDeclaration(prefix, uri);
            }
        }

        // Track which component local names are redefined in the target
        const redefinedTypesByLocalName: Map<string, SchemaType> = new Map();
        const targetTypes: Map<string, SchemaType> = target.getTypeDefinitions();
        for (const [typeName, typeDefinition] of targetTypes.entries()) {
            const localName: string = extractLocalName(typeName);
            if (!localName) {
                continue;
            }

            const original: SchemaType | undefined = resolveTypeInGrammar(source, typeName, localName);
            if (original && original !== typeDefinition) {
                redefinedTypesByLocalName.set(localName, typeDefinition);

                if (!targetTypes.has(localName)) {
                    targetTypes.set(localName, typeDefinition);
                }

                if (namespace) {
                    const clarkName: string = `{${namespace}}${localName}`;
                    if (!targetTypes.has(clarkName)) {
                        targetTypes.set(clarkName, typeDefinition);
                    }
                }
            }
        }

        // Realize redefined complex types by merging them with their original definitions
        for (const [localName, redefinedType] of redefinedTypesByLocalName.entries()) {
            if (!(redefinedType instanceof ComplexType)) {
                continue;
            }

            const qualifiedName: string | undefined = redefinedType.getName?.();
            const originalDefinition: SchemaType | undefined = resolveTypeInGrammar(source, qualifiedName, localName);

            if (!originalDefinition || !(originalDefinition instanceof ComplexType) || originalDefinition === redefinedType) {
                continue;
            }

            const existingBase: SchemaType | undefined = redefinedType.getBaseType?.();
            if (existingBase && existingBase !== redefinedType) {
                // Already merged with a proper base
                continue;
            }

            // Preserve the declared extension content (usually just the added particles)
            const extensionContent: ContentModel | undefined = redefinedType.getContentModel?.();
            if (extensionContent) {
                redefinedType.setContentModel(extensionContent);
            }

            // Attach the original definition as base so ComplexType can merge base + extension content
            redefinedType.setBaseType(originalDefinition);

            // Inherit attributes from the original type when they are not explicitly overridden
            const originalAttributes: Map<string, SchemaAttributeDecl> = originalDefinition.getAttributes?.() || new Map();
            for (const [attrName, attrDecl] of originalAttributes.entries()) {
                if (!redefinedType.hasAttribute?.(attrName)) {
                    redefinedType.addAttribute(attrName, attrDecl);
                }
            }

            // Ensure future resolution does not attempt to bind the base QName back to the redefined type itself
            const originalQualifiedName: string | undefined = originalDefinition.getName?.();
            if (originalQualifiedName) {
                redefinedType.setBaseTypeQName(originalQualifiedName);
            } else {
                (redefinedType as any).baseTypeQName = undefined;
            }
        }

        // Prepare extension content sequences for derived types that reference redefined bases
        const extensionSequencesByTypeName: Map<string, SequenceModel> = new Map();

        const sourceTypes: Map<string, SchemaType> = source.getTypeDefinitions();
        for (const typeDefinition of sourceTypes.values()) {
            if (!(typeDefinition instanceof ComplexType)) {
                continue;
            }

            const baseQName: string | undefined = typeDefinition.getBaseTypeQName?.();
            const baseLocalName: string = extractLocalName(baseQName);

            if (!baseLocalName || !redefinedTypesByLocalName.has(baseLocalName)) {
                continue;
            }

            const originalBase: SchemaType | undefined = resolveTypeInGrammar(source, baseQName, baseLocalName);
            const extensionSequence: SequenceModel | undefined = this.extractExtensionSequence(typeDefinition, originalBase);
            if (extensionSequence) {
                const derivedName: string | undefined = (typeDefinition as ComplexType).getName?.();
                const candidateLocalName: string = extractLocalName(derivedName);
                const candidateNames: string[] = getCandidateNames(target, derivedName, candidateLocalName);
                for (const candidate of candidateNames) {
                    extensionSequencesByTypeName.set(candidate, extensionSequence);
                }
            }
        }

        for (const [typeName, typeDefinition] of sourceTypes.entries()) {
            const localName: string = extractLocalName(typeName);
            if (redefinedTypesByLocalName.has(localName)) {
                continue;
            }

            if (!target.getTypeDefinition(typeName)) {
                try {
                    target.addTypeDefinition(typeName, typeDefinition);
                } catch (error) {
                    console.warn(`Skipping duplicate type definition '${typeName}' during redefine merge: ${(error as Error).message}`);
                }
            }
        }

        // Merge element declarations from the base schema
        const sourceElements: Map<string, SchemaElementDecl> = source.getElementDeclarations();
        for (const [, elementDecl] of sourceElements.entries()) {
            const elementName: string | undefined = elementDecl.getName();
            if (!elementName) {
                continue;
            }

            if (!target.getElementDeclaration(elementName)) {
                try {
                    const clonedElement: SchemaElementDecl = this.cloneElementForMerge(elementDecl);
                    target.addElementDeclaration(elementName, clonedElement);
                } catch (error) {
                    console.warn(`Skipping duplicate element declaration '${elementName}' during redefine merge: ${(error as Error).message}`);
                }
            }
        }

        // Merge attribute declarations
        const sourceAttributes: Map<string, SchemaAttributeDecl> = source.getAttributeDeclarations();
        for (const [attributeKey, attributeDecl] of sourceAttributes.entries()) {
            if (!target.getAttributeDeclaration(attributeKey)) {
                try {
                    const clonedAttribute: SchemaAttributeDecl = this.cloneAttributeForMerge(attributeDecl);
                    target.addAttributeDeclaration(attributeKey, clonedAttribute);
                } catch (error) {
                    console.warn(`Skipping duplicate attribute declaration '${attributeKey}' during redefine merge: ${(error as Error).message}`);
                }
            }
        }

        // Merge attribute groups
        const sourceAttributeGroups: Map<string, AttributeGroup> = source.getAttributeGroupDefinitions();
        for (const [groupName, attributeGroup] of sourceAttributeGroups.entries()) {
            if (!target.getAttributeGroupDefinition(groupName)) {
                try {
                    target.addAttributeGroupDefinition(groupName, attributeGroup);
                } catch (error) {
                    console.warn(`Skipping duplicate attributeGroup '${groupName}' during redefine merge: ${(error as Error).message}`);
                }
            }
        }

        // Merge model groups
        const sourceGroups: Map<string, ContentModel> = source.getGroupDefinitions();
        for (const [groupName, groupModel] of sourceGroups.entries()) {
            if (!target.getGroupDefinition(groupName)) {
                try {
                    target.addGroupDefinition(groupName, groupModel);
                } catch (error) {
                    console.warn(`Skipping duplicate group definition '${groupName}' during redefine merge: ${(error as Error).message}`);
                }
            }
        }

        // Update derived types so they reference the redefined base definitions
        for (const [typeName, extensionSequence] of extensionSequencesByTypeName.entries()) {
            const derivedType: SchemaType | undefined = target.getTypeDefinition(typeName);
            if (!derivedType || !(derivedType instanceof ComplexType)) {
                continue;
            }

            if (typeof derivedType.getDerivationMethod === 'function' && derivedType.getDerivationMethod() !== 'extension') {
                continue;
            }

            const baseQName: string | undefined = derivedType.getBaseTypeQName?.();
            const baseLocalName: string = extractLocalName(baseQName);
            if (!baseLocalName || !redefinedTypesByLocalName.has(baseLocalName)) {
                continue;
            }

            const newBaseType: SchemaType | undefined = redefinedTypesByLocalName.get(baseLocalName);
            if (!newBaseType || !(newBaseType instanceof ComplexType)) {
                continue;
            }

            // Reset the content model to extension-only before attaching the new base
            derivedType.setContentModel(extensionSequence);
            derivedType.setBaseType(newBaseType);
        }

        // Ensure the merged grammar resolves all type references against the updated definitions
        this.resolveTypeHierarchy(target);
    }

    private cloneElementForMerge(element: SchemaElementDecl): SchemaElementDecl {
        const cloned: SchemaElementDecl = new SchemaElementDecl(element.getName());

        const type: SchemaType | undefined = element.getType();
        if (type) {
            cloned.setType(type);
        } else {
            const typeName: string | undefined = element.getTypeName();
            if (typeName) {
                cloned.setTypeName(typeName);
            }
        }

        cloned.setMinOccurs(element.getMinOccurs());
        cloned.setMaxOccurs(element.getMaxOccurs());
        cloned.setForm(element.getForm());
        cloned.setNamespaceURI(element.getNamespaceURI());
        cloned.setNillable(element.isNillable());
        cloned.setAbstract(element.isAbstract());

        const substitutionGroup: string | undefined = element.getSubstitutionGroup();
        if (substitutionGroup) {
            cloned.setSubstitutionGroup(substitutionGroup);
        }

        const defaultValue: string | undefined = element.getDefaultValue();
        if (defaultValue !== undefined) {
            cloned.setDefaultValue(defaultValue);
        }

        const fixedValue: string | undefined = element.getFixedValue();
        if (fixedValue !== undefined) {
            cloned.setFixedValue(fixedValue);
        }

        return cloned;
    }

    private cloneAttributeForMerge(attribute: SchemaAttributeDecl): SchemaAttributeDecl {
        const cloned: SchemaAttributeDecl = new SchemaAttributeDecl(attribute.getName(), attribute.getType());
        cloned.setUse(attribute.getUse());
        cloned.setForm(attribute.getForm());

        const defaultValue: string | undefined = attribute.getDefaultValue();
        if (defaultValue !== undefined) {
            cloned.setDefaultValue(defaultValue);
        }

        const fixedValue: string | undefined = attribute.getFixedValue();
        if (fixedValue !== undefined) {
            cloned.setFixedValue(fixedValue);
        }

        return cloned;
    }

    private extractExtensionSequence(derivedType: ComplexType, originalBase?: SchemaType): SequenceModel | undefined {
        if (!originalBase || !(originalBase instanceof ComplexType)) {
            return undefined;
        }

        const derivedContent: ContentModel | undefined = derivedType.getContentModel();
        const baseContent: ContentModel | undefined = originalBase.getContentModel();

        if (!(derivedContent instanceof SequenceModel) || !(baseContent instanceof SequenceModel)) {
            return undefined;
        }

        const baseParticleCount: number = baseContent.getParticles().length;
        const derivedParticles: ContentModel[] = derivedContent.getParticles();

        const extensionSequence: SequenceModel = new SequenceModel(derivedContent.getMinOccurs(), derivedContent.getMaxOccurs());

        if (derivedParticles.length <= baseParticleCount) {
            // No additional particles beyond the base definition
            return extensionSequence;
        }

        const extensionParticles: ContentModel[] = derivedParticles.slice(baseParticleCount);
        for (const particle of extensionParticles) {
            extensionSequence.addParticle(particle);
        }

        return extensionSequence;
    }
}