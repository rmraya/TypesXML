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
    private xsiTypeStack: Array<string | undefined>;
    private nilStack: Array<boolean>;
    private typeHierarchy: Map<string, { base: string, method: string }>;
    private instanceNsStack: Array<Map<string, string>>;
    private elementPath: string[];
    private activeScopes: IdentityConstraintScope[];
    private completedKeys: Map<string, Array<Array<string | undefined>>>;
    private lastClosedDepth: number;
    private lastPoppedXsiType: string | undefined;
    private lastPoppedNil: boolean;
    private lastPoppedInstanceNs: Map<string, string> | undefined;
    private seenIds: Set<string>;
    private pendingIdrefs: string[];
    private pendingKeyrefChecks: Array<{ constraintName: string; refer: string; tuples: Array<Array<string | undefined>> }>;
    private wildcardModeStack: Array<'normal' | 'lax' | 'skip'>;

    constructor() {
        this.elementDecls = new Map<string, SchemaElementDecl>();
        this.complexTypeDecls = new Map<string, SchemaElementDecl>();
        this.simpleTypeDecls = new Map<string, SchemaElementDecl>();
        this.targetNamespaces = new Set<string>();
        this.namespaceDeclarations = new Map<string, string>();
        this.globalAttributeDecls = new Map<string, SchemaAttributeDecl>();
        this.importedGrammars = new Map<string, SchemaGrammar>();
        this.xsiTypeStack = [];
        this.nilStack = [];
        this.typeHierarchy = new Map<string, { base: string, method: string }>();
        this.instanceNsStack = [];
        this.elementPath = [];
        this.activeScopes = [];
        this.completedKeys = new Map<string, Array<Array<string | undefined>>>();
        this.lastClosedDepth = -1;
        this.lastPoppedXsiType = undefined;
        this.lastPoppedNil = false;
        this.seenIds = new Set<string>();
        this.pendingIdrefs = [];
        this.pendingKeyrefChecks = [];
        this.wildcardModeStack = [];
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

    validateElement(element: string, children: string[], text: string): ValidationResult {
        const xsiType: string | undefined = this.xsiTypeStack.length > 0 ? this.xsiTypeStack.pop() : undefined;
        this.lastPoppedXsiType = xsiType;
        const isNilled: boolean = this.nilStack.length > 0 ? (this.nilStack.pop() ?? false) : false;
        this.lastPoppedNil = isNilled;
        if (this.instanceNsStack.length > 0) {
            this.lastPoppedInstanceNs = this.instanceNsStack.pop();
        } else {
            this.lastPoppedInstanceNs = undefined;
        }
        this.lastClosedDepth = this.elementPath.length - 1;
        const wildcardMode: 'normal' | 'lax' | 'skip' | undefined =
            this.wildcardModeStack.length > 0 ? this.wildcardModeStack.pop() : undefined;
        if (wildcardMode === 'skip') {
            if (this.elementPath.length > 0) {
                this.elementPath.pop();
            }
            return ValidationResult.success();
        }
        if (this.activeScopes.length > 0 && !isNilled) {
            const closingDepth: number = this.lastClosedDepth;
            const idLocalName: string = this.localName(element);
            for (const scope of this.activeScopes) {
                if (scope.pendingStack.length === 0) {
                    continue;
                }
                const top: PendingTupleEntry = scope.pendingStack[scope.pendingStack.length - 1];
                if (!top.nil) {
                    if (closingDepth === top.depth) {
                        this.collectTextFields(scope, idLocalName, text, true, this.lastPoppedInstanceNs, xsiType);
                    } else {
                        const hasDescendantField: boolean = scope.constraint.fields.some(
                            (f: string) => f.split('|').some((alt: string) => alt.trim().startsWith('.//')))
                            ;
                        const depthMatches: boolean = hasDescendantField
                            ? closingDepth > top.depth
                            : closingDepth === top.depth + 1;
                        if (depthMatches) {
                            this.collectTextFields(scope, idLocalName, text, false, this.lastPoppedInstanceNs, xsiType);
                        }
                    }
                }
            }
        }
        const constraintError: string | undefined = this.closeConstraintScopes();
        if (this.elementPath.length > 0) {
            this.elementPath.pop();
        }
        if (wildcardMode === 'lax') {
            return ValidationResult.success();
        }
        const substitutedDecl: SchemaElementDecl | undefined = xsiType !== undefined ? this.complexTypeDecls.get(xsiType) : undefined;

        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(element);
        if (!decl) {
            return ValidationResult.error('Element "' + element + '" is not declared in the schema');
        }
        // Per spec §2.6.2: a nilled element must have no element or text children.
        if (isNilled) {
            if (children.length > 0) {
                return ValidationResult.error(
                    'Element "' + element + '" has xsi:nil="true" but contains child elements'
                );
            }
            if (text.trim().length > 0) {
                return ValidationResult.error(
                    'Element "' + element + '" has xsi:nil="true" but contains text content'
                );
            }
            if (constraintError !== undefined) {
                return ValidationResult.error(constraintError);
            }
            return ValidationResult.success();
        }
        // Per the spec, an abstract element cannot appear directly in an instance.
        if (decl.isAbstractElement() && xsiType === undefined) {
            return ValidationResult.error(
                'Element "' + element + '" is declared abstract and cannot appear directly in an instance'
            );
        }
        const effectiveDecl: SchemaElementDecl = substitutedDecl !== undefined ? substitutedDecl : decl;
        const contentResult: ValidationResult = effectiveDecl.getContentModel().validateChildren(element, children, this.lastPoppedInstanceNs);
        if (!contentResult.isValid) {
            return contentResult;
        }
        if (constraintError !== undefined) {
            return ValidationResult.error(constraintError);
        }
        const xsiTypeDecl: SchemaElementDecl | undefined = xsiType !== undefined
            ? (this.complexTypeDecls.get(xsiType) ?? this.simpleTypeDecls.get(xsiType))
            : undefined;
        const textDecl: SchemaElementDecl = xsiTypeDecl !== undefined ? xsiTypeDecl : decl;
        const instanceNs: Map<string, string> | undefined = this.lastPoppedInstanceNs;
        const elementDefaultValue: string | undefined = textDecl.getDefaultValue();
        const effectiveText: string = text.trim() === '' && elementDefaultValue !== undefined ? elementDefaultValue : text;
        let textError: string | undefined = undefined;
        const fixedValue: string | undefined = textDecl.getFixedValue();
        if (fixedValue !== undefined) {
            const normalizedText: string = text.replace(/[\t\n\r ]+/g, ' ').trim();
            if (normalizedText !== fixedValue) {
                textError = 'Element "' + element + '" has a fixed value "' + fixedValue + '" but got "' + normalizedText + '"';
            }
        }
        if (textError === undefined) {
            const simpleType: string | undefined = textDecl.getSimpleType();
            if (simpleType !== undefined) {
                const normalizedText: string = effectiveText.replace(/[\t\n\r ]+/g, ' ').trim();
                if (!SchemaTypeValidator.validate(normalizedText, simpleType, instanceNs)) {
                    textError = 'Invalid text content "' + effectiveText + '" for element "' + element + '": expected type ' + simpleType;
                } else if (textDecl.hasTextFacets() && !textDecl.validateText(effectiveText)) {
                    textError = 'Text content "' + effectiveText + '" of element "' + element + '" violates facet constraints';
                } else {
                    const simpleTypeLocal: string = this.localName(simpleType);
                    if (simpleTypeLocal === 'ID' || this.isTypeDerivedFrom(simpleTypeLocal, 'ID')) {
                        if (this.seenIds.has(normalizedText)) {
                            textError = 'Duplicate xs:ID value "' + normalizedText + '" in element "' + element + '"';
                        } else {
                            this.seenIds.add(normalizedText);
                        }
                    } else if (simpleTypeLocal === 'IDREF' || this.isTypeDerivedFrom(simpleTypeLocal, 'IDREF')) {
                        this.pendingIdrefs.push(normalizedText);
                    } else if (simpleTypeLocal === 'IDREFS' || this.isTypeDerivedFrom(simpleTypeLocal, 'IDREFS')) {
                        for (const token of normalizedText.split(/\s+/)) {
                            if (token.length > 0) {
                                this.pendingIdrefs.push(token);
                            }
                        }
                    }
                }
            } else {
                const unionAlternatives: Array<{ facets: SchemaFacets, baseType: string }> | undefined = textDecl.getUnionAlternatives();
                const unionMemberTypes: string[] | undefined = textDecl.getUnionMemberTypes();
                if (unionAlternatives !== undefined && unionAlternatives.length > 0) {
                    const normalizedText: string = effectiveText.replace(/[\t\n\r ]+/g, ' ').trim();
                    let valid: boolean = false;
                    for (const alt of unionAlternatives) {
                        if (SchemaTypeValidator.validate(normalizedText, alt.baseType, instanceNs) && SchemaTypeValidator.validateFacets(normalizedText, alt.facets, alt.baseType)) {
                            valid = true;
                            break;
                        }
                    }
                    if (!valid) {
                        textError = 'Invalid text content "' + effectiveText + '" for element "' + element + '": does not match any union member type';
                    }
                } else if (unionMemberTypes !== undefined && unionMemberTypes.length > 0) {
                    const normalizedText: string = effectiveText.replace(/[\t\n\r ]+/g, ' ').trim();
                    let valid: boolean = false;
                    for (const memberType of unionMemberTypes) {
                        if (this.validateTokenForType(normalizedText, memberType, instanceNs)) {
                            valid = true;
                            break;
                        }
                    }
                    if (!valid) {
                        textError = 'Invalid text content "' + effectiveText + '" for element "' + element + '": does not match any union member type';
                    }
                } else {
                    const listItemType: string | undefined = textDecl.getListItemType();
                    if (listItemType !== undefined) {
                        const normalizedText: string = effectiveText.replace(/[\t\n\r ]+/g, ' ').trim();
                        const tokens: string[] = normalizedText.length === 0 ? [] : normalizedText.split(/\s+/);
                        for (const token of tokens) {
                            if (!this.validateTokenForType(token, listItemType, instanceNs)) {
                                textError = 'Invalid list item "' + token + '" for element "' + element + '": expected type ' + listItemType;
                                break;
                            }
                        }
                    } else if (decl.getContentModel().getType() === SchemaContentModelType.ELEMENT
                        || decl.getContentModel().getType() === SchemaContentModelType.EMPTY) {
                        if (effectiveText.trim().length > 0) {
                            textError = 'Element "' + element + '" has element-only content but contains text: "' + effectiveText + '"';
                        }
                    }
                }
            }
        }
        if (this.elementPath.length === 0) {
            for (const ref of this.pendingIdrefs) {
                if (!this.seenIds.has(ref)) {
                    return ValidationResult.error(
                        'xs:IDREF value "' + ref + '" does not match any xs:ID in the document'
                    );
                }
            }
        }
        if (textError !== undefined) {
            return ValidationResult.error(textError);
        }
        return contentResult;
    }

    validateAttributes(element: string, attributes: Map<string, string>): ValidationResult {
        if (this.elementPath.length === 0) {
            this.completedKeys = new Map<string, Array<Array<string | undefined>>>();
            this.activeScopes = [];
            this.seenIds = new Set<string>();
            this.pendingIdrefs = [];
            this.pendingKeyrefChecks = [];
            this.wildcardModeStack = [];
        }
        this.elementPath.push(this.localName(element));
        const currentDepth: number = this.elementPath.length - 1;
        let isNilTrue: boolean = false;
        let isNilPresent: boolean = false;
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
                isNilPresent = true;
                if (attrValue === 'true' || attrValue === '1') {
                    isNilTrue = true;
                }
                break;
            }
        }
        for (const scope of this.activeScopes) {
            if (scope.pendingStack.length > 0 && scope.pendingStack[scope.pendingStack.length - 1].depth === currentDepth) {
                continue;
            }
            const relativePath: string[] = this.elementPath.slice(scope.rootDepth + 1);
            let selectorMatched: boolean = false;
            for (const alt of scope.selectorAlternatives) {
                if (alt.descendant) {
                    if (currentDepth >= scope.rootDepth + alt.segments.length
                        && relativePath.length >= alt.segments.length
                        && this.selectorMatches(alt.segments, relativePath.slice(relativePath.length - alt.segments.length))) {
                        selectorMatched = true;
                        break;
                    }
                } else if (currentDepth === scope.rootDepth + alt.segments.length
                    && this.selectorMatches(alt.segments, relativePath)) {
                    selectorMatched = true;
                    break;
                }
            }
            if (selectorMatched) {
                scope.pendingStack.push({
                    tuple: new Array<string | undefined>(scope.constraint.fields.length).fill(undefined),
                    depth: currentDepth,
                    overflow: false,
                    nil: isNilTrue
                });
                this.collectAttributeFields(scope, attributes, this.localName(element));
            }
        }
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

        // Detect xsi:nil and push to nil stack.
        this.nilStack.push(isNilTrue);

        // Build instance namespace scope for this element (inherits from parent scope).
        const instanceNs: Map<string, string> = new Map<string, string>();
        if (this.instanceNsStack.length > 0) {
            for (const [p, u] of this.instanceNsStack[this.instanceNsStack.length - 1]) {
                instanceNs.set(p, u);
            }
        }
        for (const [attrName, attrValue] of attributes) {
            if (attrName === 'xmlns') {
                instanceNs.set('', attrValue);
            } else if (attrName.startsWith('xmlns:')) {
                instanceNs.set(attrName.substring(6), attrValue);
            }
        }
        this.instanceNsStack.push(instanceNs);

        const parentMode: 'normal' | 'lax' | 'skip' | undefined =
            this.wildcardModeStack.length > 0 ? this.wildcardModeStack[this.wildcardModeStack.length - 1] : undefined;
        if (parentMode === 'skip') {
            this.wildcardModeStack.push('skip');
            return ValidationResult.success();
        }
        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(element);
        if (!decl) {
            if (parentMode === 'lax') {
                this.wildcardModeStack.push('lax');
                return ValidationResult.success();
            }
            if (this.elementPath.length >= 2) {
                const parentName: string = this.elementPath[this.elementPath.length - 2];
                const parentDecl: SchemaElementDecl | undefined = this.lookupElementDecl(parentName);
                if (parentDecl !== undefined) {
                    if (parentDecl.getContentModel().getType() === SchemaContentModelType.ANY) {
                        this.wildcardModeStack.push('skip');
                        return ValidationResult.success();
                    }
                    const currentNs: Map<string, string> | undefined = this.instanceNsStack.length > 0 ? this.instanceNsStack[this.instanceNsStack.length - 1] : undefined;
                    const pc: 'strict' | 'lax' | 'skip' | undefined = parentDecl.getContentModel().findCoveringWildcard(element, currentNs);
                    if (pc === 'lax') {
                        this.wildcardModeStack.push('lax');
                        return ValidationResult.success();
                    }
                    if (pc === 'skip') {
                        this.wildcardModeStack.push('skip');
                        return ValidationResult.success();
                    }
                }
            }
            return ValidationResult.error('Element "' + element + '" is not declared in the schema');
        }
        this.wildcardModeStack.push('normal');
        // Enforce elementFormDefault / form per XSD §3.3.1 / §2.6.3.
        // Use instanceNsStack (which already includes xmlns= declared on this element)
        // rather than resolvePrefix(), which only reads the static namespaceDeclarations map.
        const colonIdx: number = element.indexOf(':');
        const elemPrefix: string = colonIdx !== -1 ? element.substring(0, colonIdx) : '';
        const currentInstanceNs: Map<string, string> | undefined =
            this.instanceNsStack.length > 0 ? this.instanceNsStack[this.instanceNsStack.length - 1] : undefined;
        const resolvedElemNs: string | undefined = currentInstanceNs !== undefined ? currentInstanceNs.get(elemPrefix) : undefined;
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
        // Per spec §3.3.4 cvc-elt 3.2.1: xsi:nil is only allowed when the element declaration has nillable="true".
        if (isNilPresent && !decl.isNillable()) {
            return ValidationResult.error(
                'Element "' + element + '" is not nillable but xsi:nil was specified'
            );
        }
        if (xsiTypeLocalName === undefined) {
            const declaredTypeName: string | undefined = decl.getDeclaredTypeName();
            if (declaredTypeName !== undefined) {
                const declaredTypeDecl: SchemaElementDecl | undefined = this.complexTypeDecls.get(declaredTypeName);
                if (declaredTypeDecl !== undefined && declaredTypeDecl.isAbstractElement()) {
                    return ValidationResult.error(
                        'Element "' + element + '" has abstract type "' + declaredTypeName +
                        '" and must use xsi:type to specify a concrete type'
                    );
                }
            }
        }
        // Per the spec (§3.9.4), xsi:type must name a type validly derived from the element's declared type.
        if (xsiTypeLocalName !== undefined) {
            const xsiTypeDecl: SchemaElementDecl | undefined = this.complexTypeDecls.get(xsiTypeLocalName);
            if (xsiTypeDecl !== undefined && xsiTypeDecl.isAbstractElement()) {
                return ValidationResult.error(
                    'xsi:type "' + xsiTypeLocalName + '" is abstract and cannot be used for element instantiation'
                );
            }
            const declaredTypeName: string | undefined = decl.getDeclaredTypeName();
            if (declaredTypeName !== undefined) {
                if (!this.isTypeDerivedFrom(xsiTypeLocalName, declaredTypeName)) {
                    return ValidationResult.error(
                        'xsi:type "' + xsiTypeLocalName + '" is not derived from the declared type "' +
                        declaredTypeName + '" of element "' + element + '"'
                    );
                }
                const finalBlockedMethod: string | undefined = this.getFinalBlockedMethod(xsiTypeLocalName, declaredTypeName);
                if (finalBlockedMethod !== undefined) {
                    return ValidationResult.error(
                        'xsi:type "' + xsiTypeLocalName + '" is not validly derived: type "' +
                        declaredTypeName + '" has final="' + finalBlockedMethod + '"'
                    );
                }
                // Effective block is union of element's {disallowed substitutions} and
                // the declared type's {prohibited substitutions} — spec §3.9.4 / §3.3.4.
                const typeDecl: SchemaElementDecl | undefined = this.complexTypeDecls.get(declaredTypeName);
                const elementBlock: Set<string> = decl.getBlockConstraints();
                const typeBlock: Set<string> = typeDecl !== undefined ? typeDecl.getBlockConstraints() : new Set<string>();
                const effectiveBlock: Set<string> = new Set<string>([...elementBlock, ...typeBlock]);
                if (effectiveBlock.size > 0) {
                    const blocksAll: boolean = effectiveBlock.has('#all');
                    if (blocksAll || effectiveBlock.has('extension') || effectiveBlock.has('restriction')) {
                        const pathMethods: Set<string> = this.getPathMethods(xsiTypeLocalName, declaredTypeName);
                        if (pathMethods.size > 0) {
                            if (blocksAll) {
                                return ValidationResult.error(
                                    'xsi:type "' + xsiTypeLocalName + '" is blocked by type "' +
                                    declaredTypeName + '"'
                                );
                            }
                            for (const m of pathMethods) {
                                if (effectiveBlock.has(m)) {
                                    return ValidationResult.error(
                                        'xsi:type "' + xsiTypeLocalName + '" is blocked: derivation by "' +
                                        m + '" is prohibited'
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
                const attrTypeLocal: string = this.localName(attrDecl.getType());
                if (attrTypeLocal === 'ID' || this.isTypeDerivedFrom(attrTypeLocal, 'ID')) {
                    if (this.seenIds.has(attrValue)) {
                        return ValidationResult.error(
                            'Duplicate xs:ID value "' + attrValue + '" on attribute "' + attrName +
                            '" of element "' + element + '"'
                        );
                    }
                    this.seenIds.add(attrValue);
                } else if (attrTypeLocal === 'IDREF' || this.isTypeDerivedFrom(attrTypeLocal, 'IDREF')) {
                    this.pendingIdrefs.push(attrValue);
                } else if (attrTypeLocal === 'IDREFS' || this.isTypeDerivedFrom(attrTypeLocal, 'IDREFS')) {
                    for (const token of attrValue.trim().split(/\s+/)) {
                        if (token.length > 0) {
                            this.pendingIdrefs.push(token);
                        }
                    }
                }
                continue;
            }

            // anyAttribute wildcard takes priority over imported-grammar lookups.
            // The wildcard namespace constraint (e.g. ##other) may explicitly exclude
            // certain namespaces, so it must be evaluated before any global-attribute
            // fallback that would bypass that restriction.
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

            // No anyAttribute — try imported namespace grammars as a fallback.
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

        const identityConstraints: IdentityConstraint[] | undefined = decl.getIdentityConstraints();
        if (identityConstraints !== undefined) {
            for (const constraint of identityConstraints) {
                const selectorAlternatives: Array<{ segments: string[], descendant: boolean }> = this.parseSelectorSegments(constraint.selector);
                const scope: IdentityConstraintScope = {
                    constraint,
                    rootDepth: currentDepth,
                    selectorAlternatives,
                    pendingStack: [],
                    lastCommittedTuple: undefined,
                    lastCommittedDepth: -1,
                    tuples: [],
                };
                if (selectorAlternatives.some((alt: { segments: string[], descendant: boolean }) => alt.segments.length === 0)) {
                    scope.pendingStack.push({
                        tuple: new Array<string | undefined>(constraint.fields.length).fill(undefined),
                        depth: currentDepth,
                        overflow: false,
                        nil: isNilTrue
                    });
                    this.collectAttributeFields(scope, attributes, this.localName(element));
                }
                this.activeScopes.push(scope);
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
        if (processContents === 'strict') {
            return false; // strict requires a declaration; none found for unqualified attr
        }
        return true; // lax: accept
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

    private lookupElementDecl(elementName: string): SchemaElementDecl | undefined {
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
        // Also consult instanceNsStack for prefixes declared in the instance document.
        const colonIndex: number = elementName.indexOf(':');
        const prefix: string = colonIndex !== -1 ? elementName.substring(0, colonIndex) : '';
        const instanceNsTop: Map<string, string> | undefined =
            this.instanceNsStack.length > 0 ? this.instanceNsStack[this.instanceNsStack.length - 1] : undefined;
        const resolvedNs: string | undefined = this.resolvePrefix(prefix) ?? instanceNsTop?.get(prefix);
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
            const entry: { base: string, method: string } | undefined = this.typeHierarchy.get(current);
            if (entry) {
                methods.add(entry.method);
                current = entry.base;
            } else {
                const builtinBase: string | undefined = BUILTIN_TYPE_HIERARCHY.get(current);
                if (builtinBase) {
                    methods.add('restriction');
                    current = builtinBase;
                } else {
                    break;
                }
            }
        }
        // Did not reach required — type is not derived; return empty set.
        return new Set<string>();
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

    private selectorMatches(segments: string[], relativePath: string[]): boolean {
        if (segments.length !== relativePath.length) {
            return false;
        }
        for (let i: number = 0; i < segments.length; i++) {
            if (segments[i] !== '*' && segments[i] !== relativePath[i]) {
                return false;
            }
        }
        return true;
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

    private collectAttributeFields(scope: IdentityConstraintScope, attributes: Map<string, string>, elementLocalName: string): void {
        if (scope.pendingStack.length === 0) {
            return;
        }
        const pendingTop: PendingTupleEntry = scope.pendingStack[scope.pendingStack.length - 1];
        const attrNs: Map<string, string> = new Map<string, string>();
        if (this.instanceNsStack.length > 0) {
            for (const [p, u] of this.instanceNsStack[this.instanceNsStack.length - 1]) {
                attrNs.set(p, u);
            }
        }
        for (const [attrName, attrValue] of attributes) {
            if (attrName === 'xmlns') {
                attrNs.set('', attrValue);
            } else if (attrName.startsWith('xmlns:')) {
                attrNs.set(attrName.substring(6), attrValue);
            }
        }
        const declaredDecl: SchemaElementDecl | undefined = this.lookupElementDecl(elementLocalName);
        let xsiTypeLocal: string | undefined = undefined;
        for (const [attrName, attrValue] of attributes) {
            if (attrName === 'xsi:type' || (attrName.endsWith(':type') && attrName.indexOf(':') !== -1)) {
                xsiTypeLocal = this.localName(attrValue);
                break;
            }
        }
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

    private collectTextFields(scope: IdentityConstraintScope, elementLocalName: string, text: string, isSelf: boolean, nsMap?: Map<string, string>, xsiTypeLocalName?: string): void {
        if (scope.pendingStack.length === 0) {
            return;
        }
        const textTop: PendingTupleEntry = scope.pendingStack[scope.pendingStack.length - 1];
        const tuple: Array<string | undefined> = textTop.tuple;
        const fields: string[] = scope.constraint.fields;
        for (let i: number = 0; i < fields.length; i++) {
            const alternatives: Array<{ isAttribute: boolean, localName: string, descendant: boolean }> = this.parseFieldAlternatives(fields[i]);
            for (const alt of alternatives) {
                if (alt.isAttribute) {
                    continue;
                }
                const matches: boolean = isSelf
                    ? (alt.localName === '' || alt.localName === '.')
                    : (alt.localName === elementLocalName || (alt.descendant && alt.localName === '*'));
                if (matches) {
                    if (tuple[i] !== undefined) {
                        if (!isSelf) {
                            textTop.overflow = true;
                        }
                    } else {
                        const declaredDecl: SchemaElementDecl | undefined = this.lookupElementDecl(elementLocalName);
                        const effectiveDecl: SchemaElementDecl | undefined = xsiTypeLocalName !== undefined
                            ? (this.complexTypeDecls.get(xsiTypeLocalName) ?? this.simpleTypeDecls.get(xsiTypeLocalName) ?? declaredDecl)
                            : declaredDecl;
                        const simpleType: string | undefined = effectiveDecl?.getSimpleType();
                        const raw: string = text.trim();
                        const canonicalized: string = simpleType !== undefined ? SchemaTypeValidator.canonicalize(raw, simpleType, nsMap) : raw;
                        tuple[i] = (simpleType ?? 'string') + '\x02' + canonicalized;
                    }
                    break;
                }
            }
        }
    }

    private tupleKey(tuple: Array<string | undefined>): string {
        return tuple.map(v => v === undefined ? '\x00' : v).join('\x01');
    }

    private closeConstraintScopes(): string | undefined {
        const closingDepth: number = this.lastClosedDepth;
        let errorMessage: string | undefined = undefined;
        for (const scope of this.activeScopes) {
            if (scope.pendingStack.length > 0 && scope.pendingStack[scope.pendingStack.length - 1].depth === closingDepth) {
                const committedEntry: PendingTupleEntry = scope.pendingStack[scope.pendingStack.length - 1];
                const tuple: Array<string | undefined> = committedEntry.tuple;
                scope.lastCommittedTuple = tuple;
                scope.lastCommittedDepth = committedEntry.depth;
                scope.pendingStack.pop();
                const wasNil: boolean = committedEntry.nil;
                if (wasNil) {
                    if (scope.constraint.kind === 'key') {
                        if (errorMessage === undefined) {
                            errorMessage = 'xs:key "' + scope.constraint.name + '": nilled element in key target node set';
                        }
                    }
                    continue;
                }
                if (committedEntry.overflow) {
                    if (scope.constraint.kind === 'key') {
                        if (errorMessage === undefined) {
                            errorMessage = 'xs:key "' + scope.constraint.name + '": selected node has multiple values for a field';
                        }
                        scope.tuples.push(tuple);
                    }
                    continue;
                }
                const allAbsent: boolean = tuple.every(v => v === undefined);
                if (allAbsent) {
                    if (scope.constraint.kind === 'key') {
                        if (errorMessage === undefined) {
                            errorMessage = 'xs:key "' + scope.constraint.name + '": selected node is missing one or more key field values';
                        }
                    }
                    scope.tuples.push(tuple);
                    continue;
                }
                const anyAbsent: boolean = tuple.some(v => v === undefined);
                if (anyAbsent && scope.constraint.kind === 'key') {
                    if (errorMessage === undefined) {
                        errorMessage = 'xs:key "' + scope.constraint.name + '": selected node is missing one or more key field values';
                    }
                }
                scope.tuples.push(tuple);
            }
        }
        const removedScopes: IdentityConstraintScope[] = [];
        let i: number = this.activeScopes.length - 1;
        while (i >= 0) {
            const scope: IdentityConstraintScope = this.activeScopes[i];
            if (scope.rootDepth === closingDepth) {
                this.activeScopes.splice(i, 1);
                removedScopes.push(scope);
            }
            i--;
        }
        for (const scope of removedScopes) {
            if (errorMessage !== undefined) {
                break;
            }
            if (scope.constraint.kind === 'key' || scope.constraint.kind === 'unique') {
                const seen: Set<string> = new Set<string>();
                for (const tuple of scope.tuples) {
                    const allPresent: boolean = tuple.every(v => v !== undefined);
                    if (!allPresent) {
                        continue;
                    }
                    const key: string = this.tupleKey(tuple);
                    if (seen.has(key)) {
                        errorMessage = 'xs:' + scope.constraint.kind + ' "' + scope.constraint.name + '": duplicate key value ' + JSON.stringify(key);
                        break;
                    }
                    seen.add(key);
                }
                if (scope.constraint.kind === 'key' || scope.constraint.kind === 'unique') {
                    this.completedKeys.set(scope.constraint.name, scope.tuples);
                    let ci: number = this.pendingKeyrefChecks.length - 1;
                    while (ci >= 0) {
                        const check = this.pendingKeyrefChecks[ci];
                        if (check.refer === scope.constraint.name) {
                            this.pendingKeyrefChecks.splice(ci, 1);
                            if (errorMessage === undefined) {
                                const keySet: Set<string> = new Set<string>();
                                for (const kt of scope.tuples) {
                                    keySet.add(this.tupleKey(kt));
                                }
                                for (const tuple of check.tuples) {
                                    const allPresent: boolean = tuple.every(v => v !== undefined);
                                    if (!allPresent) {
                                        continue;
                                    }
                                    const key: string = this.tupleKey(tuple);
                                    if (!keySet.has(key)) {
                                        errorMessage = 'xs:keyref "' + check.constraintName + '": value ' + JSON.stringify(key) + ' has no matching xs:key "' + scope.constraint.name + '"';
                                        break;
                                    }
                                }
                            }
                        }
                        ci--;
                    }
                }
            }
        }
        for (const scope of removedScopes) {
            if (errorMessage !== undefined) {
                break;
            }
            if (scope.constraint.kind === 'keyref') {
                const referName: string | undefined = scope.constraint.refer;
                if (referName !== undefined) {
                    const keyTuples: Array<Array<string | undefined>> | undefined = this.completedKeys.get(referName);
                    if (keyTuples !== undefined) {
                        const keySet: Set<string> = new Set<string>();
                        for (const kt of keyTuples) {
                            keySet.add(this.tupleKey(kt));
                        }
                        for (const tuple of scope.tuples) {
                            const allPresent: boolean = tuple.every(v => v !== undefined);
                            if (!allPresent) {
                                continue;
                            }
                            const key: string = this.tupleKey(tuple);
                            if (!keySet.has(key)) {
                                errorMessage = 'xs:keyref "' + scope.constraint.name + '": value ' + JSON.stringify(key) + ' has no matching xs:key "' + referName + '"';
                                break;
                            }
                        }
                    } else {
                        this.pendingKeyrefChecks.push({ constraintName: scope.constraint.name, refer: referName, tuples: scope.tuples });
                    }
                }
            }
        }
        if (closingDepth === 0 && this.pendingKeyrefChecks.length > 0) {
            if (errorMessage === undefined) {
                const check = this.pendingKeyrefChecks[0];
                errorMessage = 'xs:keyref "' + check.constraintName + '": referred key/unique "' + check.refer + '" was not found in the document';
            }
            this.pendingKeyrefChecks = [];
        }
        return errorMessage;
    }
}
