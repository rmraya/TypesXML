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

import { dirname, isAbsolute, resolve } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { Catalog } from '../Catalog';
import { DTDGrammar } from '../dtd/DTDGrammar';
import { DTDComposite } from './DTDComposite';
import { DTDParser } from '../dtd/DTDParser';
import { XMLSchemaParser } from '../schema/XMLSchemaParser';
import { CompositeGrammar } from './CompositeGrammar';
import { Grammar } from './Grammar';

interface SchemaToLoad {
    namespace: string;
    location: string;
}

export class GrammarHandler {

    private compositeGrammar: CompositeGrammar;
    private dtdComposite: DTDComposite | undefined; // Primary DTD grammar
    private catalog?: Catalog;
    private currentFile?: string;
    private silent: boolean = false;
    private foundNamespaces: string[] = [];
    private validating: boolean = false; // Track validating mode

    constructor(defaultNamespace?: string) {
        this.compositeGrammar = new CompositeGrammar();

        // Set up cross-schema resolver for XMLSchemaParser
        const schemaParser = XMLSchemaParser.getInstance();
        schemaParser.setCrossSchemaResolver((qualifiedName: string) => {
            return this.compositeGrammar.resolveCrossSchemaGroup(qualifiedName);
        });
        schemaParser.setCrossSchemaAttributeGroupResolver((qualifiedName: string) => {
            return this.compositeGrammar.resolveAttributeGroup(qualifiedName);
        });
    }

    setCatalog(catalog: Catalog): void {
        this.catalog = catalog;
    }

    setCurrentFile(file: string): void {
        this.currentFile = file;
    }

    setSilent(silent: boolean): void {
        this.silent = silent;
    }

    getGrammar(): Grammar {
        // Return DTD grammar if available (DTD takes precedence over schemas)
        if (this.dtdComposite) {
            return this.dtdComposite;
        }
        // Otherwise return composite grammar for XML Schema handling
        return this.compositeGrammar;
    }

    getLoadedGrammars(): Array<{ namespace: string, type: string, elementCount?: number, typeCount?: number }> {
        const grammars = this.compositeGrammar.getLoadedGrammarList();
        
        // Add DTD grammar info if available
        if (this.dtdComposite) {
            grammars.push({
                namespace: '', // DTD has no namespace
                type: 'dtd',
                elementCount: this.dtdComposite.getElementDeclMap().size
            });
        }
        
        return grammars;
    }

    hasGrammar(namespaceURI: string | undefined): boolean {
        // Check DTD grammar first (DTD has no namespace, so namespaceURI would be undefined)
        if (namespaceURI === undefined && this.dtdComposite) {
            return true;
        }
        // Otherwise check composite grammar for schema handling
        return this.compositeGrammar.hasGrammar(namespaceURI);
    }

    setValidating(validating: boolean): void {
        this.validating = validating;
        
        // When validating mode changes, we need to apply it to any existing XMLSchemaGrammar instances
        // that are already loaded in the CompositeGrammar
        const allGrammars = this.compositeGrammar.getGrammars();
        for (const [namespace, grammar] of allGrammars) {
            if (grammar.getGrammarType().toString() === 'xmlschema') {
                // XMLSchemaGrammar has setValidating method
                (grammar as any).setValidating(validating);
            }
        }
        if (this.dtdComposite) {
            this.dtdComposite.setValidating(validating);
        }
    }

    processDoctype(name: string, publicId: string, systemId: string, internalSubset: string): void {
        // Create a composite DTD grammar to orchestrate internal and external DTD sources
        this.dtdComposite = new DTDComposite();
        
        // Handle internal subset first to populate parameter entities
        if (internalSubset !== '') {
            const internalDTD = this.processInternalSubset(internalSubset);
            if (internalDTD) {
                this.dtdComposite.addInternalDTD(internalDTD);
            }
        }

        // Handle external DTD with access to parameter entities from internal subset
        if (publicId || systemId) {
            const externalDTD = this.processExternalDTD(publicId, systemId, this.dtdComposite);
            if (externalDTD) {
                this.dtdComposite.addExternalDTD(externalDTD);
            }
        }
        
        // DTDComposite is now the primary grammar - no need to add to CompositeGrammar
        // CompositeGrammar remains focused on XML Schema handling only
    }

