/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Catalog } from "./Catalog";
import { Constants } from "./Constants";
import { DOMBuilder } from "./DOMBuilder";
import { SAXParser } from "./SAXParser";
import { XMLAttribute } from "./XMLAttribute";
import { XMLDocument } from "./XMLDocument";
import { XMLElement } from "./XMLElement";

type ElementInfo = {
    element: XMLElement;
    namespace?: string;
    localName: string;
};

export class XMLSchemaParser {

    private static instance: XMLSchemaParser | undefined;
    private static readonly IGNORED_NAMESPACES: Set<string> = new Set<string>([
        Constants.XML_SCHEMA_INSTANCE_NS_URI
    ]);
    catalog: Catalog | undefined;
    private schemaCache: Map<string, Map<string, Map<string, string>>>;
    private schemaProcessingStack: Set<string>;
    visitedSchemas: Set<string>;
    complexTypeDefinitions: Map<string, XMLElement>;
    attributeGroupDefinitions: Map<string, XMLElement>;
    elementDefinitions: Map<string, ElementInfo>;
    collectedDefaults: Map<string, Map<string, string>>;
    complexTypeDefaultCache: Map<string, Map<string, string>>;
    attributeGroupDefaultCache: Map<string, Map<string, string>>;

    private constructor(catalog?: Catalog) {
        this.catalog = catalog;
        this.schemaCache = new Map<string, Map<string, Map<string, string>>>();
        this.schemaProcessingStack = new Set<string>();
        this.visitedSchemas = new Set<string>();
        this.complexTypeDefinitions = new Map<string, XMLElement>();
        this.attributeGroupDefinitions = new Map<string, XMLElement>();
        this.elementDefinitions = new Map<string, ElementInfo>();
        this.collectedDefaults = new Map<string, Map<string, string>>();
        this.complexTypeDefaultCache = new Map<string, Map<string, string>>();
        this.attributeGroupDefaultCache = new Map<string, Map<string, string>>();
    }

    static getInstance(catalog?: Catalog): XMLSchemaParser {
        if (!XMLSchemaParser.instance) {
            XMLSchemaParser.instance = new XMLSchemaParser(catalog);
        } else if (catalog) {
            XMLSchemaParser.instance.catalog = catalog;
        }
        return XMLSchemaParser.instance;
    }

    collectDefaultAttributes(schemaPath: string): Map<string, Map<string, string>> {
        const normalizedPath: string = this.normalizePath(schemaPath);
        const cached: Map<string, Map<string, string>> | undefined = this.schemaCache.get(normalizedPath);
        if (cached) {
            return this.cloneDefaults(cached);
        }
        if (this.schemaProcessingStack.has(normalizedPath)) {
            return new Map<string, Map<string, string>>();
        }
        this.schemaProcessingStack.add(normalizedPath);
        try {
            this.resetWorkingState();
            this.walkSchema(normalizedPath);
            this.elementDefinitions.forEach((info: ElementInfo, key: string) => {
                const defaults: Map<string, string> = this.computeDefaultsForElement(info);
                if (defaults.size === 0) {
                    return;
                }
                this.collectedDefaults.set(key, defaults);
                if (!this.collectedDefaults.has(info.localName)) {
                    this.collectedDefaults.set(info.localName, new Map<string, string>(defaults));
                }
            });
            const snapshot: Map<string, Map<string, string>> = this.cloneDefaults(this.collectedDefaults);
            this.schemaCache.set(normalizedPath, snapshot);
            return this.cloneDefaults(snapshot);
        } finally {
            this.schemaProcessingStack.delete(normalizedPath);
        }
    }

    protected resetWorkingState(): void {
        this.visitedSchemas = new Set<string>();
        this.complexTypeDefinitions = new Map<string, XMLElement>();
        this.attributeGroupDefinitions = new Map<string, XMLElement>();
        this.elementDefinitions = new Map<string, ElementInfo>();
        this.collectedDefaults = new Map<string, Map<string, string>>();
        this.complexTypeDefaultCache = new Map<string, Map<string, string>>();
        this.attributeGroupDefaultCache = new Map<string, Map<string, string>>();
    }

