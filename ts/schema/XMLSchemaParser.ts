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

import { dirname, isAbsolute, resolve } from "path";
import { Catalog } from "../Catalog";
import { SAXParser } from "../SAXParser";
import { AttributeGroup } from "./AttributeGroup";
import { ContentModel } from "./ContentModel";
import { SchemaParsingHandler } from "./SchemaParsingHandler";
import { XMLSchemaGrammar } from "./XMLSchemaGrammar";

export class XMLSchemaParser {
    private static instance: XMLSchemaParser;
    private catalog?: Catalog;
    private globalProcessedSchemas = new Set<string>(); // Tracks schemas processed across all sessions
    private currentlyParsingNamespaces = new Set<string>(); // Tracks namespaces currently being parsed
    private parsedGrammars = new Map<string, XMLSchemaGrammar>(); // Persistent cache
    private crossSchemaResolver?: (qualifiedName: string) => ContentModel | undefined;
    private crossSchemaAttributeGroupResolver?: (qualifiedName: string) => AttributeGroup | undefined;

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

    parseSchema(schemaPath: string, defaultNamespace?: string, throwOnValidationError: boolean = false): XMLSchemaGrammar | null {
        // Use namespace as cache key since that's what matters for grammar lookup
        const cacheKey: string = defaultNamespace || '';

        // Check if we already have a parsed grammar for this namespace
        if (this.parsedGrammars.has(cacheKey)) {
            return this.parsedGrammars.get(cacheKey)!;
        }

        try {
            // Track namespace being parsed to avoid recursive calls
            if (defaultNamespace) {
                this.currentlyParsingNamespaces.add(defaultNamespace);
            }

            const schemaGrammar: XMLSchemaGrammar | null = this.parseSchemaFile(schemaPath, defaultNamespace, throwOnValidationError);

            // Remove from currently parsing when done
            if (defaultNamespace) {
                this.currentlyParsingNamespaces.delete(defaultNamespace);
            }

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
            if (defaultNamespace) {
                this.currentlyParsingNamespaces.delete(defaultNamespace);
            }
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

            const schemaHandler: SchemaParsingHandler = new SchemaParsingHandler(grammar, this.crossSchemaResolver, this.crossSchemaAttributeGroupResolver);

            if (this.catalog) {
                schemaHandler.setCatalog(this.catalog);
            }

            // Parse the schema file
            parser.setContentHandler(schemaHandler);
            parser.parseFile(schemaPath);

            // Process schema imports and includes
            const imports: Array<{ namespace?: string; schemaLocation?: string }> = schemaHandler.getImports();
            const includes: string[] = schemaHandler.getIncludes();

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

        const schemaHandler: SchemaParsingHandler = new SchemaParsingHandler(grammar, this.crossSchemaResolver, this.crossSchemaAttributeGroupResolver);

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
            const typeName: any = elementDecl.getTypeName();
            if (typeName && !elementDecl.getType()) {
                // Use the enhanced getTypeDefinition method which handles qualified names
                const typeDefinition: any = grammar.getTypeDefinition(typeName.toString());
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
            const attributeType = attributeDecl.getType();
            if (attributeType) {
                const typeName: any = attributeType.getTypeName();
                if (typeName && !attributeType.isBuiltInType && !attributeType.isBuiltInType()) {
                    const typeDefinition: any = grammar.getTypeDefinition(typeName.toString());
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
            if (typeDefinition.isComplexType && typeDefinition.isComplexType()) {
                const baseTypeQName = typeDefinition.getBaseTypeQName();
                if (baseTypeQName && !typeDefinition.getBaseType()) {
                    const baseType = grammar.getTypeDefinition(baseTypeQName);
                    if (baseType) {
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
                    const baseType = grammar.getTypeDefinition(baseTypeName);
                    if (baseType && typeDefinition.setBaseType) {
                        typeDefinition.setBaseType(baseType);
                    }
                }
            }
        }

        // Phase 5: Provide fallback types for critical elements that couldn't be resolved
        // This prevents complete validation failures for schemas with external dependencies
        for (const [elementName, elementDecl] of elementEntries) {
            const typeName: any = elementDecl.getTypeName();
            if (typeName && !elementDecl.getType()) {
                // As a final fallback, try to create a simple string type for unresolved references
                // This prevents complete validation failures for schemas with external dependencies
                const fallbackType = grammar.getTypeDefinition('string') || grammar.getTypeDefinition('xs:string');
                if (fallbackType) {
                    console.debug(`Using fallback string type for element '${elementName}' with unresolved type '${typeName}'`);
                    elementDecl.setType(fallbackType);
                }
            }
        }
    }

    private resolveAttributeGroupReferences(handler: SchemaParsingHandler, grammar: XMLSchemaGrammar): void {
        // Resolve attribute group references after all parsing is complete
        const attributeGroupReferences = handler.getAttributeGroupReferences();
        for (const reference of attributeGroupReferences) {
            const { ref, refQName, targetComplexType, elementPath } = reference;
            console.debug(`Resolving attribute group reference: ${refQName} at ${elementPath}`);
            let resolved = false;

            // First try to resolve within the current grammar
            let attributeGroup = grammar.getAttributeGroupDefinition(refQName);
            if (!attributeGroup && this.crossSchemaAttributeGroupResolver) {
                // Try cross-schema resolution
                attributeGroup = this.crossSchemaAttributeGroupResolver(refQName);
            }

            if (attributeGroup) {
                console.debug(`Resolved attribute group '${refQName}' - expanding attributes`);
                // Expand the attribute group by copying its attributes to the complex type
                const attributes = attributeGroup.getAttributes();
                for (const [attrName, attr] of attributes) {
                    targetComplexType.addAttribute(attrName, attr);
                    console.debug(`  Added attribute '${attrName}' from attribute group '${refQName}'`);
                }
                resolved = true;
            }

            if (!resolved) {
                console.warn(`Could not resolve attribute group reference: ${refQName} at ${elementPath}`);
            }
        }
    }
}