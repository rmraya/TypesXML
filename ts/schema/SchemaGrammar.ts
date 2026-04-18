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

import { AttributeInfo, AttributeUse, Grammar, GrammarType, ValidationResult } from '../grammar/Grammar.js';
import { SchemaAttributeDecl } from './SchemaAttributeDecl.js';
import { SchemaContentModelType } from './SchemaContentModel.js';
import { SchemaElementDecl } from './SchemaElementDecl.js';
import { SchemaTypeValidator } from './SchemaTypeValidator.js';

export class SchemaGrammar implements Grammar {

    private elementDecls: Map<string, SchemaElementDecl>;
    private complexTypeDecls: Map<string, SchemaElementDecl>;
    private targetNamespaces: Set<string>;
    private namespaceDeclarations: Map<string, string>;
    private globalAttributeDecls: Map<string, SchemaAttributeDecl>;
    private importedGrammars: Map<string, SchemaGrammar>;
    private xsiTypeStack: Array<string | undefined>;
    private typeHierarchy: Map<string, {base: string, method: string}>;

    constructor() {
        this.elementDecls = new Map<string, SchemaElementDecl>();
        this.complexTypeDecls = new Map<string, SchemaElementDecl>();
        this.targetNamespaces = new Set<string>();
        this.namespaceDeclarations = new Map<string, string>();
        this.globalAttributeDecls = new Map<string, SchemaAttributeDecl>();
        this.importedGrammars = new Map<string, SchemaGrammar>();
        this.xsiTypeStack = [];
        this.typeHierarchy = new Map<string, {base: string, method: string}>();
    }

    addTargetNamespace(namespace: string): void {
        this.targetNamespaces.add(namespace);
    }

    addNamespaceDeclaration(prefix: string, uri: string): void {
        this.namespaceDeclarations.set(prefix, uri);
    }

    addGlobalAttributeDecl(decl: SchemaAttributeDecl): void {
        this.globalAttributeDecls.set(decl.getName(), decl);
    }

    addImportedGrammar(namespace: string, grammar: SchemaGrammar): void {
        this.importedGrammars.set(namespace, grammar);
    }

    addComplexTypeDecl(typeName: string, decl: SchemaElementDecl): void {
        this.complexTypeDecls.set(typeName, decl);
    }

    addTypeHierarchyEntry(typeName: string, baseTypeName: string, method: string): void {
        this.typeHierarchy.set(typeName, {base: baseTypeName, method: method});
    }

    mergeFrom(other: SchemaGrammar): void {
        for (const [, decl] of other.elementDecls) {
            this.addElementDecl(decl);
        }
        for (const [typeName, decl] of other.complexTypeDecls) {
            if (!this.complexTypeDecls.has(typeName)) {
                this.complexTypeDecls.set(typeName, decl);
            }
        }
        for (const ns of other.targetNamespaces) {
            this.targetNamespaces.add(ns);
        }
        for (const [name, decl] of other.globalAttributeDecls) {
            if (!this.globalAttributeDecls.has(name)) {
                this.globalAttributeDecls.set(name, decl);
            }
        }
        for (const [ns, grammar] of other.importedGrammars) {
            if (!this.importedGrammars.has(ns)) {
                this.importedGrammars.set(ns, grammar);
            }
        }
        for (const [typeName, entry] of other.typeHierarchy) {
            if (!this.typeHierarchy.has(typeName)) {
                this.typeHierarchy.set(typeName, entry);
            }
        }
    }

    addElementDecl(decl: SchemaElementDecl): void {
        const key: string = this.buildElementKey(decl.getName(), decl.getNamespace());
        this.elementDecls.set(key, decl);
    }

    getElementDecl(name: string): SchemaElementDecl | undefined {
        return this.lookupElementDecl(name);
    }

    validateElement(element: string, children: string[]): ValidationResult {
        const xsiType: string | undefined = this.xsiTypeStack.length > 0 ? this.xsiTypeStack.pop() : undefined;
        const substitutedDecl: SchemaElementDecl | undefined = xsiType !== undefined ? this.complexTypeDecls.get(xsiType) : undefined;

        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(element);
        if (!decl) {
            return ValidationResult.error('Element "' + element + '" is not declared in the schema');
        }
        // Per the spec, an abstract element cannot appear directly in an instance.
        if (decl.isAbstractElement() && xsiType === undefined) {
            return ValidationResult.error(
                'Element "' + element + '" is declared abstract and cannot appear directly in an instance'
            );
        }
        const effectiveDecl: SchemaElementDecl = substitutedDecl !== undefined ? substitutedDecl : decl;
        return effectiveDecl.getContentModel().validateChildren(element, children);
    }