    protected cloneDefaults(source: Map<string, Map<string, string>>): Map<string, Map<string, string>> {
        const clone: Map<string, Map<string, string>> = new Map<string, Map<string, string>>();
        source.forEach((value: Map<string, string>, key: string) => {
            clone.set(key, new Map<string, string>(value));
        });
        return clone;
    }

    protected computeDefaultsForElement(info: ElementInfo): Map<string, string> {
        const cacheKey: string = this.buildElementKey(info.localName, info.namespace);
        if (this.collectedDefaults.has(cacheKey)) {
            const cached: Map<string, string> | undefined = this.collectedDefaults.get(cacheKey);
            return cached ? new Map<string, string>(cached) : new Map<string, string>();
        }
        const accumulator: Map<string, string> = new Map<string, string>();
        const visitedTypes: Set<string> = new Set<string>();
        this.collectDefaultsFromElementDeclaration(info.element, accumulator, visitedTypes, info.namespace);
        return accumulator;
    }

    protected collectDefaultsFromElementDeclaration(element: XMLElement, accumulator: Map<string, string>, visitedTypes: Set<string>, namespace?: string): void {
        const children: Array<XMLElement> = element.getChildren();
        for (let index: number = 0; index < children.length; index++) {
            const child: XMLElement = children[index];
            const localName: string = this.getLocalName(child.getName());
            if (localName === "complexType") {
                this.collectDefaultsFromComplexType(child, accumulator, visitedTypes, namespace);
            }
        }
        const typeAttr: XMLAttribute | undefined = element.getAttribute("type");
        if (typeAttr) {
            const defaults: Map<string, string> = this.resolveTypeDefaults(typeAttr.getValue(), namespace, visitedTypes);
            this.mergeMaps(accumulator, defaults);
        }
    }

    protected collectDefaultsFromComplexType(typeElement: XMLElement, accumulator: Map<string, string>, visitedTypes: Set<string>, namespace?: string): void {
        const nameAttribute: XMLAttribute | undefined = typeElement.getAttribute("name");
        if (nameAttribute) {
            const typeKey: string = this.buildTypeKey(nameAttribute.getValue(), namespace);
            if (visitedTypes.has(typeKey)) {
                return;
            }
            visitedTypes.add(typeKey);
        }
        this.collectDefaultsFromAttributeContainer(typeElement, accumulator, visitedTypes, namespace);
    }

    protected collectDefaultsFromAttributeContainer(container: XMLElement, accumulator: Map<string, string>, visitedTypes: Set<string>, namespace?: string): void {
        const children: Array<XMLElement> = container.getChildren();
        for (let index: number = 0; index < children.length; index++) {
            const child: XMLElement = children[index];
            const localName: string = this.getLocalName(child.getName());
            if (localName === "attribute") {
                this.recordAttributeDefault(child, accumulator);
                continue;
            }
            if (localName === "attributeGroup") {
                const refAttribute: XMLAttribute | undefined = child.getAttribute("ref");
                if (!refAttribute) {
                    continue;
                }
                const groupDefaults: Map<string, string> = this.resolveAttributeGroupDefaults(refAttribute.getValue(), namespace);
                this.mergeMaps(accumulator, groupDefaults);
                continue;
            }
            if (localName === "complexContent" || localName === "simpleContent") {
                this.collectDefaultsFromAttributeContainer(child, accumulator, visitedTypes, namespace);
                continue;
            }
            if (localName === "extension" || localName === "restriction") {
                const baseAttribute: XMLAttribute | undefined = child.getAttribute("base");
                if (baseAttribute) {
                    const baseDefaults: Map<string, string> = this.resolveTypeDefaults(baseAttribute.getValue(), namespace, visitedTypes);
                    this.mergeMaps(accumulator, baseDefaults);
                }
                this.collectDefaultsFromAttributeContainer(child, accumulator, visitedTypes, namespace);
                continue;
            }
            if (localName === "complexType") {
                this.collectDefaultsFromComplexType(child, accumulator, visitedTypes, namespace);
            }
        }
    }

