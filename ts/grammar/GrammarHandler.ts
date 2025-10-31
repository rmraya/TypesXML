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

import { existsSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Catalog } from '../Catalog';
import { DTDGrammar } from '../dtd/DTDGrammar';
import { DTDParser } from '../dtd/DTDParser';
import { EntityDecl } from '../dtd/EntityDecl';
import { XMLUtils } from '../XMLUtils';
import { XMLSchemaParser } from '../schema/XMLSchemaParser';
import { CompositeGrammar } from './CompositeGrammar';
import { DTDComposite } from './DTDComposite';
import { Grammar } from './Grammar';

export class GrammarHandler {

    private compositeGrammar: CompositeGrammar;
    private dtdComposite: DTDComposite | undefined;
    private catalog?: Catalog;
    private currentFile?: string;
    private silent: boolean = false;
    private foundNamespaces: string[] = [];
    private validating: boolean = false;
    private includeDefaultAttributes: boolean = true;

    constructor() {
        this.compositeGrammar = CompositeGrammar.getInstance();

        const schemaParser = XMLSchemaParser.getInstance();
        schemaParser.setCrossSchemaResolver((qualifiedName: string) => {
            return this.compositeGrammar.resolveCrossSchemaGroup(qualifiedName);
        });
        schemaParser.setCrossSchemaAttributeGroupResolver((qualifiedName: string) => {
            return this.compositeGrammar.resolveAttributeGroup(qualifiedName);
        });
    }

    private trace(message: string): void {
        if (this.silent) {
            return;
        }
        const sourceHint: string = this.currentFile ? ` (current file: ${this.currentFile})` : '';
        console.log(`[GrammarHandler] ${message}${sourceHint}`);
    }

    initialize(): void {
        CompositeGrammar.resetInstance();
        DTDComposite.resetInstance();

        this.compositeGrammar = CompositeGrammar.getInstance();
        this.compositeGrammar.setIncludeDefaultAttributes(this.includeDefaultAttributes);
        this.dtdComposite = undefined;
        this.foundNamespaces = [];
    }

    setIncludeDefaultAttributes(include: boolean): void {
        this.includeDefaultAttributes = include;

        if (this.dtdComposite && typeof (this.dtdComposite as any).setIncludeDefaultAttributes === 'function') {
            (this.dtdComposite as any).setIncludeDefaultAttributes(include);
        }

        if (typeof (this.compositeGrammar as any).setIncludeDefaultAttributes === 'function') {
            (this.compositeGrammar as any).setIncludeDefaultAttributes(include);
        }
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
        if (this.dtdComposite) {
            return this.dtdComposite;
        }
        return this.compositeGrammar;
    }

    resolveEntityValue(entityName: string): string | undefined {
        const grammar: Grammar = this.getGrammar();
        if (grammar instanceof DTDComposite) {
            return this.resolveEntityValueFromDTD(grammar, entityName);
        }
        return grammar.resolveEntity(entityName);
    }

    getLoadedGrammars(): Array<{ namespace: string, type: string, elementCount?: number, typeCount?: number }> {
        const grammars = this.compositeGrammar.getLoadedGrammarList();
        if (this.dtdComposite) {
            grammars.push({
                namespace: '',
                type: 'dtd',
                elementCount: this.dtdComposite.getElementDeclMap().size
            });
        }

        return grammars;
    }

    private resolveEntityValueFromDTD(dtdComposite: DTDComposite, entityName: string): string | undefined {
        const entityDecl: EntityDecl | undefined = dtdComposite.getEntityDeclaration(entityName);
        if (!entityDecl) {
            return undefined;
        }

        if (entityDecl.getNotationName() !== '') {
            throw new Error(`Unparsed entity '${entityName}' cannot be referenced in parsed content`);
        }

        if (entityDecl.isExternal() && !entityDecl.isExternalContentLoaded()) {
            const content: string = this.loadExternalEntityContent(entityDecl);
            entityDecl.setValue(content);
        }

        return entityDecl.getValue();
    }

