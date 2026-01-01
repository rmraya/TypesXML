/*******************************************************************************
 * Copyright (c) 2023-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
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
import { TextNode } from "./TextNode";
import { XMLAttribute } from "./XMLAttribute";
import { XMLElement } from "./XMLElement";
import { XMLNode } from "./XMLNode";
import { type AttributeDefault } from "./XMLSchemaParser";

type NameInfo = {
    lexicalName: string;
    localName: string;
    namespace?: string;
};

export class RelaxNGParser {

    private readonly catalog?: Catalog;
    private readonly baseDir: string;
    private readonly root: XMLElement;
    private defaultPrefix: string = "";
    private defaultNamespace: string = Constants.RELAXNG_NS_URI;
    private definitions: Map<string, XMLElement> = new Map();
    private elements: XMLElement[] = [];
    private divsRemoved: boolean = false;

    constructor(schemaPath: string, catalog?: Catalog) {
        const absolutePath: string = isAbsolute(schemaPath) ? schemaPath : resolve(schemaPath);
        this.baseDir = dirname(absolutePath);
        const contentHandler: DOMBuilder = new DOMBuilder();
        const parser: SAXParser = new SAXParser();
        if (catalog) {
            this.catalog = catalog;
            parser.setCatalog(this.catalog);
        }
        parser.setContentHandler(contentHandler);
        parser.parseFile(absolutePath);
        const documentRoot: XMLElement | undefined = contentHandler.getDocument()?.getRoot();
        if (!documentRoot) {
            throw new Error(`RelaxNG schema "${absolutePath}" could not be parsed`);
        }

        this.root = documentRoot;
        this.defaultPrefix = this.getPrefix(this.root);

        const xmlnsDefault: XMLAttribute | undefined = this.root.getAttribute("xmlns");
        if (xmlnsDefault) {
            this.defaultNamespace = xmlnsDefault.getValue();
        } else if (this.defaultPrefix) {
            const prefixedNs: XMLAttribute | undefined = this.root.getAttribute(`xmlns:${this.defaultPrefix}`);
            if (prefixedNs) {
                this.defaultNamespace = prefixedNs.getValue();
            }
        }
        if (!this.defaultNamespace) {
            this.defaultNamespace = Constants.RELAXNG_NS_URI;
        }

        this.removeForeign(this.root);
        this.replaceExternalRef(this.root);
        this.replaceIncludes(this.root);
        do {
            this.divsRemoved = false;
            this.removeDivs(this.root);
        } while (this.divsRemoved);
        this.nameAttribute(this.root, new Map<string, string>());
    }

    getElements(): Map<string, Map<string, AttributeDefault>> {
        const result: Map<string, Map<string, AttributeDefault>> = new Map<string, Map<string, AttributeDefault>>();

        this.definitions = new Map<string, XMLElement>();
        this.harvestDefinitions(this.root);

        this.elements = [];
        this.harvestElements(this.root);

        for (const element of this.elements) {
            const nameElement: XMLElement | undefined = this.findChildByLocalName(element, "name");
            if (!nameElement) {
                continue;
            }
            const elementInfo: NameInfo | undefined = this.extractNameInfo(nameElement);
            if (!elementInfo) {
                continue;
            }

            const defaults: Map<string, AttributeDefault> = new Map<string, AttributeDefault>();
            const visitedRefs: Set<string> = new Set<string>();
            this.collectAttributeDefaultsFromPattern(element, defaults, visitedRefs, true);
            if (defaults.size === 0) {
                continue;
            }

            this.storeElementDefaults(result, elementInfo, defaults);
        }

        return result;
    }

    private storeElementDefaults(result: Map<string, Map<string, AttributeDefault>>, elementInfo: NameInfo, defaults: Map<string, AttributeDefault>): void {
        result.set(elementInfo.lexicalName, this.cloneAttributeDefaultMap(defaults));
        if (!result.has(elementInfo.localName)) {
            result.set(elementInfo.localName, this.cloneAttributeDefaultMap(defaults));
        }
        if (elementInfo.namespace) {
            const namespacedKey: string = this.buildAttributeKey(elementInfo.localName, elementInfo.namespace);
            result.set(namespacedKey, this.cloneAttributeDefaultMap(defaults));
        }
    }

    private cloneAttributeDefaultMap(source: Map<string, AttributeDefault>): Map<string, AttributeDefault> {
        const clone: Map<string, AttributeDefault> = new Map<string, AttributeDefault>();
        source.forEach((value: AttributeDefault, key: string) => {
            clone.set(key, {
                localName: value.localName,
                namespace: value.namespace,
                lexicalName: value.lexicalName,
                value: value.value
            });
        });
        return clone;
    }

    private collectAttributeDefaultsFromPattern(pattern: XMLElement, defaults: Map<string, AttributeDefault>, visitedRefs: Set<string>, allowElementTraversal: boolean): void {
        const localName: string = this.getLocalNameFromElement(pattern);
        if (localName === "attribute") {
            this.addAttributeDefault(pattern, defaults);
            return;
        }
        if (localName === "ref" || localName === "parentRef") {
            const nameAttr: XMLAttribute | undefined = pattern.getAttribute("name");
            const refName: string | undefined = nameAttr?.getValue();
            if (!refName || visitedRefs.has(refName)) {
                return;
            }
            visitedRefs.add(refName);
            const referenced: XMLElement | undefined = this.definitions.get(refName);
            if (referenced) {
                this.collectAttributeDefaultsFromPattern(referenced, defaults, visitedRefs, allowElementTraversal);
            }
            return;
        }
        let childAllowTraversal: boolean = allowElementTraversal;
        if (localName === "element") {
            if (!allowElementTraversal) {
                return;
            }
            childAllowTraversal = false;
        }
        for (const child of pattern.getChildren()) {
            if (child.getNodeType() !== Constants.ELEMENT_NODE) {
                continue;
            }
            this.collectAttributeDefaultsFromPattern(child as XMLElement, defaults, visitedRefs, childAllowTraversal);
        }
    }

    private addAttributeDefault(attributeElement: XMLElement, defaults: Map<string, AttributeDefault>): void {
        const defaultValue: string | undefined = this.findDefaultValue(attributeElement);
        if (defaultValue === undefined) {
            return;
        }
        const nameElement: XMLElement | undefined = this.findChildByLocalName(attributeElement, "name");
        if (!nameElement) {
            return;
        }
        const nameInfo: NameInfo | undefined = this.extractNameInfo(nameElement);
        if (!nameInfo) {
            return;
        }
        const attributeDefault: AttributeDefault = {
            localName: nameInfo.localName,
            namespace: nameInfo.namespace,
            lexicalName: nameInfo.lexicalName,
            value: defaultValue
        };
        this.setAttributeDefault(defaults, attributeDefault);
    }

    private extractNameInfo(nameElement: XMLElement): NameInfo | undefined {
        const lexicalName: string = nameElement.getText().trim();
        if (!lexicalName) {
            return undefined;
        }
        const nsAttr: XMLAttribute | undefined = nameElement.getAttribute("ns");
        let namespace: string | undefined = nsAttr ? nsAttr.getValue() : undefined;
        let localName: string = lexicalName;
        const separatorIndex: number = lexicalName.indexOf(":");
        if (separatorIndex !== -1) {
            localName = lexicalName.substring(separatorIndex + 1);
            if (!namespace) {
                const prefix: string = lexicalName.substring(0, separatorIndex);
                if (prefix === "xml") {
                    namespace = "http://www.w3.org/XML/1998/namespace";
                }
            }
        }
        return {
            lexicalName: lexicalName,
            localName: localName,
            namespace: namespace && namespace.length > 0 ? namespace : undefined
        };
    }

    private findDefaultValue(attribute: XMLElement): string | undefined {
        for (const attr of attribute.getAttributes()) {
            if (this.getLocalNameFromString(attr.getName()) === "defaultValue") {
                return attr.getValue();
            }
        }
        return this.findDefaultValueFromChildren(attribute);
    }

    private findDefaultValueFromChildren(attribute: XMLElement): string | undefined {
        // Search depth-first for any compatibility "defaultValue" element among descendants
        const stack: XMLElement[] = [];
        for (const child of attribute.getChildren()) {
            if (child.getNodeType() === Constants.ELEMENT_NODE) {
                stack.push(child as XMLElement);
            }
        }

        while (stack.length > 0) {
            const node: XMLElement = stack.pop() as XMLElement;
            if (this.getLocalNameFromElement(node) === "defaultValue") {
                return node.getText().trim();
            }
            for (const child of node.getChildren()) {
                if (child.getNodeType() === Constants.ELEMENT_NODE) {
                    stack.push(child as XMLElement);
                }
            }
        }

        return undefined;
    }

    private setAttributeDefault(target: Map<string, AttributeDefault>, value: AttributeDefault): void {
        const key: string = this.buildAttributeKey(value.localName, value.namespace);
        const removals: string[] = [];
        target.forEach((existing: AttributeDefault, existingKey: string) => {
            if (existing.localName !== value.localName) {
                return;
            }
            const sameNamespace: boolean = existing.namespace === value.namespace;
            if (sameNamespace && existingKey === key) {
                return;
            }
            if (sameNamespace || (value.namespace && !existing.namespace)) {
                removals.push(existingKey);
            }
        });
        for (const removalKey of removals) {
            target.delete(removalKey);
        }
        target.set(key, {
            localName: value.localName,
            namespace: value.namespace,
            lexicalName: value.lexicalName,
            value: value.value
        });
    }

    private buildAttributeKey(name: string, namespace?: string): string {
        if (namespace) {
            return namespace + "|" + name;
        }
        return name;
    }

    private removeForeign(element: XMLElement): void {
        const newContent: XMLNode[] = [];
        for (const node of element.getContent()) {
            const nodeType: number = node.getNodeType();
            if (nodeType === Constants.TEXT_NODE || nodeType === Constants.PROCESSING_INSTRUCTION_NODE) {
                newContent.push(node);
                continue;
            }

            if (nodeType === Constants.ELEMENT_NODE) {
                const child: XMLElement = node as XMLElement;
                if (!this.isRelaxNGElement(child)) {
                    if (this.isCompatibilityAnnotation(child)) {
                        newContent.push(child);
                    }
                    continue;
                }
                this.removeForeign(child);
                newContent.push(child);
            }
        }
        element.setContent(newContent);
    }

    private replaceExternalRef(element: XMLElement): void {
        const newContent: XMLNode[] = [];
        for (const node of element.getContent()) {
            const nodeType: number = node.getNodeType();
            if (nodeType === Constants.TEXT_NODE) {
                const textNode: TextNode = node as TextNode;
                if (!this.isBlankText(textNode)) {
                    newContent.push(node);
                }
                continue;
            }
            if (nodeType === Constants.PROCESSING_INSTRUCTION_NODE) {
                newContent.push(node);
                continue;
            }
            if (nodeType === Constants.ELEMENT_NODE) {
                const child: XMLElement = node as XMLElement;
                if (this.getLocalNameFromElement(child) === "externalRef") {
                    const hrefAttr: XMLAttribute | undefined = child.getAttribute("href");
                    const href: string = hrefAttr?.getValue() ?? "";
                    const resolved: string | undefined = this.resolveHref(href);
                    if (!resolved) {
                        throw new Error(`RelaxNG externalRef target not found: ${href}`);
                    }
                    const parser: RelaxNGParser = new RelaxNGParser(resolved, this.catalog);
                    newContent.push(parser.getRootElement());
                    continue;
                }
                this.replaceIncludes(child);
                newContent.push(child);
            }
        }
        element.setContent(newContent);
    }

    private replaceIncludes(element: XMLElement): void {
        const newContent: XMLNode[] = [];
        for (const node of element.getContent()) {
            const nodeType: number = node.getNodeType();
            if (nodeType === Constants.TEXT_NODE) {
                const textNode: TextNode = node as TextNode;
                if (!this.isBlankText(textNode)) {
                    newContent.push(node);
                }
                continue;
            }
            if (nodeType === Constants.PROCESSING_INSTRUCTION_NODE) {
                newContent.push(node);
                continue;
            }
            if (nodeType === Constants.ELEMENT_NODE) {
                const child: XMLElement = node as XMLElement;
                if (this.getLocalNameFromElement(child) === "include") {
                    const hrefAttr: XMLAttribute | undefined = child.getAttribute("href");
                    const href: string = hrefAttr?.getValue() ?? "";
                    const resolved: string | undefined = this.resolveHref(href);
                    if (!resolved) {
                        throw new Error(`RelaxNG include target not found: ${href}`);
                    }
                    const parser: RelaxNGParser = new RelaxNGParser(resolved, this.catalog);
                    const div: XMLElement = this.createRelaxNGElement("div");
                    div.addElement(parser.getRootElement());
                    for (const includeChild of child.getChildren()) {
                        div.addElement(includeChild);
                    }
                    newContent.push(div);
                    continue;
                }
                this.replaceIncludes(child);
                newContent.push(child);
            }
        }
        element.setContent(newContent);
    }

    private removeDivs(element: XMLElement): void {
        const newContent: XMLNode[] = [];
        for (const node of element.getContent()) {
            if (node.getNodeType() === Constants.ELEMENT_NODE) {
                const child: XMLElement = node as XMLElement;
                if (this.getLocalNameFromElement(child) === "div") {
                    newContent.push(...child.getContent());
                    this.divsRemoved = true;
                } else {
                    newContent.push(child);
                }
            } else {
                newContent.push(node);
            }
        }
        element.setContent(newContent);
        for (const child of element.getChildren()) {
            this.removeDivs(child);
        }
    }

    private harvestDefinitions(element: XMLElement): void {
        if (this.getLocalNameFromElement(element) === "define") {
            const nameAttr: XMLAttribute | undefined = element.getAttribute("name");
            const definitionName: string | undefined = nameAttr?.getValue();
            if (definitionName) {
                if (this.definitions.has(definitionName)) {
                    const existing: XMLElement = this.definitions.get(definitionName)!;
                    const combined: XMLNode[] = [...existing.getContent(), ...element.getContent()];
                    existing.setContent(combined);
                } else {
                    this.definitions.set(definitionName, element);
                }
            }
        }
        for (const child of element.getChildren()) {
            this.harvestDefinitions(child);
        }
    }

    private harvestElements(element: XMLElement): void {
        if (this.getLocalNameFromElement(element) === "element" && this.findChildByLocalName(element, "name")) {
            this.elements.push(element);
        }
        for (const child of element.getChildren()) {
            this.harvestElements(child);
        }
    }

    private nameAttribute(element: XMLElement, context: Map<string, string>): void {
        const currentContext: Map<string, string> = this.augmentNamespaceContext(context, element);
        const localName: string = this.getLocalNameFromElement(element);
        const isElementPattern: boolean = localName === "element";
        const isAttributePattern: boolean = localName === "attribute";
        if ((isElementPattern || isAttributePattern) && element.hasAttribute("name")) {
            const nameValue: string = element.getAttribute("name")?.getValue() ?? "";
            const nameElement: XMLElement = this.createRelaxNGElement("name");
            nameElement.addString(nameValue);

            const nsAttr: XMLAttribute | undefined = element.getAttribute("ns");
            if (nsAttr) {
                nameElement.setAttribute(new XMLAttribute("ns", nsAttr.getValue()));
                element.removeAttribute("ns");
            } else {
                const resolvedNamespace: string | undefined = this.resolveNamespaceBinding(nameValue, currentContext, isElementPattern, isAttributePattern);
                if (resolvedNamespace) {
                    nameElement.setAttribute(new XMLAttribute("ns", resolvedNamespace));
                }
            }

            element.removeAttribute("name");
            const content: XMLNode[] = [nameElement, ...element.getContent()];
            element.setContent(content);
        }
        for (const child of element.getChildren()) {
            this.nameAttribute(child, currentContext);
        }
    }

    private augmentNamespaceContext(baseContext: Map<string, string>, element: XMLElement): Map<string, string> {
        const updated: Map<string, string> = new Map<string, string>(baseContext);
        for (const attribute of element.getAttributes()) {
            const attributeName: string = attribute.getName();
            if (attributeName === "xmlns") {
                updated.set("", attribute.getValue());
                continue;
            }
            if (attributeName.startsWith("xmlns:")) {
                const prefix: string = attributeName.substring(6);
                updated.set(prefix, attribute.getValue());
            }
        }
        if (!updated.has("xml")) {
            updated.set("xml", "http://www.w3.org/XML/1998/namespace");
        }
        return updated;
    }

    private resolveNamespaceBinding(lexicalName: string, context: Map<string, string>, isElementPattern: boolean, isAttributePattern: boolean): string | undefined {
        const separatorIndex: number = lexicalName.indexOf(":");
        if (separatorIndex === -1) {
            if (isElementPattern) {
                return context.get("") ?? undefined;
            }
            if (isAttributePattern) {
                return undefined;
            }
            return context.get("") ?? undefined;
        }
        const prefix: string = lexicalName.substring(0, separatorIndex);
        return context.get(prefix);
    }

    private resolveHref(href: string): string | undefined {
        if (!href) {
            return undefined;
        }

        let candidate: string = href;
        if (candidate.startsWith("file://")) {
            try {
                candidate = fileURLToPath(candidate);
            } catch {
                return undefined;
            }
        }

        const attempts: Array<string | undefined> = [];
        if (this.catalog) {
            const systemMatch = this.catalog.matchSystem(candidate);
            const uriMatch = this.catalog.matchURI(candidate);
            attempts.push(systemMatch);
            attempts.push(uriMatch);
        }
        attempts.push(candidate);

        for (const attempt of attempts) {
            const normalized: string | undefined = this.normalizeResolvedPath(attempt);
            if (normalized) {
                return normalized;
            }
        }
        return undefined;
    }

    private normalizeResolvedPath(pathCandidate: string | undefined): string | undefined {
        if (!pathCandidate) {
            return undefined;
        }

        let normalized: string = pathCandidate;
        if (normalized.startsWith("file://")) {
            try {
                normalized = fileURLToPath(normalized);
            } catch {
                return undefined;
            }
        }

        if (isAbsolute(normalized)) {
            return existsSync(normalized) ? normalized : undefined;
        }

        const resolved: string = resolve(this.baseDir, normalized);
        return existsSync(resolved) ? resolved : undefined;
    }

    private createRelaxNGElement(localName: string): XMLElement {
        const qualifiedName: string = this.defaultPrefix ? `${this.defaultPrefix}:${localName}` : localName;
        return new XMLElement(qualifiedName);
    }

    private isBlankText(node: TextNode): boolean {
        return node.getValue().trim().length === 0;
    }

    private getLocalNameFromElement(element: XMLElement): string {
        return this.getLocalNameFromString(element.getName());
    }

    private getLocalNameFromString(name: string): string {
        const index: number = name.indexOf(":");
        return index === -1 ? name : name.substring(index + 1);
    }

    private getPrefix(element: XMLElement): string {
        const name: string = element.getName();
        const index: number = name.indexOf(":");
        return index === -1 ? "" : name.substring(0, index);
    }

    private isCompatibilityAnnotation(element: XMLElement): boolean {
        const localName: string = this.getLocalNameFromElement(element);
        if (localName === "defaultValue") {
            return true;
        }
        return false;
    }

    private isRelaxNGElement(element: XMLElement): boolean {
        const prefix: string = this.getPrefix(element);
        if (this.defaultPrefix) {
            if (prefix !== this.defaultPrefix) {
                return false;
            }
        } else if (prefix) {
            return false;
        }

        const selfNs: XMLAttribute | undefined = element.getAttribute("xmlns");
        if (selfNs) {
            const value: string = selfNs.getValue();
            if (value && value !== this.defaultNamespace && value !== Constants.RELAXNG_NS_URI) {
                return false;
            }
        }

        if (this.defaultPrefix) {
            const prefixedNs: XMLAttribute | undefined = element.getAttribute(`xmlns:${this.defaultPrefix}`);
            if (prefixedNs) {
                const value: string = prefixedNs.getValue();
                if (value && value !== this.defaultNamespace && value !== Constants.RELAXNG_NS_URI) {
                    return false;
                }
            }
        }

        return true;
    }

    private findChildByLocalName(element: XMLElement, localName: string): XMLElement | undefined {
        for (const child of element.getChildren()) {
            if (this.getLocalNameFromElement(child) === localName) {
                return child;
            }
        }
        return undefined;
    }

    private getRootElement(): XMLElement {
        return this.root;
    }
}