    protected recordAttributeDefault(attributeElement: XMLElement, accumulator: Map<string, string>): void {
        const defaultAttribute: XMLAttribute | undefined = attributeElement.getAttribute("default");
        const fixedAttribute: XMLAttribute | undefined = attributeElement.getAttribute("fixed");
        const valueAttribute: XMLAttribute | undefined = defaultAttribute ?? fixedAttribute;
        if (!valueAttribute) {
            return;
        }
        const nameAttribute: XMLAttribute | undefined = attributeElement.getAttribute("name");
        const refAttribute: XMLAttribute | undefined = attributeElement.getAttribute("ref");
        let attributeName: string | undefined = undefined;
        if (refAttribute) {
            attributeName = refAttribute.getValue();
        } else if (nameAttribute) {
            attributeName = nameAttribute.getValue();
        }
        if (!attributeName) {
            return;
        }
        if (!accumulator.has(attributeName)) {
            accumulator.set(attributeName, valueAttribute.getValue());
        }
    }

    protected resolveTypeDefaults(typeName: string, namespace?: string, visitedTypes?: Set<string>): Map<string, string> {
        const localName: string = this.getLocalName(typeName);
        const key: string = this.buildTypeKey(localName, namespace);
        const cached: Map<string, string> | undefined = this.complexTypeDefaultCache.get(key);
        if (cached) {
            return new Map<string, string>(cached);
        }
        const definition: XMLElement | undefined = this.lookupComplexType(typeName);
        if (!definition) {
            return new Map<string, string>();
        }
        const visited: Set<string> = visitedTypes ? new Set<string>(visitedTypes) : new Set<string>();
        if (visited.has(key)) {
            return new Map<string, string>();
        }
        visited.add(key);
        const accumulator: Map<string, string> = new Map<string, string>();
        this.collectDefaultsFromComplexType(definition, accumulator, visited, namespace);
        this.complexTypeDefaultCache.set(key, new Map<string, string>(accumulator));
        return accumulator;
    }

    protected resolveAttributeGroupDefaults(groupName: string, namespace?: string, visitedGroups?: Set<string>): Map<string, string> {
        const localName: string = this.getLocalName(groupName);
        const key: string = this.buildTypeKey(localName, namespace);
        const cached: Map<string, string> | undefined = this.attributeGroupDefaultCache.get(key);
        if (cached) {
            return new Map<string, string>(cached);
        }
        const definition: XMLElement | undefined = this.lookupAttributeGroup(groupName);
        if (!definition) {
            return new Map<string, string>();
        }
        const visited: Set<string> = visitedGroups ? new Set<string>(visitedGroups) : new Set<string>();
        if (visited.has(key)) {
            return new Map<string, string>();
        }
        visited.add(key);
        const accumulator: Map<string, string> = new Map<string, string>();
        const children: Array<XMLElement> = definition.getChildren();
        for (let index: number = 0; index < children.length; index++) {
            const child: XMLElement = children[index];
            const childLocalName: string = this.getLocalName(child.getName());
            if (childLocalName === "attribute") {
                this.recordAttributeDefault(child, accumulator);
                continue;
            }
            if (childLocalName === "attributeGroup") {
                const refAttribute: XMLAttribute | undefined = child.getAttribute("ref");
                if (!refAttribute) {
                    continue;
                }
                const nestedDefaults: Map<string, string> = this.resolveAttributeGroupDefaults(refAttribute.getValue(), namespace, visited);
                this.mergeMaps(accumulator, nestedDefaults);
            }
        }
        this.attributeGroupDefaultCache.set(key, new Map<string, string>(accumulator));
        return accumulator;
    }

    protected lookupComplexType(typeName: string): XMLElement | undefined {
        const direct: XMLElement | undefined = this.complexTypeDefinitions.get(typeName);
        if (direct) {
            return direct;
        }
        const localName: string = this.getLocalName(typeName);
        const byLocal: XMLElement | undefined = this.complexTypeDefinitions.get(localName);
        if (byLocal) {
            return byLocal;
        }
        const entries: Array<[string, XMLElement]> = Array.from(this.complexTypeDefinitions.entries());
        for (let index: number = 0; index < entries.length; index++) {
            const entry: [string, XMLElement] = entries[index];
            const candidateKey: string = entry[0];
            if (candidateKey.endsWith("|" + localName) || candidateKey === localName) {
                return entry[1];
            }
        }
        return undefined;
    }

