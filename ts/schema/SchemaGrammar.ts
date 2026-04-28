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
import { IdentityConstraint, SchemaElementDecl } from './SchemaElementDecl.js';
import { SchemaFacets, SchemaTypeValidator } from './SchemaTypeValidator.js';
import { SchemaValidationContext } from './SchemaValidationContext.js';

const BUILTIN_TYPE_HIERARCHY: Map<string, string> = new Map<string, string>([
    ['anySimpleType', 'anyType'],
    ['anyAtomicType', 'anySimpleType'],
    ['string', 'anyAtomicType'],
    ['normalizedString', 'string'],
    ['token', 'normalizedString'],
    ['language', 'token'],
    ['NMTOKEN', 'token'],
    ['Name', 'token'],
    ['NCName', 'Name'],
    ['ID', 'NCName'],
    ['IDREF', 'NCName'],
    ['ENTITY', 'NCName'],
    ['NMTOKENS', 'anySimpleType'],
    ['IDREFS', 'anySimpleType'],
    ['ENTITIES', 'anySimpleType'],
    ['decimal', 'anyAtomicType'],
    ['integer', 'decimal'],
    ['long', 'integer'],
    ['int', 'long'],
    ['short', 'int'],
    ['byte', 'short'],
    ['nonNegativeInteger', 'integer'],
    ['positiveInteger', 'nonNegativeInteger'],
    ['unsignedLong', 'nonNegativeInteger'],
    ['unsignedInt', 'unsignedLong'],
    ['unsignedShort', 'unsignedInt'],
    ['unsignedByte', 'unsignedShort'],
    ['nonPositiveInteger', 'integer'],
    ['negativeInteger', 'nonPositiveInteger'],
    ['float', 'anyAtomicType'],
    ['double', 'anyAtomicType'],
    ['boolean', 'anyAtomicType'],
    ['duration', 'anyAtomicType'],
    ['dayTimeDuration', 'duration'],
    ['yearMonthDuration', 'duration'],
    ['dateTime', 'anyAtomicType'],
    ['dateTimeStamp', 'dateTime'],
    ['date', 'anyAtomicType'],
    ['time', 'anyAtomicType'],
    ['gYearMonth', 'anyAtomicType'],
    ['gYear', 'anyAtomicType'],
    ['gMonthDay', 'anyAtomicType'],
    ['gDay', 'anyAtomicType'],
    ['gMonth', 'anyAtomicType'],
    ['hexBinary', 'anyAtomicType'],
    ['base64Binary', 'anyAtomicType'],
    ['anyURI', 'anyAtomicType'],
    ['QName', 'anyAtomicType'],
    ['NOTATION', 'anyAtomicType'],
]);

interface PendingTupleEntry {
    tuple: Array<string | undefined>;
    depth: number;
    overflow: boolean;
    nil: boolean;
}

interface IdentityConstraintScope {
    constraint: IdentityConstraint;
    rootDepth: number;
    selectorAlternatives: Array<{ segments: string[], descendant: boolean }>;
    pendingStack: PendingTupleEntry[];
    lastCommittedTuple: Array<string | undefined> | undefined;
    lastCommittedDepth: number;
    tuples: Array<Array<string | undefined>>;
}

export class SchemaGrammar implements Grammar {

    private elementDecls: Map<string, SchemaElementDecl>;
    private complexTypeDecls: Map<string, SchemaElementDecl>;
    private simpleTypeDecls: Map<string, SchemaElementDecl>;
    private targetNamespaces: Set<string>;
    private namespaceDeclarations: Map<string, string>;
    private globalAttributeDecls: Map<string, SchemaAttributeDecl>;
    private importedGrammars: Map<string, SchemaGrammar>;
    private typeHierarchy: Map<string, { base: string, method: string }>;
    private xsiTypeByDepth: Map<number, string>;
    private depth: number;
    private wildcardSkipDepth: number;
    private wildcardParentDecls: Map<number, SchemaElementDecl>;
    private nilDepths: Set<number>;
    private activeScopes: IdentityConstraintScope[];
    private completedKeys: Map<string, Array<Array<string | undefined>>>;
    private elementPath: string[];
    private documentIds: Set<string>;
    private documentIdrefs: Set<string>;