    processNamespaces(attributesMap: Map<string, string>): void {
        const namespaceInfo: NamespaceInfo = this.extractNamespaceInfo(attributesMap);

        this.checkAndValidateCurrentSchema(namespaceInfo);

        if (namespaceInfo.defaultNamespace) {
            if (!this.foundNamespaces.includes(namespaceInfo.defaultNamespace)) {
                this.foundNamespaces.push(namespaceInfo.defaultNamespace);
                let location: string = '';
                if (namespaceInfo.schemaLocations.has(namespaceInfo.defaultNamespace)) {
                    location = namespaceInfo.schemaLocations.get(namespaceInfo.defaultNamespace)!;
                } else {
                    // try to find it in catalog
                    const catalogLocation: string | undefined = this.catalog?.matchURI(namespaceInfo.defaultNamespace) ||
                        this.catalog?.matchSystem(namespaceInfo.defaultNamespace);
                    if (catalogLocation) {
                        location = catalogLocation;
                    }
                }
                if (location !== '') {
                    // Update prefix mappings when we actually load a schema
                    this.compositeGrammar.updatePrefixMappings(namespaceInfo.prefixMappings);
                    // Load schema for default namespace
                    this.loadSchemaForNamespace(XMLSchemaParser.getInstance(), namespaceInfo.defaultNamespace, location);
                }
            }
        }
        if (namespaceInfo.namespacesFound.length !== 0) {
            namespaceInfo.namespacesFound.forEach((ns: string) => {
                if (!this.foundNamespaces.includes(ns)) {
                    this.foundNamespaces.push(ns);
                    let location: string = '';
                    if (namespaceInfo.schemaLocations.has(ns)) {
                        location = namespaceInfo.schemaLocations.get(ns)!;
                    } else {
                        // try to find it in catalog
                        const catalogLocation: string | undefined = this.catalog?.matchURI(ns) ||
                            this.catalog?.matchSystem(ns);
                        if (catalogLocation) {
                            location = catalogLocation;
                        }
                    }
                    if (location !== '') {
                        // Update prefix mappings when we actually load a schema
                        this.compositeGrammar.updatePrefixMappings(namespaceInfo.prefixMappings);
                        // Load schema for declared namespace
                        this.loadSchemaForNamespace(XMLSchemaParser.getInstance(), ns, location);
                    }
                }
            });
        }
    }

    private processInternalSubset(internalSubset: string): DTDGrammar | undefined {
        try {
            const dtdGrammar = new DTDGrammar();
            const dtdParser: DTDParser = new DTDParser(dtdGrammar, this.currentFile ? dirname(this.currentFile) : '');
            dtdParser.setValidating(this.validating);   

            if (this.catalog) {
                dtdParser.setCatalog(this.catalog);
            }

            dtdParser.parseString(internalSubset);
            return dtdGrammar;
        } catch (error) {
            if (!this.silent) {
                console.warn('DTD parsing warning:', (error as Error).message);
            }
            return undefined;
        }
    }

