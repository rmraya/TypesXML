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

import { Catalog } from "../Catalog";
import { SAXParser } from "../SAXParser";
import { SchemaParsingHandler } from "./SchemaParsingHandler";
import { XMLSchemaGrammar } from "./XMLSchemaGrammar";
import { ContentModel } from "./ContentModel";

export class XMLSchemaParser {
    private static instance: XMLSchemaParser;
    private catalog?: Catalog;
    private globalProcessedSchemas = new Set<string>(); // Tracks schemas processed across all sessions
    private currentlyParsingNamespaces = new Set<string>(); // Tracks namespaces currently being parsed
    private parsedGrammars = new Map<string, XMLSchemaGrammar>(); // Persistent cache
    private crossSchemaResolver?: (qualifiedName: string) => ContentModel | undefined;

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
            
            const schemaHandler: SchemaParsingHandler = new SchemaParsingHandler(grammar, this.crossSchemaResolver);
            
            if (this.catalog) {
                schemaHandler.setCatalog(this.catalog);
            }
            
            // Parse the schema file
            parser.setContentHandler(schemaHandler);
            parser.parseFile(schemaPath);
            
            // Process schema imports and includes
            const imports: Array<{ namespace?: string; schemaLocation?: string }> = schemaHandler.getImports();
            const includes: string[] = schemaHandler.getIncludes();
            
            // Process imports and includes for logging only
            // In the new architecture, nested schema references are handled
            // by the GrammarHandler's queue system, not here.
            for (const importData of imports) {
                if (importData.namespace && 
                    importData.namespace !== 'http://www.w3.org/2001/XMLSchema' &&
                    importData.namespace !== 'http://www.w3.org/XML/1998/namespace') {
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
}