    protected lookupAttributeGroup(groupName: string): XMLElement | undefined {
        const direct: XMLElement | undefined = this.attributeGroupDefinitions.get(groupName);
        if (direct) {
            return direct;
        }
        const localName: string = this.getLocalName(groupName);
        const byLocal: XMLElement | undefined = this.attributeGroupDefinitions.get(localName);
        if (byLocal) {
            return byLocal;
        }
        const entries: Array<[string, XMLElement]> = Array.from(this.attributeGroupDefinitions.entries());
        for (let index: number = 0; index < entries.length; index++) {
            const entry: [string, XMLElement] = entries[index];
            const candidateKey: string = entry[0];
            if (candidateKey.endsWith("|" + localName) || candidateKey === localName) {
                return entry[1];
            }
        }
        return undefined;
    }

    protected mergeMaps(target: Map<string, string>, source: Map<string, string>): void {
        source.forEach((value: string, key: string) => {
            if (!target.has(key)) {
                target.set(key, value);
            }
        });
    }

    protected walkSchema(schemaPath: string): void {
        const normalizedPath: string = this.normalizePath(schemaPath);
        if (this.visitedSchemas.has(normalizedPath)) {
            return;
        }
        if (!existsSync(normalizedPath)) {
            throw new Error(`XML Schema file not found: ${schemaPath}`);
        }
        this.visitedSchemas.add(normalizedPath);
        const domBuilder: DOMBuilder = new DOMBuilder();
        const parser: SAXParser = new SAXParser();
        if (this.catalog) {
            parser.setCatalog(this.catalog);
        }
        parser.setSchemaLoadingEnabled(false);
        parser.setContentHandler(domBuilder);
        parser.parseFile(normalizedPath);
        const document: XMLDocument | undefined = domBuilder.getDocument();
        if (!document) {
            return;
        }
        const root: XMLElement | undefined = document.getRoot();
        if (!root) {
            return;
        }
        const targetNamespaceAttribute: XMLAttribute | undefined = root.getAttribute("targetNamespace");
        const targetNamespace: string | undefined = targetNamespaceAttribute ? targetNamespaceAttribute.getValue() : undefined;
        this.registerSchemaComponents(root, targetNamespace);
        this.processSchemaReferences(root, dirname(normalizedPath));
    }

    protected processSchemaReferences(schemaElement: XMLElement, baseDir: string): void {
        const children: Array<XMLElement> = schemaElement.getChildren();
        for (let index: number = 0; index < children.length; index++) {
            const child: XMLElement = children[index];
            const localName: string = this.getLocalName(child.getName());
            if (localName !== "include" && localName !== "import" && localName !== "redefine") {
                continue;
            }
            const locationAttribute: XMLAttribute | undefined = child.getAttribute("schemaLocation");
            const namespaceAttribute: XMLAttribute | undefined = child.getAttribute("namespace");
            const location: string | undefined = locationAttribute ? locationAttribute.getValue() : undefined;
            const namespaceValue: string | undefined = namespaceAttribute ? namespaceAttribute.getValue() : undefined;
            if (namespaceValue && XMLSchemaParser.shouldIgnoreNamespace(namespaceValue)) {
                continue;
            }
            const resolved: string | undefined = this.resolveReference(location, baseDir, namespaceValue);
            if (resolved) {
                this.walkSchema(resolved);
            }
        }
    }

    static shouldIgnoreNamespace(namespaceUri: string): boolean {
        return XMLSchemaParser.IGNORED_NAMESPACES.has(namespaceUri);
    }