    private processExternalDTD(publicId: string, systemId: string, dtdComposite: DTDComposite): DTDGrammar | undefined {
        try {
            
            // Create a grammar instance with shared parameter entities from internal DTD
            const dtdGrammar = dtdComposite.createSharedGrammar();
            
            let location: string | undefined;
            
            if (this.catalog) {
                // Use catalog for resolution if available
                const tempParser = new DTDParser(dtdGrammar, this.currentFile ? dirname(this.currentFile) : '');
                tempParser.setValidating(this.validating);
                tempParser.setCatalog(this.catalog);
                location = tempParser.resolveEntity(publicId, systemId);
            } else if (systemId) {
                // Resolve systemId relative to current XML file directory
                const currentDir = this.currentFile ? dirname(this.currentFile) : process.cwd();
                if (isAbsolute(systemId)) {
                    location = systemId;
                } else {
                    location = resolve(currentDir, systemId);
                }
            }
            
            if (location && existsSync(location)) {
                try {
                    // Create DTDParser with DTD file's directory as base for entity resolution within DTD
                    const dtdFileDir = dirname(location);
                    const dtdParser: DTDParser = new DTDParser(dtdGrammar, dtdFileDir);
                    dtdParser.setValidating(this.validating);
                    if (this.catalog) {
                        dtdParser.setCatalog(this.catalog);
                    }
                    
                    dtdParser.extractAndImportEntities(location);
                    return dtdGrammar;
                } catch (extractError) {
                    if (!this.silent) {
                        console.warn('Warning: External DTD extraction failed for \'' + systemId + '\': ' + (extractError as Error).message);
                    }
                    // If extraction fails, silently continue - entities might be defined elsewhere
                }
            }
        } catch (error) {
            if (!this.silent) {
                console.warn('Warning: External DTD processing \'' + systemId + '\': ' + (error as Error).message);
            }
        }
        return undefined;
    }

    private extractNamespaceInfo(attributesMap: Map<string, string>): NamespaceInfo {
        const info: NamespaceInfo = {
            schemaLocations: new Map(),
            namespacesFound: [],
            defaultNamespace: undefined,
            noNamespaceSchemaLocation: undefined,
            prefixMappings: new Map<string, string>()
        };

        let defaultNamespace: string | undefined = undefined;
        let defaultSchemaLocation: string | undefined = undefined;

        for (const [key, value] of attributesMap) {
            if (key === 'xml:lang' || key === 'xml:space') {
                continue;
            }

            if (key === 'xmlns') {
                // Default namespace declaration
                info.defaultNamespace = value;
                defaultNamespace = value;
                info.prefixMappings.set('', value);
            } else if (key.startsWith('xmlns:')) {
                // Prefixed namespace declaration like xmlns:b="ns-b"
                const localPrefix: string = key.substring(6); // Remove 'xmlns:' prefix
                info.namespacesFound.push(value);
                info.prefixMappings.set(localPrefix, value);
            } else if (key === 'xsi:schemaLocation') {
                // Handle xsi:schemaLocation specially - don't map xsi prefix here
                const parts: string[] = value.trim().split(/\s+/);
                for (let i: number = 0; i < parts.length; i += 2) {
                    const ns: string = parts[i];
                    const location: string = parts[i + 1];
                    info.schemaLocations.set(ns, location);
                    defaultSchemaLocation = location;
                }
            } else if (key === 'xsi:noNamespaceSchemaLocation') {
                // Handle xsi:noNamespaceSchemaLocation specially
                info.noNamespaceSchemaLocation = value;
            }
            // Note: Other attributes (including other prefixed attributes) don't define namespace mappings
        }
        return info;
    }