    validateTextContent(element: string, text: string): ValidationResult {
        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(element);
        if (!decl) {
            return ValidationResult.success();
        }
        const trimmed: string = text.trim();
        const simpleType: string | undefined = decl.getSimpleType();
        if (simpleType !== undefined) {
            if (trimmed.length > 0 && !SchemaTypeValidator.validate(trimmed, simpleType)) {
                return ValidationResult.error(
                    'Invalid text content "' + trimmed + '" for element "' + element + '": expected type ' + simpleType
                );
            }
            if (trimmed.length > 0 && decl.hasTextFacets() && !decl.validateText(trimmed)) {
                return ValidationResult.error(
                    'Text content "' + trimmed + '" of element "' + element + '" violates facet constraints'
                );
            }
            return ValidationResult.success();
        }
        if (decl.getContentModel().getType() === SchemaContentModelType.ELEMENT
                || decl.getContentModel().getType() === SchemaContentModelType.EMPTY) {
            if (trimmed.length > 0) {
                return ValidationResult.error(
                    'Element "' + element + '" has element-only content but contains text: "' + trimmed + '"'
                );
            }
        }
        return ValidationResult.success();
    }

    validateAttributes(element: string, attributes: Map<string, string>): ValidationResult {
        // Detect xsi:type for content-model substitution and push to stack.
        let xsiTypeLocalName: string | undefined = undefined;
        for (const [attrName, attrValue] of attributes) {
            if (attrName === 'xsi:type') {
                xsiTypeLocalName = this.localName(attrValue);
                break;
            }
            if (attrName.endsWith(':type') && attrName.indexOf(':') !== -1) {
                const prefix: string = attrName.substring(0, attrName.indexOf(':'));
                const ns: string | undefined = this.resolvePrefix(prefix);
                if (ns === 'http://www.w3.org/2001/XMLSchema-instance') {
                    xsiTypeLocalName = this.localName(attrValue);
                    break;
                }
            }
        }
        this.xsiTypeStack.push(xsiTypeLocalName);

        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(element);
        if (!decl) {
            return ValidationResult.error('Element "' + element + '" is not declared in the schema');
        }
        // Per the spec (§3.9.4), xsi:type must name a type validly derived from the element's declared type.
        if (xsiTypeLocalName !== undefined) {
            const declaredTypeName: string | undefined = decl.getDeclaredTypeName();
            if (declaredTypeName !== undefined && this.complexTypeDecls.has(declaredTypeName)) {
                if (!this.isTypeDerivedFrom(xsiTypeLocalName, declaredTypeName)) {
                    return ValidationResult.error(
                        'xsi:type "' + xsiTypeLocalName + '" is not derived from the declared type "' +
                        declaredTypeName + '" of element "' + element + '"'
                    );
                }
                // Check block constraints: the element's declared type may block certain derivations.
                const blockConstraints: Set<string> = decl.getBlockConstraints();
                if (blockConstraints.size > 0) {
                    const blocksAll: boolean = blockConstraints.has('#all');
                    if (blocksAll || blockConstraints.has('extension') || blockConstraints.has('restriction')) {
                        const pathMethods: Set<string> = this.getPathMethods(xsiTypeLocalName, declaredTypeName);
                        if (pathMethods.size > 0) {
                            if (blocksAll) {
                                return ValidationResult.error(
                                    'Element "' + element + '" blocks all type derivation; xsi:type "' +
                                    xsiTypeLocalName + '" is not permitted'
                                );
                            }
                            for (const m of pathMethods) {
                                if (blockConstraints.has(m)) {
                                    return ValidationResult.error(
                                        'Element "' + element + '" blocks derivation by "' + m +
                                        '"; xsi:type "' + xsiTypeLocalName + '" is not permitted'
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        // If xsi:type is present, also use the substituted type's attribute declarations
        // so that derived-type attributes (e.g. exportCode on UKAddress) are accepted.
        const substitutedDecl: SchemaElementDecl | undefined = xsiTypeLocalName !== undefined
            ? this.complexTypeDecls.get(xsiTypeLocalName)
            : undefined;
        const baseAttributes: Map<string, SchemaAttributeDecl> = decl.getAttributeDecls();
        const declaredAttributes: Map<string, SchemaAttributeDecl> = substitutedDecl !== undefined
            ? substitutedDecl.getAttributeDecls()
            : baseAttributes;

        // Check provided attributes.
        for (const [attrName, attrValue] of attributes) {
            // Namespace declarations are not XML attributes in the data model.
            if (attrName === 'xmlns' || attrName.startsWith('xmlns:')) {
                continue;
            }
            // XML Schema instance attributes (xsi:*) are always permitted on any element.
            if (attrName.startsWith('xsi:')) {
                continue;
            }

            const colonIndex: number = attrName.indexOf(':');
            if (colonIndex !== -1) {
                const prefix0: string = attrName.substring(0, colonIndex);
                const ns0: string | undefined = this.resolvePrefix(prefix0);
                if (ns0 === 'http://www.w3.org/2001/XMLSchema-instance') {
                    continue;
                }
            }

            const attrLocalName: string = colonIndex !== -1 ? attrName.substring(colonIndex + 1) : attrName;
            const attrDecl: SchemaAttributeDecl | undefined =
                declaredAttributes.get(attrName) !== undefined
                    ? declaredAttributes.get(attrName)
                    : declaredAttributes.get(attrLocalName);

            if (attrDecl) {
                if (!attrDecl.isValid(attrValue)) {
                    return ValidationResult.error(
                        'Invalid value "' + attrValue + '" for attribute "' + attrName +
                        '" of type "' + attrDecl.getType() + '" in element "' + element + '"'
                    );
                }
                continue;
            }

            // Attribute not in element's own declarations — try imported namespace grammars.
            if (colonIndex !== -1) {
                const prefix: string = attrName.substring(0, colonIndex);
                const namespaceUri: string | undefined = this.resolvePrefix(prefix);
                if (namespaceUri === undefined) {
                    return ValidationResult.error(
                        'Undeclared namespace prefix "' + prefix + '" on attribute "' + attrName + '"'
                    );
                }
                const importedGrammar: SchemaGrammar | undefined = this.importedGrammars.get(namespaceUri);
                if (importedGrammar) {
                    const globalDecl: SchemaAttributeDecl | undefined = importedGrammar.globalAttributeDecls.get(attrLocalName);
                    if (globalDecl) {
                        if (!globalDecl.isValid(attrValue)) {
                            return ValidationResult.error(
                                'Invalid value "' + attrValue + '" for attribute "' + attrName +
                                '" of type "' + globalDecl.getType() + '" in element "' + element + '"'
                            );
                        }
                        continue;
                    }
                }
            }

            // Wildcard fallback: xs:anyAttribute on this element declaration.
            if (decl.allowsAnyAttribute()) {
                const anyNs: string = decl.getAnyAttributeNamespace();
                if (this.anyAttributeCovers(anyNs, attrName, element)) {
                    continue;
                }
            }

            return ValidationResult.error(
                'Attribute "' + attrName + '" is not declared for element "' + element + '"'
            );
        }

        // Check required attributes are present.
        for (const [, attrDecl] of declaredAttributes) {
            if (attrDecl.getUse() !== AttributeUse.REQUIRED) {
                continue;
            }
            const declaredName: string = attrDecl.getName();
            if (attributes.has(declaredName)) {
                continue;
            }
            // Also accept a prefixed variant (prefix:localName) of the same local name.
            let found: boolean = false;
            for (const attrName of attributes.keys()) {
                if (this.localName(attrName) === declaredName) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                return ValidationResult.error(
                    'Required attribute "' + declaredName + '" is missing from element "' + element + '"'
                );
            }
        }

        return ValidationResult.success();
    }

    getElementAttributes(element: string): Map<string, AttributeInfo> {
        const result: Map<string, AttributeInfo> = new Map<string, AttributeInfo>();
        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(element);
        if (!decl) {
            return result;
        }
        for (const [name, attrDecl] of decl.getAttributeDecls()) {
            result.set(name, attrDecl.toAttributeInfo());
        }
        return result;
    }

    getDefaultAttributes(element: string): Map<string, string> {
        const result: Map<string, string> = new Map<string, string>();
        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(element);
        if (!decl) {
            return result;
        }
        for (const [name, attrDecl] of decl.getAttributeDecls()) {
            const defaultValue: string | undefined = attrDecl.getDefaultValue();
            const fixedValue: string | undefined = attrDecl.getFixedValue();
            if (defaultValue !== undefined) {
                result.set(name, defaultValue);
            } else if (fixedValue !== undefined) {
                result.set(name, fixedValue);
            }
        }
        return result;
    }

    resolveEntity(_name: string): string | undefined {
        return undefined;
    }

    getGrammarType(): GrammarType {
        return GrammarType.XML_SCHEMA;
    }

    getTargetNamespaces(): Set<string> {
        return this.targetNamespaces;
    }

    getNamespaceDeclarations(): Map<string, string> {
        return this.namespaceDeclarations;
    }

    private anyAttributeCovers(anyNs: string, attrName: string, elementName: string): boolean {
        if (anyNs === '##any') {
            return true;
        }
        const colonIndex: number = attrName.indexOf(':');
        const attrPrefix: string | undefined = colonIndex !== -1 ? attrName.substring(0, colonIndex) : undefined;
        const attrNs: string | undefined = attrPrefix ? this.resolvePrefix(attrPrefix) : undefined;
        if (anyNs === '##local') {
            return attrPrefix === undefined;
        }
        if (anyNs === '##other') {
            const elementNs: string | undefined = this.getElementNamespace(elementName);
            return attrNs !== elementNs;
        }
        // Space-separated list of URIs, ##local, ##targetNamespace.
        const tokens: string[] = anyNs.split(/\s+/);
        for (const token of tokens) {
            if (token === '##local' && attrPrefix === undefined) {
                return true;
            }
            if (token === '##targetNamespace') {
                const elementNs: string | undefined = this.getElementNamespace(elementName);
                if (attrNs === elementNs) {
                    return true;
                }
            }
            if (token === attrNs) {
                return true;
            }
        }
        return false;
    }

    private getElementNamespace(elementName: string): string | undefined {
        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(elementName);
        return decl ? decl.getNamespace() : undefined;
    }

    private resolvePrefix(prefix: string): string | undefined {
        // 'xml' is always bound to this URI per the XML Namespaces specification.
        if (prefix === 'xml') {
            return 'http://www.w3.org/XML/1998/namespace';
        }
        return this.namespaceDeclarations.get(prefix);
    }

    private buildElementKey(name: string, namespace: string | undefined): string {
        if (namespace) {
            return namespace + '|' + name;
        }
        return name;
    }

    private localName(qname: string): string {
        const colonIndex: number = qname.indexOf(':');
        return colonIndex !== -1 ? qname.substring(colonIndex + 1) : qname;
    }

    private lookupElementDecl(elementName: string): SchemaElementDecl | undefined {
        // 1. Exact key match.
        let decl: SchemaElementDecl | undefined = this.elementDecls.get(elementName);
        if (decl) {
            return decl;
        }

        // 2. Strip namespace prefix; try local name only.
        const local: string = this.localName(elementName);
        if (local !== elementName) {
            decl = this.elementDecls.get(local);
            if (decl) {
                return decl;
            }
        }

        // 2b. Resolve the element's actual namespace from namespaceDeclarations and try that key first.
        const colonIndex: number = elementName.indexOf(':');
        const prefix: string = colonIndex !== -1 ? elementName.substring(0, colonIndex) : '';
        const resolvedNs: string | undefined = this.resolvePrefix(prefix);
        if (resolvedNs) {
            const nsKey: string = this.buildElementKey(local, resolvedNs);
            decl = this.elementDecls.get(nsKey);
            if (decl) {
                return decl;
            }
        }

        // 3. Try each known target namespace.
        for (const ns of this.targetNamespaces) {
            const nsKey: string = this.buildElementKey(local, ns);
            decl = this.elementDecls.get(nsKey);
            if (decl) {
                return decl;
            }
        }

        // 4. Linear scan matching local-name portion of any stored key.
        for (const [key, value] of this.elementDecls) {
            const pipeIndex: number = key.indexOf('|');
            const keyLocal: string = pipeIndex !== -1 ? key.substring(pipeIndex + 1) : key;
            if (keyLocal === local) {
                return value;
            }
        }

        return undefined;
    }

    private isTypeDerivedFrom(candidate: string, required: string): boolean {
        if (candidate === required) {
            return true;
        }
        // xs:anyType is the root of all types.
        if (required === 'anyType') {
            return true;
        }
        let current: string | undefined = candidate;
        const visited: Set<string> = new Set<string>();
        while (current !== undefined) {
            if (current === required) {
                return true;
            }
            if (visited.has(current)) {
                break;
            }
            visited.add(current);
            const entry: {base: string, method: string} | undefined = this.typeHierarchy.get(current);
            current = entry ? entry.base : undefined;
        }
        return false;
    }

    private getPathMethods(candidate: string, required: string): Set<string> {
        if (candidate === required) {
            return new Set<string>();
        }
        let current: string | undefined = candidate;
        const visited: Set<string> = new Set<string>();
        const methods: Set<string> = new Set<string>();
        while (current !== undefined) {
            if (current === required) {
                return methods;
            }
            if (visited.has(current)) {
                break;
            }
            visited.add(current);
            const entry: {base: string, method: string} | undefined = this.typeHierarchy.get(current);
            if (!entry) {
                break;
            }
            methods.add(entry.method);
            current = entry.base;
        }
        // Did not reach required — type is not derived; return empty set.
        return new Set<string>();
    }
}
