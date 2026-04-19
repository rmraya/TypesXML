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
import { SchemaTypeValidator } from './SchemaTypeValidator.js';

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

interface IdentityConstraintScope {
    constraint: IdentityConstraint;
    rootDepth: number;
    selectorSegments: string[];
    pendingTuple: Array<string | undefined> | undefined;
    lastCommittedTuple: Array<string | undefined> | undefined;
    pendingDepth: number;
    pendingTupleOverflow: boolean;
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
    private typeHierarchy: Map<string, {base: string, method: string}>;
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
        this.typeHierarchy = new Map<string, {base: string, method: string}>();
        this.instanceNsStack = [];
        this.elementPath = [];
        this.activeScopes = [];
        this.completedKeys = new Map<string, Array<Array<string | undefined>>>();
        this.lastClosedDepth = -1;
        this.lastPoppedXsiType = undefined;
        this.lastPoppedNil = false;
        this.seenIds = new Set<string>();
        this.pendingIdrefs = [];
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

    validateElement(element: string, children: string[]): ValidationResult {
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
        const constraintError: string | undefined = this.closeConstraintScopes();
        if (this.elementPath.length > 0) {
            this.elementPath.pop();
        }
        const substitutedDecl: SchemaElementDecl | undefined = xsiType !== undefined ? this.complexTypeDecls.get(xsiType) : undefined;

        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(element);
        if (!decl) {
            if (this.elementPath.length > 0) {
                const parentName: string = this.elementPath[this.elementPath.length - 1];
                const parentDecl: SchemaElementDecl | undefined = this.lookupElementDecl(parentName);
                if (parentDecl !== undefined) {
                    const pc: 'strict' | 'lax' | 'skip' | undefined = parentDecl.getContentModel().findCoveringWildcard(element, this.lastPoppedInstanceNs);
                    if (pc === 'skip' || pc === 'lax') {
                        return ValidationResult.success();
                    }
                }
            }
            return ValidationResult.error('Element "' + element + '" is not declared in the schema');
        }
        // Per spec §2.6.2: a nilled element must have no element or text children.
        if (isNilled) {
            if (children.length > 0) {
                return ValidationResult.error(
                    'Element "' + element + '" has xsi:nil="true" but contains child elements'
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
        if (this.elementPath.length === 0) {
            for (const ref of this.pendingIdrefs) {
                if (!this.seenIds.has(ref)) {
                    return ValidationResult.error(
                        'xs:IDREF value "' + ref + '" does not match any xs:ID in the document'
                    );
                }
            }
        }
        return contentResult;
    }

    validateTextContent(element: string, text: string): ValidationResult {
        if (this.activeScopes.length > 0) {
            const idDepth: number = this.lastClosedDepth;
            const idLocalName: string = this.localName(element);
            for (const scope of this.activeScopes) {
                const selectedDepth: number = scope.rootDepth + scope.selectorSegments.length;
                if (idDepth === selectedDepth && scope.lastCommittedTuple !== undefined) {
                    this.collectTextFields(scope, idLocalName, text, true, this.lastPoppedInstanceNs);
                } else if (idDepth === selectedDepth + 1 && scope.pendingTuple !== undefined) {
                    this.collectTextFields(scope, idLocalName, text, false, this.lastPoppedInstanceNs);
                }
            }
        }
        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(element);
        if (!decl) {
            return ValidationResult.success();
        }
        // Per spec §2.6.2: a nilled element must have no text content.
        const isNilled: boolean = this.lastPoppedNil;
        if (isNilled) {
            if (text.trim().length > 0) {
                return ValidationResult.error(
                    'Element "' + element + '" has xsi:nil="true" but contains text content'
                );
            }
            return ValidationResult.success();
        }
        // If xsi:type is active, validate against the substitute type's constraints.
        const xsiType: string | undefined = this.lastPoppedXsiType;
        const substituteDecl: SchemaElementDecl | undefined = xsiType !== undefined
            ? (this.complexTypeDecls.get(xsiType) ?? this.simpleTypeDecls.get(xsiType))
            : undefined;
        const effectiveDecl: SchemaElementDecl = substituteDecl !== undefined ? substituteDecl : decl;
        const instanceNs: Map<string, string> | undefined = this.instanceNsStack.length > 0
            ? this.instanceNsStack[this.instanceNsStack.length - 1]
            : undefined;
        const fixedValue: string | undefined = effectiveDecl.getFixedValue();
        if (fixedValue !== undefined) {
            const normalizedText: string = text.replace(/[\t\n\r ]+/g, ' ').trim();
            if (normalizedText !== fixedValue) {
                return ValidationResult.error(
                    'Element "' + element + '" has a fixed value "' + fixedValue + '" but got "' + normalizedText + '"'
                );
            }
        }
        const simpleType: string | undefined = effectiveDecl.getSimpleType();
        if (simpleType !== undefined) {
            const normalizedText: string = text.replace(/[\t\n\r ]+/g, ' ').trim();
            if (!SchemaTypeValidator.validate(normalizedText, simpleType, instanceNs)) {
                return ValidationResult.error(
                    'Invalid text content "' + text + '" for element "' + element + '": expected type ' + simpleType
                );
            }
            if (effectiveDecl.hasTextFacets() && !effectiveDecl.validateText(text)) {
                return ValidationResult.error(
                    'Text content "' + text + '" of element "' + element + '" violates facet constraints'
                );
            }
            const simpleTypeLocal: string = this.localName(simpleType);
            if (simpleTypeLocal === 'ID' || this.isTypeDerivedFrom(simpleTypeLocal, 'ID')) {
                if (this.seenIds.has(normalizedText)) {
                    return ValidationResult.error(
                        'Duplicate xs:ID value "' + normalizedText + '" in element "' + element + '"'
                    );
                }
                this.seenIds.add(normalizedText);
            } else if (simpleTypeLocal === 'IDREF' || this.isTypeDerivedFrom(simpleTypeLocal, 'IDREF')) {
                this.pendingIdrefs.push(normalizedText);
            } else if (simpleTypeLocal === 'IDREFS') {
                for (const token of normalizedText.split(/\s+/)) {
                    if (token.length > 0) {
                        this.pendingIdrefs.push(token);
                    }
                }
            }
            return ValidationResult.success();
        }
        const unionMemberTypes: string[] | undefined = effectiveDecl.getUnionMemberTypes();
        if (unionMemberTypes !== undefined && unionMemberTypes.length > 0) {
            const normalizedText: string = text.replace(/[\t\n\r ]+/g, ' ').trim();
            let valid: boolean = false;
            for (const memberType of unionMemberTypes) {
                if (SchemaTypeValidator.validate(normalizedText, memberType, instanceNs)) {
                    valid = true;
                    break;
                }
            }
            if (!valid) {
                return ValidationResult.error(
                    'Invalid text content "' + text + '" for element "' + element + '": does not match any union member type'
                );
            }
            return ValidationResult.success();
        }
        const listItemType: string | undefined = effectiveDecl.getListItemType();
        if (listItemType !== undefined) {
            const normalizedText: string = text.replace(/[\t\n\r ]+/g, ' ').trim();
            const tokens: string[] = normalizedText.length === 0 ? [] : normalizedText.split(/\s+/);
            for (const token of tokens) {
                if (!SchemaTypeValidator.validate(token, listItemType, instanceNs)) {
                    return ValidationResult.error(
                        'Invalid list item "' + token + '" for element "' + element + '": expected type ' + listItemType
                    );
                }
            }
            return ValidationResult.success();
        }
        if (decl.getContentModel().getType() === SchemaContentModelType.ELEMENT
                || decl.getContentModel().getType() === SchemaContentModelType.EMPTY) {
            if (text.trim().length > 0) {
                return ValidationResult.error(
                    'Element "' + element + '" has element-only content but contains text: "' + text + '"'
                );
            }
        }
        return ValidationResult.success();
    }

    validateAttributes(element: string, attributes: Map<string, string>): ValidationResult {
        if (this.elementPath.length === 0) {
            this.completedKeys = new Map<string, Array<Array<string | undefined>>>();
            this.activeScopes = [];
            this.seenIds = new Set<string>();
            this.pendingIdrefs = [];
        }
        this.elementPath.push(this.localName(element));
        const currentDepth: number = this.elementPath.length - 1;
        for (const scope of this.activeScopes) {
            if (scope.pendingTuple !== undefined) {
                continue;
            }
            const selectedDepth: number = scope.rootDepth + scope.selectorSegments.length;
            if (currentDepth !== selectedDepth) {
                continue;
            }
            const relativePath: string[] = this.elementPath.slice(scope.rootDepth + 1);
            if (this.selectorMatches(scope.selectorSegments, relativePath)) {
                scope.pendingTuple = new Array<string | undefined>(scope.constraint.fields.length).fill(undefined);
                scope.pendingDepth = currentDepth;
                scope.pendingTupleOverflow = false;
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
        let isNilTrue: boolean = false;
        for (const [attrName, attrValue] of attributes) {
            let isNilAttr: boolean = attrName === 'xsi:nil';
            if (!isNilAttr && attrName.endsWith(':nil') && attrName.indexOf(':') !== -1) {
                const nilCheckPrefix: string = attrName.substring(0, attrName.indexOf(':'));
                const nilCheckNs: string | undefined = this.resolvePrefix(nilCheckPrefix);
                if (nilCheckNs === 'http://www.w3.org/2001/XMLSchema-instance') {
                    isNilAttr = true;
                }
            }
            if (isNilAttr && (attrValue === 'true' || attrValue === '1')) {
                isNilTrue = true;
                break;
            }
        }
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

        const decl: SchemaElementDecl | undefined = this.lookupElementDecl(element);
        if (!decl) {
            return ValidationResult.error('Element "' + element + '" is not declared in the schema');
        }
        // Per spec §2.6.2: xsi:nil="true" is only allowed when the element declaration has nillable="true".
        if (isNilTrue && !decl.isNillable()) {
            return ValidationResult.error(
                'Element "' + element + '" is not nillable but xsi:nil="true" was specified'
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
                } else if (attrTypeLocal === 'IDREFS') {
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
                if (this.anyAttributeCovers(anyNs, anyPc, attrName, attrValue, element)) {
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
                const selectorSegments: string[] = this.parseSelectorSegments(constraint.selector);
                const scope: IdentityConstraintScope = {
                    constraint,
                    rootDepth: currentDepth,
                    selectorSegments,
                    pendingTuple: undefined,
                    lastCommittedTuple: undefined,
                    pendingDepth: -1,
                    pendingTupleOverflow: false,
                    tuples: [],
                };
                if (selectorSegments.length === 0) {
                    scope.pendingTuple = new Array<string | undefined>(constraint.fields.length).fill(undefined);
                    scope.pendingDepth = currentDepth;
                    scope.pendingTupleOverflow = false;
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

    private anyAttributeCovers(anyNs: string, processContents: string, attrName: string, attrValue: string, elementName: string): boolean {
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
            covered = attrNs !== undefined && !this.targetNamespaces.has(attrNs);
        } else {
            // Space-separated list of URIs, ##local, ##targetNamespace.
            const tokens: string[] = anyNs.split(/\s+/);
            for (const token of tokens) {
                if (token === '##local' && attrPrefix === undefined) {
                    covered = true;
                    break;
                }
                if (token === '##targetNamespace') {
                    if (attrNs !== undefined && this.targetNamespaces.has(attrNs)) {
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
            const entry: {base: string, method: string} | undefined = this.typeHierarchy.get(current);
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
            const entry: {base: string, method: string} | undefined = this.typeHierarchy.get(current);
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
            const entry: {base: string, method: string} | undefined = this.typeHierarchy.get(current);
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

    private parseSelectorSegments(selector: string): string[] {
        const trimmed: string = selector.trim();
        const relative: string = trimmed.startsWith('./') ? trimmed.substring(2) : trimmed;
        if (relative === '.' || relative === '') {
            return [];
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
                const colonIdx: number = s.indexOf(':');
                segments.push(colonIdx !== -1 ? s.substring(colonIdx + 1) : s);
            }
        }
        return segments;
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

    private parseFieldPath(field: string): {isAttribute: boolean, localName: string} {
        const trimmed: string = field.trim();
        const withoutSelf: string = trimmed.startsWith('./') ? trimmed.substring(2) : (trimmed === '.' ? '' : trimmed);
        if (withoutSelf.startsWith('@')) {
            const atName: string = withoutSelf.substring(1);
            const colonIdx: number = atName.indexOf(':');
            return {isAttribute: true, localName: colonIdx !== -1 ? atName.substring(colonIdx + 1) : atName};
        }
        const colonIdx: number = withoutSelf.indexOf(':');
        return {isAttribute: false, localName: colonIdx !== -1 ? withoutSelf.substring(colonIdx + 1) : withoutSelf};
    }

    private parseFieldAlternatives(field: string): Array<{isAttribute: boolean, localName: string}> {
        return field.split('|').map((alt: string) => this.parseFieldPath(alt));
    }

    private collectAttributeFields(scope: IdentityConstraintScope, attributes: Map<string, string>, elementLocalName: string): void {
        if (scope.pendingTuple === undefined) {
            return;
        }
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
        const elemDecl: SchemaElementDecl | undefined = this.lookupElementDecl(elementLocalName);
        for (let i: number = 0; i < scope.constraint.fields.length; i++) {
            const alternatives: Array<{isAttribute: boolean, localName: string}> = this.parseFieldAlternatives(scope.constraint.fields[i]);
            for (const alt of alternatives) {
                if (!alt.isAttribute) {
                    continue;
                }
                for (const [attrName, attrValue] of attributes) {
                    const attrLocal: string = this.localName(attrName);
                    if (attrLocal === alt.localName) {
                        const attrDecl: SchemaAttributeDecl | undefined = elemDecl?.getAttributeDecl(attrName) ?? elemDecl?.getAttributeDecl(attrLocal);
                        const attrType: string = attrDecl !== undefined ? attrDecl.getType() : 'xs:string';
                        scope.pendingTuple[i] = SchemaTypeValidator.canonicalize(attrValue, attrType, attrNs);
                        break;
                    }
                }
                if (scope.pendingTuple[i] !== undefined) {
                    break;
                }
            }
        }
    }

    private collectTextFields(scope: IdentityConstraintScope, elementLocalName: string, text: string, isSelf: boolean, nsMap?: Map<string, string>): void {
        const tuple: Array<string | undefined> | undefined = isSelf ? scope.lastCommittedTuple : scope.pendingTuple;
        if (tuple === undefined) {
            return;
        }
        const fields: string[] = scope.constraint.fields;
        for (let i: number = 0; i < fields.length; i++) {
            const alternatives: Array<{isAttribute: boolean, localName: string}> = this.parseFieldAlternatives(fields[i]);
            for (const alt of alternatives) {
                if (alt.isAttribute) {
                    continue;
                }
                const matches: boolean = isSelf
                    ? (alt.localName === '' || alt.localName === '.')
                    : (alt.localName === elementLocalName);
                if (matches) {
                    if (tuple[i] !== undefined) {
                        if (!isSelf && scope.constraint.kind === 'key') {
                            scope.pendingTupleOverflow = true;
                        }
                    } else {
                        const elemDecl: SchemaElementDecl | undefined = this.lookupElementDecl(elementLocalName);
                        const simpleType: string | undefined = elemDecl?.getSimpleType();
                        const raw: string = text.trim();
                        tuple[i] = simpleType !== undefined ? SchemaTypeValidator.canonicalize(raw, simpleType, nsMap) : raw;
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
            if (scope.pendingTuple !== undefined && scope.pendingDepth === closingDepth) {
                const tuple: Array<string | undefined> = scope.pendingTuple;
                scope.lastCommittedTuple = tuple;
                scope.pendingTuple = undefined;
                if (scope.pendingTupleOverflow) {
                    scope.pendingTupleOverflow = false;
                    if (errorMessage === undefined) {
                        errorMessage = 'xs:key "' + scope.constraint.name + '": selected node has multiple values for a field';
                    }
                    scope.tuples.push(tuple);
                    continue;
                }
                const allAbsent: boolean = tuple.every(v => v === undefined);
                if (allAbsent) {
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
                    const hasValue: boolean = tuple.some(v => v !== undefined);
                    if (!hasValue) {
                        continue;
                    }
                    const key: string = this.tupleKey(tuple);
                    if (seen.has(key)) {
                        errorMessage = 'xs:' + scope.constraint.kind + ' "' + scope.constraint.name + '": duplicate key value ' + JSON.stringify(key);
                        break;
                    }
                    seen.add(key);
                }
                if (scope.constraint.kind === 'key') {
                    this.completedKeys.set(scope.constraint.name, scope.tuples);
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
                            const hasValue: boolean = tuple.some(v => v !== undefined);
                            if (!hasValue) {
                                continue;
                            }
                            const key: string = this.tupleKey(tuple);
                            if (!keySet.has(key)) {
                                errorMessage = 'xs:keyref "' + scope.constraint.name + '": value ' + JSON.stringify(key) + ' has no matching xs:key "' + referName + '"';
                                break;
                            }
                        }
                    }
                }
            }
        }
        return errorMessage;
    }
}