    private loadExternalEntityContent(entityDecl: EntityDecl): string {
        const baseDir: string = this.currentFile ? dirname(this.currentFile) : process.cwd();
        const parser: DTDParser = new DTDParser(undefined, baseDir);
        parser.setValidating(this.validating);
        if (this.catalog) {
            parser.setCatalog(this.catalog);
        }
        return parser.loadExternalEntity(entityDecl.getPublicId(), entityDecl.getSystemId(), true);
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
        const allGrammars = this.compositeGrammar.getGrammars();
        for (const [namespace, grammar] of allGrammars) {
            XMLUtils.ignoreUnused(namespace);
            if (grammar.getGrammarType().toString() === 'xmlschema') {
                // XMLSchemaGrammar has setValidating method
                (grammar as any).setValidating(validating);
            }
        }
        if (this.dtdComposite) {
            this.dtdComposite.setValidating(validating);
        }
    }

    startDTDProcessing(name: string, publicId: string, systemId: string): void {
        XMLUtils.ignoreUnused(name, publicId, systemId);
        // Get singleton DTD composite when DOCTYPE is detected
        this.dtdComposite = DTDComposite.getInstance();
        this.dtdComposite.setIncludeDefaultAttributes(this.includeDefaultAttributes);
        this.dtdComposite.reset(); // Reset state for new document
    }

    processDoctype(name: string, publicId: string, systemId: string, internalSubset: string): void {
        XMLUtils.ignoreUnused(name);
        if (!this.dtdComposite) {
            this.dtdComposite = DTDComposite.getInstance();
        }

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
    }