    constructor() {
        this.elementDecls = new Map<string, SchemaElementDecl>();
        this.complexTypeDecls = new Map<string, SchemaElementDecl>();
        this.simpleTypeDecls = new Map<string, SchemaElementDecl>();
        this.targetNamespaces = new Set<string>();
        this.namespaceDeclarations = new Map<string, string>();
        this.globalAttributeDecls = new Map<string, SchemaAttributeDecl>();
        this.importedGrammars = new Map<string, SchemaGrammar>();
        this.typeHierarchy = new Map<string, { base: string, method: string }>();
        this.xsiTypeByDepth = new Map<number, string>();
        this.depth = 0;
        this.wildcardSkipDepth = -1;
        this.wildcardParentDecls = new Map<number, SchemaElementDecl>();
        this.nilDepths = new Set<number>();
        this.activeScopes = [];
        this.completedKeys = new Map<string, Array<Array<string | undefined>>>();
        this.elementPath = [];
        this.documentIds = new Set<string>();
        this.documentIdrefs = new Set<string>();
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

    addSimpleTypeDecl(typeName: string, decl: SchemaElementDecl): void {
        this.simpleTypeDecls.set(typeName, decl);
    }

    addTypeHierarchyEntry(typeName: string, baseTypeName: string, method: string): void {
        this.typeHierarchy.set(typeName, { base: baseTypeName, method: method });
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
        for (const [typeName, decl] of other.simpleTypeDecls) {
            if (!this.simpleTypeDecls.has(typeName)) {
                this.simpleTypeDecls.set(typeName, decl);
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

    getElementTextDefault(element: string): string | undefined {
        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(element);
        if (decl === undefined) {
            return undefined;
        }
        return decl.getFixedValue() ?? decl.getDefaultValue();
    }

    validateElement(element: string, namespace: string, children: string[], text: string): ValidationResult {
        if (this.wildcardSkipDepth !== -1) {
            if (this.depth === this.wildcardSkipDepth) {
                this.wildcardSkipDepth = -1;
                this.elementPath.pop();
            }
            this.wildcardParentDecls.delete(this.depth);
            this.depth--;
            return ValidationResult.success();
        }
        this.wildcardParentDecls.delete(this.depth);
        if (this.nilDepths.delete(this.depth)) {
            if (children.length > 0 || text.trim().length > 0) {
                this.elementPath.pop();
                this.depth--;
                return ValidationResult.error(
                    'Element "' + element + '" has xsi:nil="true" but must be empty'
                );
            }
            this.elementPath.pop();
            this.depth--;
            return ValidationResult.success();
        }
        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(element);
        if (!decl) {
            this.elementPath.pop();
            this.depth--;
            return ValidationResult.error('Element "' + element + '" is not declared in the schema');
        }
        if (decl.isAbstractElement()) {
            this.elementPath.pop();
            this.depth--;
            return ValidationResult.error(
                'Element "' + element + '" is declared abstract and cannot appear directly in an instance'
            );
        }
        const nsMap: Map<string, string> = this.importedGrammars.get(namespace)?.getNamespaceDeclarations() ?? this.namespaceDeclarations;
        const xsiTypeName: string | undefined = this.xsiTypeByDepth.get(this.depth);
        this.xsiTypeByDepth.delete(this.depth);
        const effectiveDecl: SchemaElementDecl = xsiTypeName !== undefined
            ? (this.complexTypeDecls.get(xsiTypeName) ?? decl)
            : decl;
        const contentResult: ValidationResult = effectiveDecl.getContentModel().validateChildren(element, children, nsMap);
        if (!contentResult.isValid) {
            return contentResult;
        }
        const elementDefaultValue: string | undefined = decl.getDefaultValue();
        const fixedValue: string | undefined = decl.getFixedValue();
        const effectiveText: string = text.trim() === '' ? (fixedValue ?? elementDefaultValue ?? text) : text;
        let textError: string | undefined = undefined;
        if (fixedValue !== undefined && text.trim() !== '') {
            const normalizedText: string = text.replaceAll(/[\t\n\r ]+/g, ' ').trim();
            if (!this.fixedValueMatches(normalizedText, fixedValue, decl, nsMap)) {
                textError = 'Element "' + element + '" has a fixed value "' + fixedValue + '" but got "' + normalizedText + '"';
            }
        }
        if (fixedValue !== undefined && children.length > 0) {
            textError = 'Element "' + element + '" has a fixed value "' + fixedValue + '" but contains element children';
        }
        if (textError === undefined) {
            const simpleType: string | undefined = effectiveDecl.getSimpleType();
            if (simpleType !== undefined) {
                const normalizedText: string = effectiveText.replaceAll(/[\t\n\r ]+/g, ' ').trim();
                if (!SchemaTypeValidator.validate(normalizedText, simpleType, nsMap)) {
                    textError = 'Invalid text content "' + effectiveText + '" for element "' + element + '": expected type ' + simpleType;
                } else if (effectiveDecl.hasTextFacets() && !effectiveDecl.validateText(effectiveText)) {
                    textError = 'Text content "' + effectiveText + '" of element "' + element + '" violates facet constraints';
                } else {
                    const simTypeLocal: string = this.localName(simpleType);
                    if ((simTypeLocal === 'ID' || this.isTypeDerivedFrom(simTypeLocal, 'ID')) && normalizedText.length > 0) {
                        if (this.documentIds.has(normalizedText)) {
                            textError = 'Duplicate xs:ID value "' + normalizedText + '" in element "' + element + '"';
                        } else {
                            this.documentIds.add(normalizedText);
                        }
                    }
                }
            } else {
                const unionAlternatives: Array<{ facets: SchemaFacets, baseType: string }> | undefined = effectiveDecl.getUnionAlternatives();
                const unionMemberTypes: string[] | undefined = effectiveDecl.getUnionMemberTypes();
                if (unionAlternatives !== undefined && unionAlternatives.length > 0) {
                    const normalizedText: string = effectiveText.replaceAll(/[\t\n\r ]+/g, ' ').trim();
                    let valid: boolean = false;
                    for (const alt of unionAlternatives) {
                        if (SchemaTypeValidator.validate(normalizedText, alt.baseType, nsMap) && SchemaTypeValidator.validateFacets(normalizedText, alt.facets, alt.baseType)) {
                            valid = true;
                            break;
                        }
                    }
                    if (!valid) {
                        textError = 'Invalid text content "' + effectiveText + '" for element "' + element + '": does not match any union member type';
                    }
                } else if (unionMemberTypes !== undefined && unionMemberTypes.length > 0) {
                    const normalizedText: string = effectiveText.replaceAll(/[\t\n\r ]+/g, ' ').trim();
                    let valid: boolean = false;
                    for (const memberType of unionMemberTypes) {
                        if (this.validateTokenForType(normalizedText, memberType, nsMap)) {
                            valid = true;
                            break;
                        }
                    }
                    if (!valid) {
                        textError = 'Invalid text content "' + effectiveText + '" for element "' + element + '": does not match any union member type';
                    }
                } else {
                    const listItemType: string | undefined = effectiveDecl.getListItemType();
                    if (listItemType !== undefined) {
                        const normalizedText: string = effectiveText.replaceAll(/[\t\n\r ]+/g, ' ').trim();
                        const tokens: string[] = normalizedText.length === 0 ? [] : normalizedText.split(/\s+/);
                        for (const token of tokens) {
                            if (!this.validateTokenForType(token, listItemType, nsMap)) {
                                textError = 'Invalid list item "' + token + '" for element "' + element + '": expected type ' + listItemType;
                                break;
                            }
                        }
                    } else if (effectiveDecl.getContentModel().getType() === SchemaContentModelType.ELEMENT
                        || effectiveDecl.getContentModel().getType() === SchemaContentModelType.EMPTY) {
                        if (effectiveText.trim().length > 0) {
                            textError = 'Element "' + element + '" has element-only content but contains text: "' + effectiveText + '"';
                        }
                    }
                }
            }
        }
        if (textError !== undefined) {
            this.elementPath.pop();
            this.depth--;
            return ValidationResult.error(textError);
        }
        if (this.activeScopes.length > 0) {
            const elemLocal: string = this.localName(element);
            for (const scope of this.activeScopes) {
                if (scope.pendingStack.length > 0) {
                    const top: PendingTupleEntry = scope.pendingStack[scope.pendingStack.length - 1];
                    if (top.depth === this.depth) {
                        this.collectTextFieldsFromElement(scope, text, elemLocal);
                        scope.pendingStack.pop();
                        if (!top.nil && !top.overflow) {
                            const idError: string | undefined = this.commitTuple(scope, top.tuple, element);
                            if (idError !== undefined) {
                                this.elementPath.pop();
                                this.depth--;
                                return ValidationResult.error(idError);
                            }
                        }
                    } else if (top.depth < this.depth) {
                        this.collectDescendantFieldsFromElement(scope, text, elemLocal);
                    }
                }
            }
            for (let i: number = this.activeScopes.length - 1; i >= 0; i--) {
                if (this.activeScopes[i].rootDepth === this.depth) {
                    const scope: IdentityConstraintScope = this.activeScopes[i];
                    if (scope.constraint.kind === 'keyref') {
                        const krError: string | undefined = this.validateKeyrefScope(scope);
                        if (krError !== undefined) {
                            this.activeScopes.splice(i, 1);
                            this.elementPath.pop();
                            this.depth--;
                            return ValidationResult.error(krError);
                        }
                    } else {
                        this.completedKeys.set(scope.constraint.name, scope.tuples);
                    }
                    this.activeScopes.splice(i, 1);
                }
            }
        }
        if (this.depth === 1) {
            for (const ref of this.documentIdrefs) {
                if (!this.documentIds.has(ref)) {
                    this.elementPath.pop();
                    this.depth--;
                    return ValidationResult.error('xs:IDREF value "' + ref + '" does not reference any xs:ID in the document');
                }
            }
        }
        this.elementPath.pop();
        this.depth--;
        return contentResult;
    }

    validateAttributes(element: string, attributes: Map<string, string>): ValidationResult {
        this.depth++;
        if (this.depth === 1) {
            this.documentIds = new Set<string>();
            this.documentIdrefs = new Set<string>();
            this.activeScopes = [];
            this.completedKeys = new Map<string, Array<Array<string | undefined>>>();
            this.elementPath = [];
            this.wildcardSkipDepth = -1;
            this.wildcardParentDecls = new Map<number, SchemaElementDecl>();
        }
        if (this.wildcardSkipDepth !== -1 && this.depth > this.wildcardSkipDepth) {
            return ValidationResult.success();
        }
        this.elementPath.push(this.localName(element));
        const context: SchemaValidationContext = new SchemaValidationContext();

        // Detect xsi:nil and xsi:type
        for (const [attrName, attrValue] of attributes) {
            let isNilAttr: boolean = attrName === 'xsi:nil';
            if (!isNilAttr && attrName.endsWith(':nil') && attrName.indexOf(':') !== -1) {
                const nilCheckPrefix: string = attrName.substring(0, attrName.indexOf(':'));
                const nilCheckNs: string | undefined = this.resolvePrefix(nilCheckPrefix);
                if (nilCheckNs === 'http://www.w3.org/2001/XMLSchema-instance') {
                    isNilAttr = true;
                }
            }
            if (isNilAttr) {
                context.xsiNilPresent = true;
                if (attrValue === 'true' || attrValue === '1') {
                    context.xsiNil = true;
                }
            }
            if (attrName === 'xsi:type') {
                context.xsiType = this.localName(attrValue);
            } else if (attrName.endsWith(':type') && attrName.indexOf(':') !== -1) {
                const prefix: string = attrName.substring(0, attrName.indexOf(':'));
                const ns: string | undefined = this.resolvePrefix(prefix);
                if (ns === 'http://www.w3.org/2001/XMLSchema-instance') {
                    context.xsiType = this.localName(attrValue);
                }
            }
        }

        // Build instance namespace scope for this element
        for (const [attrName, attrValue] of attributes) {
            if (attrName === 'xmlns') {
                context.instanceNamespaces.set('', attrValue);
            } else if (attrName.startsWith('xmlns:')) {
                context.instanceNamespaces.set(attrName.substring(6), attrValue);
            }
        }

        // Lookup element declaration
        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(element);
        if (!decl) {
            const parentDecl: SchemaElementDecl | undefined = this.wildcardParentDecls.get(this.depth - 1);
            if (parentDecl !== undefined) {
                const wc: 'strict' | 'lax' | 'skip' | undefined = parentDecl.getContentModel().findCoveringWildcard(element, context.instanceNamespaces);
                if (wc === 'skip' || wc === 'lax') {
                    this.wildcardSkipDepth = this.depth;
                    return ValidationResult.success();
                }
            }
            context.wildcardMode = undefined;
            return ValidationResult.error('Element "' + element + '" is not declared in the schema');
        }
        context.wildcardMode = 'normal';
        const parentWc: 'strict' | 'lax' | 'skip' | undefined = this.wildcardParentDecls.get(this.depth - 1)?.getContentModel().findCoveringWildcard(element, context.instanceNamespaces);
        if (parentWc === 'skip') {
            this.wildcardSkipDepth = this.depth;
            return ValidationResult.success();
        }

        // Enforce elementFormDefault / form
        const colonIdx: number = element.indexOf(':');
        const elemPrefix: string = colonIdx !== -1 ? element.substring(0, colonIdx) : '';
        const resolvedElemNs: string | undefined = context.instanceNamespaces.get(elemPrefix) ?? this.resolvePrefix(elemPrefix);
        if (context.xsiType !== undefined) {
            this.xsiTypeByDepth.set(this.depth, context.xsiType);
        }
        if (decl.isQualified()) {
            const declNs: string | undefined = decl.getNamespace();
            if (declNs !== undefined && resolvedElemNs !== declNs) {
                return ValidationResult.error(
                    'Element "' + element + '" must be namespace-qualified with namespace "' + declNs + '"'
                );
            }
        } else {
            if (resolvedElemNs !== undefined && resolvedElemNs !== '') {
                return ValidationResult.error(
                    'Element "' + element + '" must not be namespace-qualified (elementFormDefault is unqualified)'
                );
            }
        }
        // xsi:nil allowed only if nillable
        if (context.xsiNilPresent && !decl.isNillable()) {
            return ValidationResult.error(
                'Element "' + element + '" is not nillable but xsi:nil was specified'
            );
        }
        if (context.xsiNil) {
            this.nilDepths.add(this.depth);
        }
        // xsi:type checks
        if (context.xsiType !== undefined) {
            const xsiTypeDecl: SchemaElementDecl | undefined = this.complexTypeDecls.get(context.xsiType);
            if (xsiTypeDecl !== undefined && xsiTypeDecl.isAbstractElement()) {
                return ValidationResult.error(
                    'xsi:type "' + context.xsiType + '" is abstract and cannot be used for element instantiation'
                );
            }
            const declaredTypeName: string | undefined = decl.getDeclaredTypeName();
            if (declaredTypeName !== undefined) {
                if (!this.isTypeDerivedFrom(context.xsiType, declaredTypeName)) {
                    return ValidationResult.error(
                        'xsi:type "' + context.xsiType + '" is not derived from the declared type "' +
                        declaredTypeName + '" of element "' + element + '"'
                    );
                }
                const finalBlockedMethod: string | undefined = this.getFinalBlockedMethod(context.xsiType, declaredTypeName);
                if (finalBlockedMethod !== undefined) {
                    return ValidationResult.error(
                        'xsi:type "' + context.xsiType + '" is not validly derived: type "' +
                        declaredTypeName + '" has final="' + finalBlockedMethod + '"'
                    );
                }
            }
        }

        // Use substituted type's attribute declarations if xsi:type present
        const substitutedDecl: SchemaElementDecl | undefined = context.xsiType !== undefined
            ? this.complexTypeDecls.get(context.xsiType)
            : undefined;
        const baseAttributes: Map<string, SchemaAttributeDecl> = decl.getAttributeDecls();
        const declaredAttributes: Map<string, SchemaAttributeDecl> = substitutedDecl !== undefined
            ? substitutedDecl.getAttributeDecls()
            : baseAttributes;

        // Check provided attributes
        for (const [attrName, attrValue] of attributes) {
            if (attrName === 'xmlns' || attrName.startsWith('xmlns:')) {
                continue;
            }
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
                const attrTypeLocal: string = this.localName(attrDecl.getType());
                if (attrTypeLocal === 'ID' || this.isTypeDerivedFrom(attrTypeLocal, 'ID')) {
                    if (this.documentIds.has(attrValue)) {
                        return ValidationResult.error(
                            'Duplicate xs:ID value "' + attrValue + '" on attribute "' + attrName +
                            '" of element "' + element + '"'
                        );
                    }
                    this.documentIds.add(attrValue);
                } else if (attrTypeLocal === 'IDREF' || this.isTypeDerivedFrom(attrTypeLocal, 'IDREF')) {
                    this.documentIdrefs.add(attrValue);
                } else if (attrTypeLocal === 'IDREFS' || this.isTypeDerivedFrom(attrTypeLocal, 'IDREFS')) {
                    for (const token of attrValue.trim().split(/\s+/)) {
                        if (token.length > 0) {
                            this.documentIdrefs.add(token);
                        }
                    }
                }
                continue;
            }
            if (decl.allowsAnyAttribute()) {
                const anyNs: string = decl.getAnyAttributeNamespace();
                const anyPc: string = decl.getAnyAttributeProcessContents();
                const anyOwnerNs: string | undefined = decl.getAnyAttributeOwnerNs();
                const anyExcludedNs: string[] | undefined = decl.getAnyAttributeExcludedNamespaces();
                if (this.anyAttributeCovers(anyNs, anyPc, anyOwnerNs, anyExcludedNs, attrName, attrValue, element)) {
                    continue;
                }
                return ValidationResult.error(
                    'Attribute "' + attrName + '" is not permitted by the anyAttribute wildcard on element "' + element + '"'
                );
            }
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
            if (decl.getContentModel().getType() === SchemaContentModelType.ANY) {
                continue;
            }
            return ValidationResult.error(
                'Attribute "' + attrName + '" is not declared for element "' + element + '"'
            );
        }

        // Check required attributes
        for (const [, attrDecl] of declaredAttributes) {
            if (attrDecl.getUse() !== AttributeUse.REQUIRED) {
                continue;
            }
            const declaredName: string = attrDecl.getName();
            if (attributes.has(declaredName)) {
                continue;
            }
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

        if (this.activeScopes.length > 0) {
            const elemLocal: string = this.localName(element);
            for (const scope of this.activeScopes) {
                if (this.selectorMatchesAtDepth(scope, elemLocal)) {
                    scope.pendingStack.push({
                        tuple: new Array<string | undefined>(scope.constraint.fields.length).fill(undefined),
                        depth: this.depth,
                        overflow: false,
                        nil: context.xsiNil
                    });
                    this.collectAttributeFields(scope, attributes, elemLocal, context);
                }
            }
        }

        const identityConstraints: IdentityConstraint[] | undefined = decl.getIdentityConstraints();
        if (identityConstraints !== undefined) {
            for (const constraint of identityConstraints) {
                const selectorAlternatives: Array<{ segments: string[], descendant: boolean }> = this.parseSelectorSegments(constraint.selector);
                this.activeScopes.push({
                    constraint,
                    rootDepth: this.depth,
                    selectorAlternatives,
                    pendingStack: [],
                    lastCommittedTuple: undefined,
                    lastCommittedDepth: -1,
                    tuples: [],
                });
            }
        }

        if (decl.getContentModel().hasAnyWildcard()) {
            this.wildcardParentDecls.set(this.depth, decl);
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

    private anyAttributeCovers(anyNs: string, processContents: string, ownerNs: string | undefined, excludedNs: string[] | undefined, attrName: string, attrValue: string, elementName: string): boolean {
        if (anyNs === '##empty') {
            return false;
        }
        const colonIndex: number = attrName.indexOf(':');
        const attrPrefix: string | undefined = colonIndex !== -1 ? attrName.substring(0, colonIndex) : undefined;
        const attrLocalName: string = colonIndex !== -1 ? attrName.substring(colonIndex + 1) : attrName;
        const attrNs: string | undefined = attrPrefix ? this.resolvePrefix(attrPrefix) : undefined;

        // Check if the attribute's namespace is covered by the wildcard constraint.
        let covered: boolean = false;
        if (anyNs === '##any') {
            covered = true;
        } else if (anyNs === '##local') {
            covered = attrPrefix === undefined;
        } else if (anyNs === '##other') {
            // Per XSD spec §3.10.1: ##other means any non-absent namespace that is
            // not the target namespace of the schema owning the anyAttribute.
            if (excludedNs !== undefined && excludedNs.length > 0) {
                covered = attrNs !== undefined && !excludedNs.includes(attrNs);
            } else {
                covered = attrNs !== undefined && (ownerNs === undefined || attrNs !== ownerNs);
            }
        } else {
            // Space-separated list of URIs, ##local, ##targetNamespace.
            const tokens: string[] = anyNs.split(/\s+/);
            for (const token of tokens) {
                if (token === '##local' && attrPrefix === undefined) {
                    covered = true;
                    break;
                }
                if (token === '##targetNamespace') {
                    if (attrNs !== undefined && attrNs === ownerNs) {
                        covered = true;
                        break;
                    }
                }
                if (token === attrNs) {
                    covered = true;
                    break;
                }
            }
        }

        if (!covered) {
            return false;
        }

        // Enforce processContents.
        if (processContents === 'skip') {
            return true;
        }
        // For 'strict' or 'lax', look up the attribute declaration in the imported grammar.
        if (attrNs !== undefined) {
            const importedGrammar: SchemaGrammar | undefined = this.importedGrammars.get(attrNs);
            if (importedGrammar) {
                const globalDecl: SchemaAttributeDecl | undefined = importedGrammar.globalAttributeDecls.get(attrLocalName);
                if (globalDecl) {
                    // Declaration found — validate the value.
                    return globalDecl.isValid(attrValue);
                }
            }
            // No imported grammar or no declaration found.
            if (processContents === 'strict') {
                return false; // strict requires a declaration
            }
            return true; // lax: silently accept if no declaration
        }
        // Unqualified attribute with no namespace.
        const globalDecl: SchemaAttributeDecl | undefined = this.globalAttributeDecls.get(attrLocalName);
        if (globalDecl) {
            return globalDecl.isValid(attrValue);
        }
        if (processContents === 'strict') {
            return false; // strict requires a declaration; none found for unqualified attr
        }
        return true; // lax: accept
    }

    private resolvePrefix(prefix: string): string | undefined {
        // 'xml' is always bound to this URI per the XML Namespaces specification.
        if (prefix === 'xml') {
            return 'http://www.w3.org/XML/1998/namespace';
        }
        return this.namespaceDeclarations.get(prefix);
    }

    private fixedValueMatches(instanceText: string, fixedValue: string, textDecl: SchemaElementDecl, instanceNs?: Map<string, string>): boolean {
        const simpleType: string | undefined = textDecl.getSimpleType();
        if (simpleType !== undefined) {
            return SchemaTypeValidator.canonicalize(instanceText, simpleType, instanceNs) === SchemaTypeValidator.canonicalize(fixedValue, simpleType, instanceNs);
        }
        const unionAlternatives: Array<{ facets: SchemaFacets, baseType: string }> | undefined = textDecl.getUnionAlternatives();
        if (unionAlternatives !== undefined && unionAlternatives.length > 0) {
            for (const alt of unionAlternatives) {
                if (SchemaTypeValidator.validate(instanceText, alt.baseType, instanceNs) && SchemaTypeValidator.validateFacets(instanceText, alt.facets, alt.baseType)) {
                    const normalizedFixed: string = SchemaTypeValidator.canonicalize(fixedValue, alt.baseType, instanceNs);
                    if (SchemaTypeValidator.validate(normalizedFixed, alt.baseType, instanceNs) && SchemaTypeValidator.validateFacets(normalizedFixed, alt.facets, alt.baseType)) {
                        return SchemaTypeValidator.canonicalize(instanceText, alt.baseType, instanceNs) === normalizedFixed;
                    }
                    return false;
                }
            }
            return false;
        }
        const unionMemberTypes: string[] | undefined = textDecl.getUnionMemberTypes();
        if (unionMemberTypes !== undefined && unionMemberTypes.length > 0) {
            for (const memberType of unionMemberTypes) {
                if (this.validateTokenForType(instanceText, memberType, instanceNs)) {
                    const normalizedFixed: string = SchemaTypeValidator.canonicalize(fixedValue, memberType, instanceNs);
                    if (this.validateTokenForType(normalizedFixed, memberType, instanceNs)) {
                        return SchemaTypeValidator.canonicalize(instanceText, memberType, instanceNs) === normalizedFixed;
                    }
                    return false;
                }
            }
            return false;
        }
        return instanceText === fixedValue;
    }

    private buildElementKey(name: string, namespace: string | undefined): string {
        if (namespace) {
            return namespace + '|' + name;
        }
        return name;
    }

    private validateTokenForType(token: string, typeName: string, instanceNs?: Map<string, string>): boolean {
        const localTypeName: string = this.localName(typeName);
        const typeDecl: SchemaElementDecl | undefined = this.simpleTypeDecls.get(localTypeName);
        if (typeDecl !== undefined) {
            const baseType: string | undefined = typeDecl.getSimpleType();
            if (baseType !== undefined) {
                if (!SchemaTypeValidator.validate(token, baseType, instanceNs)) {
                    return false;
                }
                if (typeDecl.hasTextFacets() && !typeDecl.validateText(token)) {
                    return false;
                }
                return true;
            }
        }
        return SchemaTypeValidator.validate(token, typeName, instanceNs);
    }

    private localName(qname: string): string {
        const colonIndex: number = qname.indexOf(':');
        return colonIndex !== -1 ? qname.substring(colonIndex + 1) : qname;
    }

    private lookupElementDecl(elementName: string, instanceNs?: Map<string, string>): SchemaElementDecl | undefined {
        // 1. Exact key match.
        let decl: SchemaElementDecl | undefined = this.elementDecls.get(elementName);
        if (decl) {
            return decl;
        }

        // 2. Strip namespace prefix; try local name only.
        // A prefixed element cannot match an unqualified local declaration, so only return here
        // when the found decl is qualified or the element itself carries no prefix.
        const local: string = this.localName(elementName);
        if (local !== elementName) {
            decl = this.elementDecls.get(local);
            if (decl && decl.isQualified()) {
                return decl;
            }
            decl = undefined;
        }

        // 2b. Resolve the element's actual namespace from namespaceDeclarations and try that key first.
        // Also consult the provided instanceNs map for prefixes declared in the instance document.
        const colonIndex: number = elementName.indexOf(':');
        const prefix: string = colonIndex !== -1 ? elementName.substring(0, colonIndex) : '';
        const resolvedNs: string | undefined = this.resolvePrefix(prefix) ?? instanceNs?.get(prefix);
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

        // 4. Linear scan matching local-name portion of any stored key,
        //    but only when the resolved namespace matches the stored key's namespace (or both are absent).
        for (const [key, value] of this.elementDecls) {
            const pipeIndex: number = key.indexOf('|');
            const keyLocal: string = pipeIndex !== -1 ? key.substring(pipeIndex + 1) : key;
            if (keyLocal !== local) {
                continue;
            }
            const keyNs: string | undefined = pipeIndex !== -1 ? key.substring(0, pipeIndex) : undefined;
            if (keyNs === resolvedNs) {
                return value;
            }
        }

        return undefined;
    }

    private getFinalBlockedMethod(candidate: string, required: string): string | undefined {
        const requiredDecl: SchemaElementDecl | undefined =
            this.complexTypeDecls.get(required) ?? this.simpleTypeDecls.get(required);
        if (requiredDecl === undefined) {
            return undefined;
        }
        const finalSet: Set<string> = requiredDecl.getFinalConstraints();
        if (finalSet.size === 0) {
            return undefined;
        }
        let current: string | undefined = candidate;
        const visited: Set<string> = new Set<string>();
        while (current !== undefined && current !== required) {
            if (visited.has(current)) {
                break;
            }
            visited.add(current);
            const entry: { base: string, method: string } | undefined = this.typeHierarchy.get(current);
            if (!entry) {
                break;
            }
            if (finalSet.has('#all') || finalSet.has(entry.method)) {
                return entry.method;
            }
            current = entry.base;
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
            const entry: { base: string, method: string } | undefined = this.typeHierarchy.get(current);
            current = entry ? entry.base : BUILTIN_TYPE_HIERARCHY.get(current);
        }
        return false;
    }

    private parseSelectorSegments(selector: string): Array<{ segments: string[], descendant: boolean }> {
        return selector.split('|').map((alt: string) => {
            const trimmed: string = alt.trim();
            const descendant: boolean = trimmed.includes('//');
            const relative: string = trimmed.startsWith('./') ? trimmed.substring(2) : trimmed;
            if (relative === '.' || relative === '') {
                return { segments: [], descendant };
            }
            const steps: string[] = relative.split('/');
            const segments: string[] = [];
            for (const step of steps) {
                const s: string = step.trim();
                if (s === '' || s === '.') {
                    continue;
                }
                if (s === '*') {
                    segments.push('*');
                } else {
                    const step: string = s.startsWith('child::') ? s.substring(7) : s;
                    const colonIdx: number = step.indexOf(':');
                    segments.push(colonIdx !== -1 ? step.substring(colonIdx + 1) : step);
                }
            }
            return { segments, descendant };
        });
    }

    private parseFieldPath(field: string): { isAttribute: boolean, localName: string, descendant: boolean } {
        const trimmed: string = field.trim();
        const descendant: boolean = trimmed.startsWith('.//');
        const withoutSelf: string = descendant ? trimmed.substring(3) : (trimmed.startsWith('./') ? trimmed.substring(2) : (trimmed === '.' ? '' : trimmed));
        const withoutAxis: string = withoutSelf.startsWith('child::') ? withoutSelf.substring(7) : withoutSelf;
        if (withoutAxis.startsWith('@') || withoutAxis.startsWith('attribute::')) {
            const atName: string = withoutAxis.startsWith('attribute::') ? withoutAxis.substring(11) : withoutAxis.substring(1);
            const colonIdx: number = atName.indexOf(':');
            return { isAttribute: true, localName: colonIdx !== -1 ? atName.substring(colonIdx + 1) : atName, descendant };
        }
        const colonIdx: number = withoutAxis.indexOf(':');
        return { isAttribute: false, localName: colonIdx !== -1 ? withoutAxis.substring(colonIdx + 1) : withoutAxis, descendant };
    }

    private parseFieldAlternatives(field: string): Array<{ isAttribute: boolean, localName: string, descendant: boolean }> {
        return field.split('|').map((alt: string) => this.parseFieldPath(alt));
    }

    private selectorMatchesAtDepth(scope: IdentityConstraintScope, elemLocal: string): boolean {
        const relativeDepth: number = this.depth - scope.rootDepth;
        for (const alt of scope.selectorAlternatives) {
            if (alt.segments.length === 0) {
                continue;
            }
            const lastSeg: string = alt.segments[alt.segments.length - 1];
            const nameMatches: boolean = lastSeg === '*' || lastSeg === elemLocal;
            if (!nameMatches) {
                continue;
            }
            if (alt.descendant) {
                if (relativeDepth >= 1) {
                    return true;
                }
            } else {
                if (relativeDepth === alt.segments.length) {
                    let intermediateMatch: boolean = true;
                    for (let si: number = 0; si < alt.segments.length - 1; si++) {
                        const seg: string = alt.segments[si];
                        const pathName: string | undefined = this.elementPath[scope.rootDepth + si];
                        if (seg !== '*' && seg !== pathName) {
                            intermediateMatch = false;
                            break;
                        }
                    }
                    if (intermediateMatch) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private collectTextFieldsFromElement(scope: IdentityConstraintScope, text: string, elementLocalName: string): void {
        const pendingTop: PendingTupleEntry = scope.pendingStack[scope.pendingStack.length - 1];
        const normalized: string = text.replaceAll(/[\t\n\r ]+/g, ' ').trim();
        for (let i: number = 0; i < scope.constraint.fields.length; i++) {
            if (pendingTop.tuple[i] !== undefined) {
                continue;
            }
            const alternatives: Array<{ isAttribute: boolean, localName: string, descendant: boolean }> = this.parseFieldAlternatives(scope.constraint.fields[i]);
            for (const alt of alternatives) {
                if (alt.isAttribute) {
                    continue;
                }
                if (alt.localName === '' || alt.localName === elementLocalName || alt.localName === '*') {
                    pendingTop.tuple[i] = 'string\x02' + normalized;
                    break;
                }
            }
        }
    }

    private collectDescendantFieldsFromElement(scope: IdentityConstraintScope, text: string, elementLocalName: string): void {
        const pendingTop: PendingTupleEntry = scope.pendingStack[scope.pendingStack.length - 1];
        const normalized: string = text.replaceAll(/[\t\n\r ]+/g, ' ').trim();
        for (let i: number = 0; i < scope.constraint.fields.length; i++) {
            if (pendingTop.tuple[i] !== undefined) {
                continue;
            }
            const alternatives: Array<{ isAttribute: boolean, localName: string, descendant: boolean }> = this.parseFieldAlternatives(scope.constraint.fields[i]);
            for (const alt of alternatives) {
                if (alt.isAttribute || !alt.descendant) {
                    continue;
                }
                if (alt.localName === '' || alt.localName === elementLocalName || alt.localName === '*') {
                    pendingTop.tuple[i] = 'string\x02' + normalized;
                    break;
                }
            }
        }
    }

    private commitTuple(scope: IdentityConstraintScope, tuple: Array<string | undefined>, element: string): string | undefined {
        const hasUndefined: boolean = tuple.some(v => v === undefined);
        if (scope.constraint.kind === 'key') {
            if (hasUndefined) {
                return 'Key constraint "' + scope.constraint.name + '" requires all fields to be present on element "' + element + '"';
            }
            const key: string = this.tupleKey(tuple);
            for (const existing of scope.tuples) {
                if (this.tupleKey(existing) === key) {
                    return 'Key constraint "' + scope.constraint.name + '" has a duplicate value on element "' + element + '"';
                }
            }
            scope.tuples.push(tuple);
        } else if (scope.constraint.kind === 'unique') {
            if (!hasUndefined) {
                const key: string = this.tupleKey(tuple);
                for (const existing of scope.tuples) {
                    if (this.tupleKey(existing) === key) {
                        return 'Unique constraint "' + scope.constraint.name + '" has a duplicate value on element "' + element + '"';
                    }
                }
                scope.tuples.push(tuple);
            }
        } else {
            if (!hasUndefined) {
                scope.tuples.push(tuple);
            }
        }
        return undefined;
    }

    private validateKeyrefScope(scope: IdentityConstraintScope): string | undefined {
        const referName: string | undefined = scope.constraint.refer;
        if (referName === undefined) {
            return undefined;
        }
        const refScope: IdentityConstraintScope | undefined = this.activeScopes.find(
            (s: IdentityConstraintScope) => s.constraint.name === referName
        );
        const refTuples: Array<Array<string | undefined>> | undefined =
            refScope !== undefined ? refScope.tuples : this.completedKeys.get(referName);
        if (refTuples === undefined) {
            return undefined;
        }
        for (const tuple of scope.tuples) {
            if (tuple.some(v => v === undefined)) {
                continue;
            }
            const key: string = this.tupleKey(tuple);
            if (!refTuples.some((t: Array<string | undefined>) => this.tupleKey(t) === key)) {
                return 'Keyref constraint "' + scope.constraint.name + '" references a key that does not exist';
            }
        }
        return undefined;
    }

    private collectAttributeFields(scope: IdentityConstraintScope, attributes: Map<string, string>, elementLocalName: string, context: SchemaValidationContext): void {
        if (scope.pendingStack.length === 0) {
            return;
        }
        const pendingTop: PendingTupleEntry = scope.pendingStack[scope.pendingStack.length - 1];
        const attrNs: Map<string, string> = context.instanceNamespaces;
        const declaredDecl: SchemaElementDecl | undefined = this.lookupElementDecl(elementLocalName, attrNs);
        const xsiTypeLocal: string | undefined = context.xsiType;
        const effectiveDecl: SchemaElementDecl | undefined = xsiTypeLocal !== undefined
            ? (this.complexTypeDecls.get(xsiTypeLocal) ?? this.simpleTypeDecls.get(xsiTypeLocal) ?? declaredDecl)
            : declaredDecl;
        for (let i: number = 0; i < scope.constraint.fields.length; i++) {
            const alternatives: Array<{ isAttribute: boolean, localName: string, descendant: boolean }> = this.parseFieldAlternatives(scope.constraint.fields[i]);
            for (const alt of alternatives) {
                if (!alt.isAttribute) {
                    continue;
                }
                for (const [attrName, attrValue] of attributes) {
                    const attrLocal: string = this.localName(attrName);
                    if (attrLocal === alt.localName) {
                        const attrDecl: SchemaAttributeDecl | undefined = effectiveDecl?.getAttributeDecl(attrName) ?? effectiveDecl?.getAttributeDecl(attrLocal);
                        const attrType: string = attrDecl !== undefined ? attrDecl.getType() : 'string';
                        pendingTop.tuple[i] = attrType + '\x02' + SchemaTypeValidator.canonicalize(attrValue, attrType, attrNs);
                        break;
                    }
                }
                if (pendingTop.tuple[i] !== undefined) {
                    break;
                }
            }
        }
    }

    private tupleKey(tuple: Array<string | undefined>): string {
        return tuple.map(v => v === undefined ? '\x00' : v).join('\x01');
    }
}