    protected registerSchemaComponents(schemaElement: XMLElement, targetNamespace?: string): void {
        const children: Array<XMLElement> = schemaElement.getChildren();
        for (let index: number = 0; index < children.length; index++) {
            const child: XMLElement = children[index];
            const localName: string = this.getLocalName(child.getName());
            if (localName === "element") {
                const nameAttribute: XMLAttribute | undefined = child.getAttribute("name");
                if (!nameAttribute) {
                    continue;
                }
                const elementName: string = nameAttribute.getValue();
                const key: string = this.buildElementKey(elementName, targetNamespace);
                if (!this.elementDefinitions.has(key)) {
                    const info: ElementInfo = {
                        element: child,
                        namespace: targetNamespace,
                        localName: elementName
                    };
                    this.elementDefinitions.set(key, info);
                }
                continue;
            }
            if (localName === "complexType") {
                const nameAttribute: XMLAttribute | undefined = child.getAttribute("name");
                if (!nameAttribute) {
                    continue;
                }
                const typeName: string = nameAttribute.getValue();
                const key: string = this.buildTypeKey(typeName, targetNamespace);
                if (!this.complexTypeDefinitions.has(key)) {
                    this.complexTypeDefinitions.set(key, child);
                }
                if (!this.complexTypeDefinitions.has(typeName)) {
                    this.complexTypeDefinitions.set(typeName, child);
                }
                const localKey: string = this.getLocalName(typeName);
                if (!this.complexTypeDefinitions.has(localKey)) {
                    this.complexTypeDefinitions.set(localKey, child);
                }
                continue;
            }
            if (localName === "attributeGroup") {
                const nameAttribute: XMLAttribute | undefined = child.getAttribute("name");
                if (!nameAttribute) {
                    continue;
                }
                const groupName: string = nameAttribute.getValue();
                const key: string = this.buildTypeKey(groupName, targetNamespace);
                if (!this.attributeGroupDefinitions.has(key)) {
                    this.attributeGroupDefinitions.set(key, child);
                }
                if (!this.attributeGroupDefinitions.has(groupName)) {
                    this.attributeGroupDefinitions.set(groupName, child);
                }
                const localKey: string = this.getLocalName(groupName);
                if (!this.attributeGroupDefinitions.has(localKey)) {
                    this.attributeGroupDefinitions.set(localKey, child);
                }
            }
        }
    }

    protected resolveReference(location: string | undefined, baseDir: string, namespaceValue?: string): string | undefined {
        if (location) {
            if (location.startsWith("file://")) {
                const normalizedFileUrl: string = fileURLToPath(location);
                if (existsSync(normalizedFileUrl)) {
                    return normalizedFileUrl;
                }
            } else if (isAbsolute(location)) {
                if (existsSync(location)) {
                    return location;
                }
            } else if (!location.startsWith("http://") && !location.startsWith("https://")) {
                const resolvedPath: string = resolve(baseDir, location);
                if (existsSync(resolvedPath)) {
                    return resolvedPath;
                }
            }
            if (this.catalog) {
                const catalogCandidates: Array<string | undefined> = [
                    this.catalog.matchURI(location),
                    this.catalog.matchSystem(location)
                ];
                for (const candidate of catalogCandidates) {
                    if (!candidate) {
                        continue;
                    }
                    const normalizedCandidate: string = candidate.startsWith("file://") ? fileURLToPath(candidate) : candidate;
                    if (existsSync(normalizedCandidate)) {
                        return normalizedCandidate;
                    }
                }
            }
        }
        if (namespaceValue && this.catalog) {
            const catalogCandidates: Array<string | undefined> = [
                this.catalog.matchURI(namespaceValue),
                this.catalog.matchSystem(namespaceValue)
            ];
            for (const candidate of catalogCandidates) {
                if (!candidate) {
                    continue;
                }
                const normalizedCandidate: string = candidate.startsWith("file://") ? fileURLToPath(candidate) : candidate;
                if (existsSync(normalizedCandidate)) {
                    return normalizedCandidate;
                }
            }
        }
        if (!location) {
            return undefined;
        }
        if (location.startsWith("http://") || location.startsWith("https://")) {
            return undefined;
        }
        const resolvedFallback: string = resolve(baseDir, location);
        if (existsSync(resolvedFallback)) {
            return resolvedFallback;
        }
        return undefined;
    }

    protected normalizePath(location: string): string {
        if (location.startsWith("file://")) {
            return fileURLToPath(location);
        }
        if (isAbsolute(location)) {
            return location;
        }
        return resolve(location);
    }

    protected getLocalName(name: string): string {
        const separatorIndex: number = name.indexOf(":");
        if (separatorIndex === -1) {
            return name;
        }
        return name.substring(separatorIndex + 1);
    }

    protected buildElementKey(name: string, namespace?: string): string {
        if (namespace) {
            return `${namespace}|${name}`;
        }
        return name;
    }

    protected buildTypeKey(name: string, namespace?: string): string {
        const localName: string = this.getLocalName(name);
        if (namespace) {
            return `${namespace}|${localName}`;
        }
        return localName;
    }

}