    processNamespaces(attributesMap: Map<string, string>): void {
        const namespaceInfo: NamespaceInfo = this.extractNamespaceInfo(attributesMap);
        const schemaParser = XMLSchemaParser.getInstance();

        if (namespaceInfo.schemaLocations.size > 0) {
            const hints: string = Array.from(namespaceInfo.schemaLocations.entries())
                .map(([ns, location]) => `${ns || '(no namespace)'} -> ${location}`)
                .join(', ');
            this.trace(`xsi:schemaLocation provided hints: ${hints}`);
        }

        if (namespaceInfo.noNamespaceSchemaLocation) {
            this.trace(`xsi:noNamespaceSchemaLocation hint: ${namespaceInfo.noNamespaceSchemaLocation}`);
        }

        this.checkAndValidateCurrentSchema(namespaceInfo);

        if (namespaceInfo.prefixMappings.size > 0) {
            this.compositeGrammar.updatePrefixMappings(namespaceInfo.prefixMappings);
        }

        if (namespaceInfo.defaultNamespace) {
            if (!this.foundNamespaces.includes(namespaceInfo.defaultNamespace)) {
                this.foundNamespaces.push(namespaceInfo.defaultNamespace);
                let location: string = '';
                let locationSource: string = 'none';
                if (namespaceInfo.schemaLocations.has(namespaceInfo.defaultNamespace)) {
                    location = namespaceInfo.schemaLocations.get(namespaceInfo.defaultNamespace)!;
                    locationSource = 'xsi:schemaLocation';
                } else {
                    // try to find it in catalog
                    const catalogLocation: string | undefined = this.catalog?.matchURI(namespaceInfo.defaultNamespace) ||
                        this.catalog?.matchSystem(namespaceInfo.defaultNamespace);
                    if (catalogLocation) {
                        location = catalogLocation;
                        locationSource = 'catalog';
                    }
                }
                if (location !== '') {
                    this.trace(`Attempting to load schema for namespace '${namespaceInfo.defaultNamespace}' using ${locationSource} hint '${location}'`);
                    // Load schema for default namespace
                    this.loadSchemaForNamespace(schemaParser, namespaceInfo.defaultNamespace, location);
                } else if (schemaParser.isSchemaAlreadyParsed(namespaceInfo.defaultNamespace)) {
                    this.trace(`Using cached grammar for namespace '${namespaceInfo.defaultNamespace}' (no explicit location hint)`);
                    this.loadSchemaForNamespace(schemaParser, namespaceInfo.defaultNamespace);
                } else {
                    this.trace(`No schema location found for default namespace '${namespaceInfo.defaultNamespace}'`);
                }
            }
        }
        if (namespaceInfo.namespacesFound.length !== 0) {
            namespaceInfo.namespacesFound.forEach((ns: string) => {
                if (!this.foundNamespaces.includes(ns)) {
                    this.foundNamespaces.push(ns);
                    let location: string = '';
                    let locationSource: string = 'none';
                    if (namespaceInfo.schemaLocations.has(ns)) {
                        location = namespaceInfo.schemaLocations.get(ns)!;
                        locationSource = 'xsi:schemaLocation';
                    } else {
                        // try to find it in catalog
                        const catalogLocation: string | undefined = this.catalog?.matchURI(ns) ||
                            this.catalog?.matchSystem(ns);
                        if (catalogLocation) {
                            location = catalogLocation;
                            locationSource = 'catalog';
                        }
                    }
                    if (location !== '') {
                        this.trace(`Attempting to load schema for namespace '${ns}' using ${locationSource} hint '${location}'`);
                        // Load schema for declared namespace
                        this.loadSchemaForNamespace(schemaParser, ns, location);
                    } else {
                        if (schemaParser.isSchemaAlreadyParsed(ns)) {
                            this.trace(`Using cached grammar for namespace '${ns}' (no explicit location hint)`);
                            this.loadSchemaForNamespace(schemaParser, ns);
                        } else {
                            this.trace(`No schema location found for namespace '${ns}'`);
                        }
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
            if (this.validating) {
                // In validating mode, DTD parsing errors are fatal
                throw new Error(`DTD parsing error: ${(error as Error).message}`);
            } else {
                // In non-validating mode, log warning and continue
                if (!this.silent) {
                    console.warn('DTD parsing warning:', (error as Error).message);
                }
                return undefined;
            }
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
                    if (this.validating) {
                        // In validating mode, external DTD extraction failures can be fatal
                        throw new Error('External DTD extraction failed for ' + systemId + ' (' + location + '): ' + (extractError as Error).message);
                    } else {
                        // In non-validating mode, log warning and continue
                        if (!this.silent) {
                            console.warn('Warning: External DTD extraction failed for \'' + systemId + '\': ' + (extractError as Error).message);
                        }
                        // If extraction fails, silently continue - entities might be defined elsewhere
                    }
                }
            }
        } catch (error) {
            if (this.validating) {
                // In validating mode, external DTD processing failures can be fatal
                throw new Error(`External DTD processing failed for '${systemId}': ${(error as Error).message}`);
            } else {
                // In non-validating mode, log warning and continue
                if (!this.silent) {
                    console.warn('Warning: External DTD processing \'' + systemId + '\': ' + (error as Error).message);
                }
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

        for (const [key, value] of attributesMap) {
            if (key === 'xml:lang' || key === 'xml:space') {
                continue;
            }

            if (key === 'xmlns') {
                // Default namespace declaration
                info.defaultNamespace = value;
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
        // Skip XMLSchema-instance namespace - it's handled by pre-compiled grammar
        if (namespace === 'http://www.w3.org/2001/XMLSchema-instance') {
            this.trace(`Skipping schema load for reserved namespace '${namespace}'`);
            return;
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

        if (!location) {
            if (this.compositeGrammar.hasGrammar(namespace)) {
                this.trace(`Namespace '${namespace}' already has a loaded grammar, skipping load request`);
                return;
            }

            if (schemaParser.isSchemaAlreadyParsed(namespace)) {
                const cachedGrammar: Grammar | null = schemaParser.getCachedSchema(namespace);
                if (cachedGrammar) {
                    this.trace(`Using cached grammar for namespace '${namespace}'`);
                    this.compositeGrammar.addGrammar(namespace, cachedGrammar);
                    return;
                }
            }

            this.trace(`No location hint available for namespace '${namespace}'`);
            if (this.validating) {
                throw new Error(`No location found for namespace "${namespace}"`);
            } else if (!this.silent) {
                console.warn('No location found for namespace "' + namespace + '"');
            }
            return;
        }

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
                        this.trace(`Resolved remote schema reference '${location}' to local resource '${resolvedLocation}' for namespace '${namespace}' via catalog`);
                    } else {
                        this.trace(`Unable to resolve remote schema reference '${location}' for namespace '${namespace}' because catalog did not provide a mapping`);
                        return;
                    }
                } else {
                    this.trace(`Unable to resolve remote schema reference '${location}' for namespace '${namespace}' without catalog support`);
                    return;
                }
            }
            // Handle relative paths
            else if (!isAbsolute(location)) {
                // This is a relative path - resolve it relative to the current document
                if (this.currentFile) {
                    const documentDir: string = dirname(this.currentFile);
                    resolvedLocation = resolve(documentDir, location);
                    this.trace(`Resolved relative schema reference '${location}' to '${resolvedLocation}' for namespace '${namespace}'`);
                } else {
                    this.trace(`Cannot resolve relative schema reference '${location}' for namespace '${namespace}' because current file is unknown`);
                    return;
                }
            }

            const alreadyProcessedPath: boolean = schemaParser.hasProcessedSchemaPath(resolvedLocation);
            if (alreadyProcessedPath) {
                if (this.compositeGrammar.hasGrammar(namespace)) {
                    this.trace(`Namespace '${namespace}' already has a loaded grammar, skipping load request`);
                    return;
                }
                const cachedGrammar: Grammar | null = schemaParser.getCachedSchema(namespace);
                if (cachedGrammar) {
                    this.trace(`Using cached grammar for namespace '${namespace}' resolved from '${resolvedLocation}'`);
                    this.compositeGrammar.addGrammar(namespace, cachedGrammar);
                    return;
                }
            }

            this.trace(`Loading schema for namespace '${namespace}' from '${resolvedLocation}'`);

            // Try to load as XSD first (most common case)
            const xsdGrammar: Grammar | null = schemaParser.parseSchema(resolvedLocation, namespace);
            if (xsdGrammar) {
                // Set validating mode on newly created XMLSchemaGrammar
                if (xsdGrammar.getGrammarType().toString() === 'xmlschema') {
                    (xsdGrammar as any).setValidating(this.validating);
                }
                this.compositeGrammar.addGrammar(namespace, xsdGrammar);
                this.trace(`Successfully loaded XML Schema grammar for namespace '${namespace}'`);
            } else {
                // If XSD parsing fails, try DTD as fallback
                const dtdGrammar: DTDGrammar | null = this.loadDTDForNamespace(resolvedLocation, namespace);
                if (dtdGrammar) {
                    this.compositeGrammar.addGrammar(namespace, dtdGrammar);
                    this.trace(`Loaded DTD grammar for namespace '${namespace}' as fallback`);
                } else {
                    if (this.validating) {
                        this.trace(`Failed to load schema for namespace '${namespace}' from '${resolvedLocation}' while in validating mode`);
                        throw new Error(`Failed to load schema for namespace "${namespace}"`);
                    } else if (!this.silent) {
                        console.warn('Failed to load schema for namespace "' + namespace + '"');
                    }
                }
            }
        } catch (error) {
            this.trace(`Exception while loading schema for namespace '${namespace}' from '${location}': ${(error as Error).message}`);
            if (this.validating) {
                throw new Error(`Exception loading schema for namespace "${namespace}": ${(error as Error).message}`);
            } else if (!this.silent) {
                console.warn('Exception loading schema for namespace "' + namespace + '": ' + (error as Error).message);
                // Schema loading failed - will be reported in validation
            }
        }
    }

    private loadDTDForNamespace(location: string, namespace: string): DTDGrammar | null {
        XMLUtils.ignoreUnused(namespace);
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

    reset(): void {
        this.compositeGrammar = CompositeGrammar.getInstance();
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