    private loadSchemaForNamespace(
        schemaParser: XMLSchemaParser,
        namespace: string,
        hintLocation?: string
    ): void {
        // Skip if already loaded
        if (this.compositeGrammar.hasGrammar(namespace)) {
            return;
        }

        // Skip XMLSchema-instance namespace - it's handled by pre-compiled grammar
        if (namespace === 'http://www.w3.org/2001/XMLSchema-instance') {
            return;
        }

        // Check cache first
        if (schemaParser.isSchemaAlreadyParsed(namespace)) {
            const cachedGrammar: Grammar | null = schemaParser.getCachedSchema(namespace);
            if (cachedGrammar) {
                this.compositeGrammar.addGrammar(namespace, cachedGrammar);
                return;
            }
        }

        // Resolve location
        let location: string | undefined = hintLocation;
        if (!location && this.catalog) {
            if (namespace.startsWith('urn:')) {
                location = this.catalog.matchURI(namespace);
            } else if (namespace.startsWith('http')) {
                location = this.catalog.matchSystem(namespace);
            }
        }

        if (location) {
            try {
                // Resolve and normalize paths
                let resolvedLocation: string = location;

                // Convert file:// URLs to real paths
                if (location.startsWith('file://')) {
                    resolvedLocation = fileURLToPath(location);
                }
                // Handle HTTP/HTTPS URLs - check catalog first
                else if (location.startsWith('http://') || location.startsWith('https://')) {
                    if (this.catalog) {
                        const catalogMatch: string | undefined = this.catalog.matchURI(location) || this.catalog.matchSystem(location);
                        if (catalogMatch) {
                            resolvedLocation = catalogMatch;
                        } else {
                            return;
                        }
                    } else {
                        return;
                    }
                }
                // Handle relative paths
                else if (!isAbsolute(location)) {
                    // This is a relative path - resolve it relative to the current document
                    if (this.currentFile) {
                        const documentDir: string = dirname(this.currentFile);
                        resolvedLocation = resolve(documentDir, location);
                    } else {
                        return;
                    }
                }

                // Try to load as XSD first (most common case)
                const xsdGrammar: Grammar | null = schemaParser.parseSchema(resolvedLocation, namespace);
                if (xsdGrammar) {
                    // Set validating mode on newly created XMLSchemaGrammar
                    if (xsdGrammar.getGrammarType().toString() === 'xmlschema') {
                        (xsdGrammar as any).setValidating(this.validating);
                    }
                    this.compositeGrammar.addGrammar(namespace, xsdGrammar);
                } else {
                    // If XSD parsing fails, try DTD as fallback
                    const dtdGrammar: DTDGrammar | null = this.loadDTDForNamespace(resolvedLocation, namespace);
                    if (dtdGrammar) {
                        this.compositeGrammar.addGrammar(namespace, dtdGrammar);
                    } else {
                        console.warn('Failed to load schema for namespace "' + namespace + '"');
                    }
                }
            } catch (error) {
                console.warn('Exception loading schema for namespace "' + namespace + '": ' + (error as Error).message);
                // Schema loading failed - will be reported in validation
            }
        } else {
            console.warn('No location found for namespace "' + namespace + '"');
        }
    }

    private loadDTDForNamespace(location: string, namespace: string): DTDGrammar | null {
        try {
            const dtdParser: DTDParser = new DTDParser();
            dtdParser.setValidating(this.validating);
            if (this.catalog) {
                dtdParser.setCatalog(this.catalog);
            }

            const grammar: DTDGrammar = dtdParser.parseDTD(location);
            return grammar;
        } catch (error) {
            return null;
        }
    }

    reset(defaultNamespace?: string): void {
        this.compositeGrammar = new CompositeGrammar();
        this.dtdComposite = undefined;
        this.currentFile = undefined;
    }
    
    private checkAndValidateCurrentSchema(namespaceInfo: NamespaceInfo): void {
        const shouldValidateSemantics = this.validating && this.currentFile && 
                                      this.shouldPerformSemanticValidation();
        
        if (shouldValidateSemantics && this.currentFile) {
            const hasXSDNamespace = namespaceInfo.defaultNamespace === 'http://www.w3.org/2001/XMLSchema' ||
                                   Array.from(namespaceInfo.prefixMappings.values()).includes('http://www.w3.org/2001/XMLSchema');
            
            if (hasXSDNamespace) {
                const schemaParser = XMLSchemaParser.getInstance();
                const grammar = schemaParser.parseSchema(this.currentFile, undefined, true);
                if (!grammar) {
                    throw new Error(`XML Schema semantic validation failed: Schema parsing failed for ${this.currentFile}`);
                }
            }
        }
    }
    
    private shouldPerformSemanticValidation(): boolean {
        if (!this.currentFile) {
            return false;
        }
        
        // Only validate root documents, not schemas loaded as dependencies
        const isRootDocument = this.foundNamespaces.length === 0;
        return isRootDocument;
    }
}

interface NamespaceInfo {
    schemaLocations: Map<string, string>;
    namespacesFound: string[];
    defaultNamespace?: string;
    noNamespaceSchemaLocation?: string;
    prefixMappings: Map<string, string>;
}