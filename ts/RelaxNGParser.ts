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

import { existsSync } from "fs";
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

export class RelaxNGParser {

    private readonly catalog?: Catalog;
    private readonly baseDir: string;
    private readonly root: XMLElement;
    private defaultPrefix: string = "";
    private defaultNamespace: string = Constants.RELAXNG_NS_URI;
    private definitions: Map<string, XMLElement> = new Map();
    private elements: XMLElement[] = [];
    private attributes: XMLElement[] = [];
    private visited: Set<string> = new Set();
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
        this.nameAttribute(this.root);
    }

    getElements(): Map<string, Map<string, string>> {
        const result: Map<string, Map<string, string>> = new Map();

        this.definitions = new Map();
        this.harvestDefinitions(this.root);

        this.elements = [];
        this.harvestElements(this.root);

        for (const element of this.elements) {
            this.attributes = [];
            this.visited = new Set();
            this.getAttributes(element);

            const defaults: Map<string, string> = new Map();
            for (const attribute of this.attributes) {
                const nameElement: XMLElement | undefined = this.findChildByLocalName(attribute, "name");
                if (!nameElement) {
                    continue;
                }
                const attributeName: string = nameElement.getText().trim();
                if (!attributeName) {
                    continue;
                }
                if (attributeName.indexOf(":") !== -1 && !attributeName.startsWith("xml:")) {
                    continue;
                }

                const defaultValue: string | undefined = this.findDefaultValue(attribute);
                if (defaultValue !== undefined) {
                    defaults.set(attributeName, defaultValue);
                }
            }

            if (defaults.size === 0) {
                continue;
            }

            const elementNameElement: XMLElement | undefined = this.findChildByLocalName(element, "name");
            if (!elementNameElement) {
                continue;
            }

            const elementName: string = elementNameElement.getText().trim();
            if (elementName) {
                result.set(elementName, defaults);
            }
        }

        return result;
    }

    private findDefaultValue(attribute: XMLElement): string | undefined {
        for (const attr of attribute.getAttributes()) {
            if (this.getLocalNameFromString(attr.getName()) === "defaultValue") {
                return attr.getValue();
            }
        }
        return undefined;
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

    private getAttributes(element: XMLElement): void {
        const localName: string = this.getLocalNameFromElement(element);
        if (localName === "attribute") {
            this.attributes.push(element);
            return;
        }
        if (localName === "ref") {
            const nameAttr: XMLAttribute | undefined = element.getAttribute("name");
            const refName: string | undefined = nameAttr?.getValue();
            if (refName && !this.visited.has(refName)) {
                this.visited.add(refName);
                const definition: XMLElement | undefined = this.definitions.get(refName);
                if (definition) {
                    this.getAttributes(definition);
                }
            }
            return;
        }
        for (const child of element.getChildren()) {
            if (this.getLocalNameFromElement(child) === "element") {
                return;
            }
            this.getAttributes(child);
        }
    }

    private nameAttribute(element: XMLElement): void {
        const localName: string = this.getLocalNameFromElement(element);
        if ((localName === "element" || localName === "attribute") && element.hasAttribute("name")) {
            const nameValue: string = element.getAttribute("name")?.getValue() ?? "";
            const nameElement: XMLElement = this.createRelaxNGElement("name");
            nameElement.addString(nameValue);

            const nsAttr: XMLAttribute | undefined = element.getAttribute("ns");
            if (nsAttr) {
                nameElement.setAttribute(new XMLAttribute("ns", nsAttr.getValue()));
                element.removeAttribute("ns");
            }

            element.removeAttribute("name");
            const content: XMLNode[] = [nameElement, ...element.getContent()];
            element.setContent(content);
        }
        for (const child of element.getChildren()) {
            this.nameAttribute(child);
        }
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