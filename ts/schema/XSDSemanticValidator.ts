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

import { XMLAttribute } from '../XMLAttribute.js';
import { XMLElement } from '../XMLElement.js';
import { XMLUtils } from '../XMLUtils.js';
import { SchemaFacets, SchemaTypeValidator } from './SchemaTypeValidator.js';
import { XsdRegexTranslator } from './XsdRegexTranslator.js';

const NAMED_COMPONENTS: Set<string> = new Set<string>([
    'element',
    'attribute',
    'complexType',
    'simpleType',
    'group',
    'attributeGroup',
    'notation'
]);

// XML Schema built-in types whose variety is list (spec §2.5.1.2).
const BUILT_IN_LIST_TYPES: Set<string> = new Set<string>(['IDREFS', 'NMTOKENS', 'ENTITIES']);

// Facets that are NOT applicable to a list-variety restriction.
const LIST_INVALID_FACETS: Set<string> = new Set<string>([
    'minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive',
    'totalDigits', 'fractionDigits', 'precision'
]);

// Facets that are NOT applicable to a union-variety restriction (only pattern/enumeration allowed).
const UNION_INVALID_FACETS: Set<string> = new Set<string>([
    'minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive',
    'totalDigits', 'fractionDigits', 'precision',
    'length', 'minLength', 'maxLength', 'whiteSpace'
]);

// All valid facet names defined by XML Schema (spec §3.2).
const VALID_FACET_NAMES: Set<string> = new Set<string>([
    'length', 'minLength', 'maxLength',
    'pattern', 'enumeration', 'whiteSpace',
    'maxInclusive', 'maxExclusive', 'minInclusive', 'minExclusive',
    'totalDigits', 'fractionDigits'
]);

// Non-facet children that are legal inside xs:restriction.
const RESTRICTION_NON_FACET_CHILDREN: Set<string> = new Set<string>([
    'annotation', 'simpleType'
]);

const XSD_BUILT_IN_TYPE_NAMES: Set<string> = new Set<string>([
    'string', 'boolean', 'decimal', 'float', 'double', 'duration', 'dateTime', 'time', 'date',
    'gYearMonth', 'gYear', 'gMonthDay', 'gDay', 'gMonth', 'hexBinary', 'base64Binary', 'anyURI',
    'QName', 'NOTATION', 'normalizedString', 'token', 'language', 'NMTOKEN', 'NMTOKENS',
    'Name', 'NCName', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'integer',
    'nonPositiveInteger', 'negativeInteger', 'long', 'int', 'short', 'byte',
    'nonNegativeInteger', 'unsignedLong', 'unsignedInt', 'unsignedShort', 'unsignedByte',
    'positiveInteger', 'anySimpleType', 'anyType'
]);

export class XSDSemanticValidator {

    static validate(schemaRoot: XMLElement): void {
        XSDSemanticValidator.checkNamedComponents(schemaRoot);
        XSDSemanticValidator.checkAnnotationCount(schemaRoot);
        XSDSemanticValidator.checkNotationAttributes(schemaRoot);
        XSDSemanticValidator.checkNotationPlacement(schemaRoot, true);
        XSDSemanticValidator.checkNotationRestrictionEnumerations(schemaRoot);
        XSDSemanticValidator.checkIdAttributes(schemaRoot);
        XSDSemanticValidator.checkDuplicateIds(schemaRoot);
        XSDSemanticValidator.checkIncludeRedefine(schemaRoot);
        XSDSemanticValidator.checkDuplicateImports(schemaRoot);
        XSDSemanticValidator.checkDuplicateTopLevelElements(schemaRoot);
        XSDSemanticValidator.checkDuplicateTopLevelComplexTypes(schemaRoot);
        XSDSemanticValidator.checkDuplicateTopLevelSimpleTypes(schemaRoot);
        XSDSemanticValidator.checkDuplicateTopLevelAttributeGroups(schemaRoot);
        XSDSemanticValidator.checkDuplicateTopLevelGroups(schemaRoot);
        XSDSemanticValidator.checkFacetValues(schemaRoot);
        XSDSemanticValidator.checkAllNesting(schemaRoot, false);
        XSDSemanticValidator.checkKeyrefReferences(schemaRoot);
        XSDSemanticValidator.checkIdentityConstraintPlacement(schemaRoot, false);
        XSDSemanticValidator.checkElementRefConstraints(schemaRoot);
        XSDSemanticValidator.checkAttributeUseConstraints(schemaRoot);
        XSDSemanticValidator.checkOccurrenceConstraints(schemaRoot);
        XSDSemanticValidator.checkSimpleTypeChildren(schemaRoot);
        XSDSemanticValidator.checkListUnionConstraints(schemaRoot);
        XSDSemanticValidator.checkComplexTypeContentModel(schemaRoot);
        XSDSemanticValidator.checkGroupCompositorCount(schemaRoot);
        XSDSemanticValidator.checkBlockFinalAttributes(schemaRoot);
    }

    static validateCrossReferences(
        roots: Array<XMLElement>,
        allComplexTypes: Map<string, XMLElement>,
        allSimpleTypes: Map<string, XMLElement>,
        allTopLevelElements: Set<string>
    ): void {
        for (const root of roots) {
            const schemaTargetNs: string = root.getAttribute('targetNamespace')?.getValue() ?? '';
            const schemaDefaultNs: string = XSDSemanticValidator.getDefaultNs(root);
            const schemaPrefixMap: Map<string, string> = XSDSemanticValidator.buildPrefixMap(root);
            XSDSemanticValidator.checkComplexTypeBaseReferences(root, allComplexTypes, schemaTargetNs, schemaDefaultNs, schemaPrefixMap);
            XSDSemanticValidator.checkElementRefAndTypeReferences(root, allTopLevelElements, allComplexTypes, allSimpleTypes, schemaTargetNs, schemaDefaultNs, schemaPrefixMap);
            XSDSemanticValidator.checkSimpleTypeRestrictions(root, allSimpleTypes);
            XSDSemanticValidator.checkFinalConstraints(root, allSimpleTypes);
            XSDSemanticValidator.checkElementValueConstraints(root, allSimpleTypes, allComplexTypes);
            XSDSemanticValidator.checkComplexTypeFinalConstraints(root, allComplexTypes);
            XSDSemanticValidator.checkSubstitutionGroupFinalConstraints(root, allComplexTypes);
            XSDSemanticValidator.checkComplexRestrictionAttributes(root, allComplexTypes);
            XSDSemanticValidator.checkListUnionTypeReferences(root, allSimpleTypes, schemaTargetNs, schemaDefaultNs, schemaPrefixMap);
        }
    }

    private static checkListUnionTypeReferences(
        el: XMLElement,
        allSimpleTypes: Map<string, XMLElement>,
        targetNs: string,
        defaultNs: string,
        prefixMap: Map<string, string>
    ): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'appinfo' || local === 'documentation') {
            return;
        }
        if (local === 'list') {
            const itemTypeAttr: XMLAttribute | undefined = el.getAttribute('itemType');
            if (itemTypeAttr) {
                XSDSemanticValidator.checkQNameSimpleTypeRef(itemTypeAttr.getValue(), 'xs:list itemType', allSimpleTypes, targetNs, defaultNs, prefixMap);
            }
        } else if (local === 'union') {
            const memberTypesAttr: XMLAttribute | undefined = el.getAttribute('memberTypes');
            if (memberTypesAttr) {
                const tokens: string[] = memberTypesAttr.getValue().trim().split(/\s+/);
                for (const token of tokens) {
                    if (token.length > 0) {
                        XSDSemanticValidator.checkQNameSimpleTypeRef(token, 'xs:union memberTypes', allSimpleTypes, targetNs, defaultNs, prefixMap);
                    }
                }
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkListUnionTypeReferences(child, allSimpleTypes, targetNs, defaultNs, prefixMap);
        }
    }

    private static checkQNameSimpleTypeRef(
        qname: string,
        context: string,
        allSimpleTypes: Map<string, XMLElement>,
        targetNs: string,
        defaultNs: string,
        prefixMap: Map<string, string>
    ): void {
        const xsdNs: string = 'http://www.w3.org/2001/XMLSchema';
        if (qname.indexOf(':') === -1) {
            if (defaultNs === xsdNs && targetNs.length > 0) {
                if (!XSD_BUILT_IN_TYPE_NAMES.has(qname)) {
                    throw new Error(context + '="' + qname + '" does not resolve to a declared simple type');
                }
            } else if (!allSimpleTypes.has(qname) && !XSD_BUILT_IN_TYPE_NAMES.has(qname)) {
                throw new Error(context + '="' + qname + '" refers to undeclared simple type "' + qname + '"');
            }
        } else {
            const colon: number = qname.indexOf(':');
            const prefix: string = qname.substring(0, colon);
            const localPart: string = qname.substring(colon + 1);
            const resolvedNs: string | undefined = prefixMap.get(prefix);
            if (resolvedNs === xsdNs) {
                if (!XSD_BUILT_IN_TYPE_NAMES.has(localPart)) {
                    throw new Error(context + '="' + qname + '" refers to unknown XSD built-in type "' + localPart + '"');
                }
            } else if (resolvedNs === targetNs) {
                if (!allSimpleTypes.has(localPart)) {
                    throw new Error(context + '="' + qname + '" refers to undeclared simple type "' + localPart + '"');
                }
            }
        }
    }

    private static checkNamedComponents(schemaRoot: XMLElement): void {
        for (const child of schemaRoot.getChildren()) {
            const localName: string = XSDSemanticValidator.localName(child.getName());
            if (!NAMED_COMPONENTS.has(localName)) {
                continue;
            }
            const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
            if (!nameAttr) {
                throw new Error('xs:' + localName + ' is missing required "name" attribute');
            }
            const value: string = nameAttr.getValue();
            if (!XMLUtils.isValidNCName(value)) {
                throw new Error('xs:' + localName + ' has invalid "name" value: "' + value + '"');
            }
        }
    }

    private static checkNotationAttributes(schemaRoot: XMLElement): void {
        const seenNames: Set<string> = new Set<string>();
        for (const child of schemaRoot.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) !== 'notation') {
                continue;
            }
            if (!child.getAttribute('public')) {
                throw new Error('xs:notation is missing required "public" attribute');
            }
            const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
            if (nameAttr) {
                const notName: string = nameAttr.getValue();
                if (seenNames.has(notName)) {
                    throw new Error('Duplicate xs:notation name: "' + notName + '"');
                }
                seenNames.add(notName);
            }
            for (const attr of child.getAttributes()) {
                const attrName: string = attr.getName();
                if (!attrName.includes(':') && attrName !== 'id' && attrName !== 'name' && attrName !== 'public' && attrName !== 'system') {
                    throw new Error('xs:notation has invalid attribute: "' + attrName + '"');
                }
            }
            for (const notChild of child.getChildren()) {
                const notChildLocal: string = XSDSemanticValidator.localName(notChild.getName());
                if (notChildLocal !== 'annotation') {
                    throw new Error('xs:notation cannot contain xs:' + notChildLocal);
                }
            }
        }
    }

    private static checkNotationPlacement(el: XMLElement, isSchemaRoot: boolean): void {
        const elLocal: string = XSDSemanticValidator.localName(el.getName());
        if (elLocal === 'appinfo' || elLocal === 'documentation') {
            return;
        }
        for (const child of el.getChildren()) {
            const childLocal: string = XSDSemanticValidator.localName(child.getName());
            if (!isSchemaRoot && childLocal === 'notation') {
                throw new Error('xs:notation must be a top-level schema component');
            }
            XSDSemanticValidator.checkNotationPlacement(child, false);
        }
    }

    private static checkNotationRestrictionEnumerations(schemaRoot: XMLElement): void {
        const declaredNotations: Set<string> = new Set<string>();
        for (const child of schemaRoot.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) === 'notation') {
                const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
                if (nameAttr) {
                    declaredNotations.add(nameAttr.getValue());
                }
            }
        }
        XSDSemanticValidator.checkNotationEnumValues(schemaRoot, declaredNotations);
    }

    private static checkNotationEnumValues(el: XMLElement, declaredNotations: Set<string>): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'appinfo' || local === 'documentation') {
            return;
        }
        if (local === 'restriction') {
            const baseAttr: XMLAttribute | undefined = el.getAttribute('base');
            if (baseAttr && XSDSemanticValidator.localName(baseAttr.getValue()) === 'NOTATION') {
                for (const facet of el.getChildren()) {
                    if (XSDSemanticValidator.localName(facet.getName()) === 'enumeration') {
                        const valueAttr: XMLAttribute | undefined = facet.getAttribute('value');
                        if (valueAttr) {
                            const val: string = XSDSemanticValidator.localName(valueAttr.getValue());
                            if (!declaredNotations.has(val)) {
                                throw new Error('xs:NOTATION restriction enumeration value "' + val + '" does not name a declared xs:notation');
                            }
                        }
                    }
                }
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkNotationEnumValues(child, declaredNotations);
        }
    }

    private static checkIdAttributes(el: XMLElement): void {
        const idAttr: XMLAttribute | undefined = el.getAttribute('id');
        if (idAttr) {
            const value: string = idAttr.getValue();
            if (!XMLUtils.isValidNCName(value)) {
                throw new Error('Invalid "id" attribute value: "' + value + '"');
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkIdAttributes(child);
        }
    }

    private static checkAnnotationCount(el: XMLElement): void {
        const elLocal: string = XSDSemanticValidator.localName(el.getName());
        const isSchema: boolean = elLocal === 'schema';
        let annotationCount: number = 0;
        let seenNonAnnotation: boolean = false;
        for (const child of el.getChildren()) {
            const childLocal: string = XSDSemanticValidator.localName(child.getName());
            if (childLocal === 'annotation') {
                annotationCount++;
                if (!isSchema && annotationCount > 1) {
                    throw new Error('xs:' + elLocal + ' has more than one xs:annotation child');
                }
                if (!isSchema && seenNonAnnotation) {
                    throw new Error('xs:annotation in xs:' + elLocal + ' must appear before other children');
                }
                for (const attr of child.getAttributes()) {
                    const attrName: string = attr.getName();
                    if (!attrName.includes(':') && attrName !== 'id') {
                        throw new Error('xs:annotation has invalid attribute: "' + attrName + '"');
                    }
                }
                for (const annotChild of child.getChildren()) {
                    const annotChildLocal: string = XSDSemanticValidator.localName(annotChild.getName());
                    if (annotChildLocal !== 'appinfo' && annotChildLocal !== 'documentation') {
                        throw new Error('xs:annotation contains invalid child element xs:' + annotChildLocal);
                    }
                    if (annotChildLocal === 'documentation') {
                        const langAttr: XMLAttribute | undefined = annotChild.getAttribute('xml:lang');
                        if (langAttr && !/^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/.test(langAttr.getValue())) {
                            throw new Error('xs:documentation has invalid xml:lang value: "' + langAttr.getValue() + '"');
                        }
                    }
                }
            } else {
                seenNonAnnotation = true;
            }
            if (childLocal !== 'appinfo' && childLocal !== 'documentation') {
                XSDSemanticValidator.checkAnnotationCount(child);
            }
        }
    }

    private static checkIncludeRedefine(schemaRoot: XMLElement): void {
        for (const child of schemaRoot.getChildren()) {
            const local: string = XSDSemanticValidator.localName(child.getName());
            if (local === 'include') {
                if (!child.getAttribute('schemaLocation')) {
                    throw new Error('xs:include is missing required "schemaLocation" attribute');
                }
            } else if (local === 'redefine') {
                if (!child.getAttribute('schemaLocation')) {
                    throw new Error('xs:redefine is missing required "schemaLocation" attribute');
                }
                for (const attr of child.getAttributes()) {
                    const attrName: string = attr.getName();
                    if (!attrName.includes(':') && attrName !== 'id' && attrName !== 'schemaLocation') {
                        throw new Error('xs:redefine has invalid attribute: "' + attrName + '"');
                    }
                }
                for (const redefineChild of child.getChildren()) {
                    const redefineChildLocal: string = XSDSemanticValidator.localName(redefineChild.getName());
                    if (redefineChildLocal !== 'annotation' && redefineChildLocal !== 'simpleType' &&
                        redefineChildLocal !== 'complexType' && redefineChildLocal !== 'group' &&
                        redefineChildLocal !== 'attributeGroup') {
                        throw new Error('xs:redefine contains invalid child element xs:' + redefineChildLocal);
                    }
                }
            }
        }
    }

    private static checkDuplicateIds(el: XMLElement): void {
        const seen: Set<string> = new Set<string>();
        XSDSemanticValidator.collectIds(el, seen);
    }

    private static collectIds(el: XMLElement, seen: Set<string>): void {
        const idAttr: XMLAttribute | undefined = el.getAttribute('id');
        if (idAttr) {
            const value: string = idAttr.getValue();
            if (seen.has(value)) {
                throw new Error('Duplicate id value: "' + value + '"');
            }
            seen.add(value);
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.collectIds(child, seen);
        }
    }

    private static checkDuplicateTopLevelGroups(schemaRoot: XMLElement): void {
        const seen: Set<string> = new Set<string>();
        for (const child of schemaRoot.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) !== 'group') {
                continue;
            }
            const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
            if (!nameAttr) {
                continue;
            }
            const name: string = nameAttr.getValue();
            if (seen.has(name)) {
                throw new Error('Duplicate top-level xs:group name: "' + name + '"');
            }
            seen.add(name);
        }
    }

    private static checkDuplicateTopLevelAttributeGroups(schemaRoot: XMLElement): void {
        const seen: Set<string> = new Set<string>();
        for (const child of schemaRoot.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) !== 'attributeGroup') {
                continue;
            }
            const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
            if (!nameAttr) {
                continue;
            }
            const name: string = nameAttr.getValue();
            if (seen.has(name)) {
                throw new Error('Duplicate top-level xs:attributeGroup name: "' + name + '"');
            }
            seen.add(name);
        }
    }

    private static checkDuplicateTopLevelComplexTypes(schemaRoot: XMLElement): void {
        const seen: Set<string> = new Set<string>();
        for (const child of schemaRoot.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) !== 'complexType') {
                continue;
            }
            const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
            if (!nameAttr) {
                continue;
            }
            const name: string = nameAttr.getValue();
            if (seen.has(name)) {
                throw new Error('Duplicate top-level xs:complexType name: "' + name + '"');
            }
            seen.add(name);
        }
    }

    private static checkDuplicateTopLevelElements(schemaRoot: XMLElement): void {
        const seen: Set<string> = new Set<string>();
        for (const child of schemaRoot.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) !== 'element') {
                continue;
            }
            const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
            if (!nameAttr) {
                continue;
            }
            const name: string = nameAttr.getValue();
            if (seen.has(name)) {
                throw new Error('Duplicate top-level xs:element name: "' + name + '"');
            }
            seen.add(name);
        }
    }

    private static checkDuplicateTopLevelSimpleTypes(schemaRoot: XMLElement): void {
        const seen: Set<string> = new Set<string>();
        for (const child of schemaRoot.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) !== 'simpleType') {
                continue;
            }
            const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
            if (!nameAttr) {
                continue;
            }
            const name: string = nameAttr.getValue();
            if (seen.has(name)) {
                throw new Error('Duplicate top-level xs:simpleType name: "' + name + '"');
            }
            seen.add(name);
        }
    }

    private static checkDuplicateImports(schemaRoot: XMLElement): void {
        const schemaTargetNs: string | undefined = schemaRoot.getAttribute('targetNamespace')?.getValue();
        const seenNamespaces: Set<string> = new Set<string>();
        let seenAbsentNamespace: boolean = false;
        for (const child of schemaRoot.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) !== 'import') {
                continue;
            }
            const nsAttr: XMLAttribute | undefined = child.getAttribute('namespace');
            const importNs: string | undefined = nsAttr ? nsAttr.getValue() : undefined;
            if (importNs === schemaTargetNs) {
                throw new Error(
                    'xs:import ' + (importNs !== undefined ? 'namespace "' + importNs + '"' : 'with absent namespace') +
                    ' must differ from the schema\'s own target namespace'
                );
            }
            if (nsAttr) {
                const ns: string = nsAttr.getValue();
                if (seenNamespaces.has(ns)) {
                    throw new Error('Duplicate xs:import for namespace: "' + ns + '"');
                }
                seenNamespaces.add(ns);
            } else {
                if (seenAbsentNamespace) {
                    throw new Error('Duplicate xs:import for absent namespace');
                }
                seenAbsentNamespace = true;
            }
        }
    }

    static checkIncludedNamespace(includedRoot: XMLElement, includingNamespace: string | undefined): void {
        const includedNsAttr: XMLAttribute | undefined = includedRoot.getAttribute('targetNamespace');
        if (includedNsAttr === undefined) {
            return;
        }
        const includedNs: string = includedNsAttr.getValue();
        if (includedNs !== includingNamespace) {
            throw new Error(
                'xs:include: included schema target namespace "' + includedNs +
                '" does not match including schema target namespace ' +
                (includingNamespace !== undefined ? '"' + includingNamespace + '"' : '(absent)')
            );
        }
    }

    private static checkFacetValues(el: XMLElement): void {
        const localEl: string = XSDSemanticValidator.localName(el.getName());
        if (localEl === 'length' || localEl === 'minLength' || localEl === 'maxLength' || localEl === 'fractionDigits') {
            const valAttr: XMLAttribute | undefined = el.getAttribute('value');
            if (valAttr) {
                const raw: string = valAttr.getValue();
                if (!/^[0-9]+$/.test(raw)) {
                    throw new Error('xs:' + localEl + ' value must be a non-negative integer, got: "' + raw + '"');
                }
            }
        } else if (localEl === 'totalDigits') {
            const valAttr: XMLAttribute | undefined = el.getAttribute('value');
            if (valAttr) {
                const raw: string = valAttr.getValue();
                if (!/^[0-9]+$/.test(raw) || Number.parseInt(raw, 10) < 1) {
                    throw new Error('xs:totalDigits value must be a positive integer, got: "' + raw + '"');
                }
            }
        } else if (localEl === 'pattern') {
            const valAttr: XMLAttribute | undefined = el.getAttribute('value');
            if (valAttr) {
                XsdRegexTranslator.toRegExp(valAttr.getValue());
            }
        } else if (localEl === 'restriction') {
            const baseAttr: XMLAttribute | undefined = el.getAttribute('base');
            const baseLocal: string = baseAttr ? XSDSemanticValidator.localName(baseAttr.getValue()) : '';
            const numericBases: Set<string> = new Set([
                'decimal', 'integer', 'long', 'int', 'short', 'byte',
                'unsignedLong', 'unsignedInt', 'unsignedShort', 'unsignedByte',
                'nonNegativeInteger', 'nonPositiveInteger', 'positiveInteger', 'negativeInteger',
                'float', 'double',
            ]);
            const floatBases: Set<string> = new Set(['float', 'double']);
            const floatSpecials: Set<string> = new Set(['INF', '+INF', '-INF', 'NaN']);
            const isNumericBase: boolean = numericBases.has(baseLocal);
            const isFloatBase: boolean = floatBases.has(baseLocal);
            const isInvalidNumericValue = (val: string): boolean => {
                if (isFloatBase && floatSpecials.has(val)) {
                    return false;
                }
                return Number.isNaN(Number.parseFloat(val));
            };
            const isOutOfRangeForBase = (val: string, base: string): boolean => {
                if (!/^[+-]?[0-9]+$/.test(val)) { return false; }
                switch (base) {
                    case 'byte': { const n: number = Number.parseInt(val, 10); return n < -128 || n > 127; }
                    case 'short': { const n: number = Number.parseInt(val, 10); return n < -32768 || n > 32767; }
                    case 'int': { const n: number = Number.parseInt(val, 10); return n < -2147483648 || n > 2147483647; }
                    case 'long': { const n: bigint = BigInt(val.replace(/^\+/, '')); return n < BigInt('-9223372036854775808') || n > BigInt('9223372036854775807'); }
                    case 'unsignedByte': { const n: number = Number.parseInt(val, 10); return n < 0 || n > 255; }
                    case 'unsignedShort': { const n: number = Number.parseInt(val, 10); return n < 0 || n > 65535; }
                    case 'unsignedInt': { const n: number = Number.parseInt(val, 10); return n < 0 || n > 4294967295; }
                    case 'unsignedLong': { if (val.startsWith('-')) { return true; } const n: bigint = BigInt(val.replace(/^\+/, '')); return n > BigInt('18446744073709551615'); }
                    case 'nonNegativeInteger': return val.startsWith('-');
                    case 'nonPositiveInteger': { const stripped: string = val.replace(/^\+/, ''); return stripped !== '0' && !val.startsWith('-'); }
                    case 'positiveInteger': return val.startsWith('-') || val.replace(/^\+/, '') === '0';
                    case 'negativeInteger': return !val.startsWith('-');
                    default: return false;
                }
            };
            let hasLength: boolean = false;
            let hasMinLength: boolean = false;
            let hasMaxLength: boolean = false;
            let minLengthVal: number | undefined;
            let maxLengthVal: number | undefined;
            let minExclusive: string | undefined;
            let maxExclusive: string | undefined;
            let minInclusive: string | undefined;
            let maxInclusive: string | undefined;
            for (const facet of el.getChildren()) {
                const facetLocal: string = XSDSemanticValidator.localName(facet.getName());
                const val: string | undefined = facet.getAttribute('value')?.getValue();
                if (val === undefined) { continue; }
                if (facetLocal === 'minExclusive') { minExclusive = val; }
                else if (facetLocal === 'maxExclusive') { maxExclusive = val; }
                else if (facetLocal === 'minInclusive') { minInclusive = val; }
                else if (facetLocal === 'maxInclusive') { maxInclusive = val; }
                else if (facetLocal === 'length') { hasLength = true; }
                else if (facetLocal === 'minLength') { hasMinLength = true; minLengthVal = Number.parseInt(val, 10); }
                else if (facetLocal === 'maxLength') { hasMaxLength = true; maxLengthVal = Number.parseInt(val, 10); }
                else if (facetLocal === 'enumeration' && isNumericBase && isInvalidNumericValue(val)) {
                    throw new Error('xs:enumeration value "' + val + '" is not valid for numeric base type "' + baseLocal + '"');
                }
            }
            if (hasLength && hasMinLength) {
                throw new Error('xs:restriction cannot have both xs:length and xs:minLength');
            }
            if (hasLength && hasMaxLength) {
                throw new Error('xs:restriction cannot have both xs:length and xs:maxLength');
            }
            if (hasMinLength && hasMaxLength && minLengthVal !== undefined && maxLengthVal !== undefined && minLengthVal > maxLengthVal) {
                throw new Error('xs:restriction has minLength (' + minLengthVal + ') greater than maxLength (' + maxLengthVal + ')');
            }
            if (minExclusive !== undefined && minInclusive !== undefined) {
                throw new Error('xs:restriction cannot have both minExclusive and minInclusive');
            }
            if (maxExclusive !== undefined && maxInclusive !== undefined) {
                throw new Error('xs:restriction cannot have both maxExclusive and maxInclusive');
            }
            if (isNumericBase) {
                const rangeFacets: Array<[string, string | undefined]> = [
                    ['minExclusive', minExclusive],
                    ['maxExclusive', maxExclusive],
                    ['minInclusive', minInclusive],
                    ['maxInclusive', maxInclusive],
                ];
                for (const [facetName, val] of rangeFacets) {
                    if (val !== undefined && isInvalidNumericValue(val)) {
                        throw new Error('xs:' + facetName + ' value "' + val + '" is not valid for numeric base type "' + baseLocal + '"');
                    }
                    if (val !== undefined && isOutOfRangeForBase(val, baseLocal)) {
                        throw new Error('xs:' + facetName + ' value "' + val + '" is out of range for base type "' + baseLocal + '"');
                    }
                }
            }
            const lo: number | undefined = minExclusive !== undefined ? Number.parseFloat(minExclusive) : (minInclusive !== undefined ? Number.parseFloat(minInclusive) : undefined);
            const loExclusive: boolean = minExclusive !== undefined;
            const hi: number | undefined = maxExclusive !== undefined ? Number.parseFloat(maxExclusive) : (maxInclusive !== undefined ? Number.parseFloat(maxInclusive) : undefined);
            const hiExclusive: boolean = maxExclusive !== undefined;
            if (lo !== undefined && hi !== undefined && !Number.isNaN(lo) && !Number.isNaN(hi)) {
                if (loExclusive || hiExclusive) {
                    if (lo >= hi) {
                        throw new Error('xs:restriction has contradictory range facets: min=' + lo + ' max=' + hi);
                    }
                } else {
                    if (lo > hi) {
                        throw new Error('xs:restriction has contradictory range facets: minInclusive=' + lo + ' maxInclusive=' + hi);
                    }
                }
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkFacetValues(child);
        }
    }

    // --- final attribute enforcement ---

    // Checks that no simpleType derives from a type whose `final` (or schema `finalDefault`) blocks it.
    private static checkFinalConstraints(schemaRoot: XMLElement, simpleTypes: Map<string, XMLElement>): void {
        const finalDefaultAttr: XMLAttribute | undefined = schemaRoot.getAttribute('finalDefault');
        const schemaFinalDefault: string = finalDefaultAttr ? finalDefaultAttr.getValue() : '';
        for (const typeEl of simpleTypes.values()) {
            for (const child of typeEl.getChildren()) {
                const childLocal: string = XSDSemanticValidator.localName(child.getName());
                if (childLocal === 'restriction') {
                    const baseAttr: XMLAttribute | undefined = child.getAttribute('base');
                    if (baseAttr) {
                        XSDSemanticValidator.checkFinalBlocks(
                            baseAttr.getValue(), 'restriction', simpleTypes, schemaFinalDefault
                        );
                    }
                } else if (childLocal === 'list') {
                    const itemTypeAttr: XMLAttribute | undefined = child.getAttribute('itemType');
                    if (itemTypeAttr) {
                        XSDSemanticValidator.checkFinalBlocks(
                            itemTypeAttr.getValue(), 'list', simpleTypes, schemaFinalDefault
                        );
                    }
                } else if (childLocal === 'union') {
                    const memberTypesAttr: XMLAttribute | undefined = child.getAttribute('memberTypes');
                    if (memberTypesAttr) {
                        for (const memberType of memberTypesAttr.getValue().split(/\s+/)) {
                            if (memberType.length > 0) {
                                XSDSemanticValidator.checkFinalBlocks(
                                    memberType, 'union', simpleTypes, schemaFinalDefault
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    private static checkFinalBlocks(
        typeName: string,
        derivationMethod: string,
        simpleTypes: Map<string, XMLElement>,
        schemaFinalDefault: string
    ): void {
        const local: string = XSDSemanticValidator.localName(typeName);
        const typeEl: XMLElement | undefined = simpleTypes.get(local);
        if (!typeEl) {
            return; // Built-in or unknown type — no final constraint from this schema.
        }
        const finalAttr: XMLAttribute | undefined = typeEl.getAttribute('final');
        const effectiveFinal: string = finalAttr ? finalAttr.getValue() : schemaFinalDefault;
        if (effectiveFinal.length === 0) {
            return;
        }
        const finalValues: string[] = effectiveFinal.split(/\s+/);
        if (finalValues.indexOf('#all') !== -1 || finalValues.indexOf(derivationMethod) !== -1) {
            throw new Error('Type "' + local + '" has final="' + effectiveFinal +
                '" which blocks derivation by ' + derivationMethod);
        }
    }

    private static collectComplexTypes(schemaRoot: XMLElement): Map<string, XMLElement> {
        const map: Map<string, XMLElement> = new Map<string, XMLElement>();
        for (const child of schemaRoot.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) === 'complexType') {
                const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
                if (nameAttr) {
                    map.set(nameAttr.getValue(), child);
                }
            }
        }
        return map;
    }

    private static checkComplexTypeFinalConstraints(schemaRoot: XMLElement, complexTypes: Map<string, XMLElement>): void {
        const finalDefaultAttr: XMLAttribute | undefined = schemaRoot.getAttribute('finalDefault');
        const schemaFinalDefault: string = finalDefaultAttr ? finalDefaultAttr.getValue() : '';
        for (const typeEl of complexTypes.values()) {
            for (const contentChild of typeEl.getChildren()) {
                const contentLocal: string = XSDSemanticValidator.localName(contentChild.getName());
                if (contentLocal !== 'complexContent' && contentLocal !== 'simpleContent') {
                    continue;
                }
                for (const derivChild of contentChild.getChildren()) {
                    const derivLocal: string = XSDSemanticValidator.localName(derivChild.getName());
                    if (derivLocal !== 'extension' && derivLocal !== 'restriction') {
                        continue;
                    }
                    const baseAttr: XMLAttribute | undefined = derivChild.getAttribute('base');
                    if (!baseAttr) {
                        continue;
                    }
                    const baseLocal: string = XSDSemanticValidator.localName(baseAttr.getValue());
                    const baseEl: XMLElement | undefined = complexTypes.get(baseLocal);
                    if (!baseEl) {
                        continue;
                    }
                    const finalAttr: XMLAttribute | undefined = baseEl.getAttribute('final');
                    const effectiveFinal: string = finalAttr ? finalAttr.getValue() : schemaFinalDefault;
                    if (effectiveFinal.length === 0) {
                        continue;
                    }
                    const finalValues: string[] = effectiveFinal.split(/\s+/);
                    if (finalValues.indexOf('#all') !== -1 || finalValues.indexOf(derivLocal) !== -1) {
                        const typeName: string | undefined = typeEl.getAttribute('name')?.getValue();
                        throw new Error(
                            'Type "' + (typeName !== undefined ? typeName : '(anonymous)') +
                            '" cannot derive by ' + derivLocal + ' from "' + baseLocal +
                            '": final="' + effectiveFinal + '" prohibits it'
                        );
                    }
                }
            }
        }
    }

    private static getDefaultNs(schemaRoot: XMLElement): string {
        const xmlns: XMLAttribute | undefined = schemaRoot.getAttribute('xmlns');
        return xmlns ? xmlns.getValue() : '';
    }

    private static checkComplexTypeBaseReferences(
        el: XMLElement,
        complexTypes: Map<string, XMLElement>,
        targetNs: string,
        defaultNs: string,
        prefixMap: Map<string, string>
    ): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'appinfo' || local === 'documentation') {
            return;
        }
        if (local === 'complexContent') {
            for (const derivChild of el.getChildren()) {
                const derivLocal: string = XSDSemanticValidator.localName(derivChild.getName());
                if (derivLocal !== 'extension' && derivLocal !== 'restriction') {
                    continue;
                }
                const baseAttr: XMLAttribute | undefined = derivChild.getAttribute('base');
                if (!baseAttr) {
                    continue;
                }
                const baseValue: string = baseAttr.getValue();
                if (baseValue.indexOf(':') === -1) {
                    const xsdNs: string = 'http://www.w3.org/2001/XMLSchema';
                    if (defaultNs === xsdNs && targetNs.length > 0) {
                        if (baseValue !== 'anyType') {
                            throw new Error(
                                'xs:' + derivLocal + ' base="' + baseValue +
                                '" does not resolve to a declared type in namespace "' + targetNs + '"'
                            );
                        }
                    } else if (!complexTypes.has(baseValue) && baseValue !== 'anyType') {
                        throw new Error(
                            'xs:' + derivLocal + ' base="' + baseValue +
                            '" refers to undeclared complex type "' + baseValue + '"'
                        );
                    }
                } else {
                    const colon: number = baseValue.indexOf(':');
                    const prefix: string = baseValue.substring(0, colon);
                    const localPart: string = baseValue.substring(colon + 1);
                    const resolvedNs: string | undefined = prefixMap.get(prefix);
                    if (resolvedNs === targetNs) {
                        if (!complexTypes.has(localPart) && localPart !== 'anyType') {
                            throw new Error(
                                'xs:' + derivLocal + ' base="' + baseValue +
                                '" refers to undeclared complex type "' + localPart + '"'
                            );
                        }
                    }
                }
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkComplexTypeBaseReferences(child, complexTypes, targetNs, defaultNs, prefixMap);
        }
    }

    private static buildPrefixMap(schemaRoot: XMLElement): Map<string, string> {
        const map: Map<string, string> = new Map<string, string>();
        for (const attr of schemaRoot.getAttributes()) {
            const attrName: string = attr.getName();
            if (attrName.length > 6 && attrName.substring(0, 6) === 'xmlns:') {
                map.set(attrName.substring(6), attr.getValue());
            }
        }
        return map;
    }

    private static collectTopLevelElements(schemaRoot: XMLElement): Set<string> {
        const set: Set<string> = new Set<string>();
        for (const child of schemaRoot.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) === 'element') {
                const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
                if (nameAttr) {
                    set.add(nameAttr.getValue());
                }
            }
        }
        return set;
    }

    private static checkElementRefAndTypeReferences(
        el: XMLElement,
        topLevelElements: Set<string>,
        complexTypes: Map<string, XMLElement>,
        simpleTypes: Map<string, XMLElement>,
        targetNs: string,
        defaultNs: string,
        prefixMap: Map<string, string>
    ): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'appinfo' || local === 'documentation') {
            return;
        }
        if (local === 'element') {
            const refAttr: XMLAttribute | undefined = el.getAttribute('ref');
            if (refAttr) {
                const refValue: string = refAttr.getValue();
                XSDSemanticValidator.checkQNameElementRef(refValue, topLevelElements, targetNs, defaultNs, prefixMap);
            }
            const typeAttr: XMLAttribute | undefined = el.getAttribute('type');
            if (typeAttr) {
                const typeValue: string = typeAttr.getValue();
                XSDSemanticValidator.checkQNameTypeRef(typeValue, complexTypes, simpleTypes, targetNs, defaultNs, prefixMap);
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkElementRefAndTypeReferences(child, topLevelElements, complexTypes, simpleTypes, targetNs, defaultNs, prefixMap);
        }
    }

    private static checkQNameElementRef(
        qname: string,
        topLevelElements: Set<string>,
        targetNs: string,
        defaultNs: string,
        prefixMap: Map<string, string>
    ): void {
        if (qname.indexOf(':') === -1) {
            const nsKey: string = targetNs.length > 0 ? targetNs + '|' + qname : qname;
            if (!topLevelElements.has(qname) && !topLevelElements.has(nsKey)) {
                throw new Error('xs:element ref="' + qname + '" refers to undeclared element "' + qname + '"');
            }
        } else {
            const colon: number = qname.indexOf(':');
            const prefix: string = qname.substring(0, colon);
            const localPart: string = qname.substring(colon + 1);
            const resolvedNs: string | undefined = prefixMap.get(prefix);
            if (resolvedNs !== undefined) {
                const lookupKey: string = resolvedNs.length > 0 ? resolvedNs + '|' + localPart : localPart;
                if (!topLevelElements.has(lookupKey)) {
                    throw new Error('xs:element ref="' + qname + '" refers to undeclared element "' + localPart + '"');
                }
            }
        }
    }

    private static checkQNameTypeRef(
        qname: string,
        complexTypes: Map<string, XMLElement>,
        simpleTypes: Map<string, XMLElement>,
        targetNs: string,
        defaultNs: string,
        prefixMap: Map<string, string>
    ): void {
        const xsdNs: string = 'http://www.w3.org/2001/XMLSchema';
        if (qname.indexOf(':') === -1) {
            if (defaultNs === xsdNs && targetNs.length > 0) {
                if (!XSD_BUILT_IN_TYPE_NAMES.has(qname)) {
                    throw new Error('xs:element type="' + qname + '" does not resolve to a declared type');
                }
            } else if (!complexTypes.has(qname) && !simpleTypes.has(qname) && !XSD_BUILT_IN_TYPE_NAMES.has(qname)) {
                throw new Error('xs:element type="' + qname + '" refers to undeclared type "' + qname + '"');
            }
        } else {
            const colon: number = qname.indexOf(':');
            const prefix: string = qname.substring(0, colon);
            const localPart: string = qname.substring(colon + 1);
            const resolvedNs: string | undefined = prefixMap.get(prefix);
            if (resolvedNs === targetNs) {
                if (!complexTypes.has(localPart) && !simpleTypes.has(localPart)) {
                    throw new Error('xs:element type="' + qname + '" refers to undeclared type "' + localPart + '"');
                }
            }
        }
    }

    // --- Simple type variety resolution ---

    private static collectSimpleTypes(schemaRoot: XMLElement): Map<string, XMLElement> {
        const map: Map<string, XMLElement> = new Map<string, XMLElement>();
        for (const child of schemaRoot.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) === 'simpleType') {
                const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
                if (nameAttr) {
                    map.set(nameAttr.getValue(), child);
                }
            }
        }
        return map;
    }

    // Resolves the variety (list/union/atomic/unknown) of a named or prefixed type.
    // Follows the restriction chain transitively; `visited` guards against cycles.
    private static getTypeVariety(
        typeName: string,
        simpleTypes: Map<string, XMLElement>,
        visited: Set<string>
    ): 'list' | 'union' | 'atomic' | 'unknown' {
        const local: string = XSDSemanticValidator.localName(typeName);
        // Built-in list types (spec §2.5.1.2, §3.8.7).
        if (BUILT_IN_LIST_TYPES.has(local)) {
            return 'list';
        }
        // Prefixed names not in the local simpleType map are built-in atomic types.
        if (typeName.indexOf(':') !== -1 && !simpleTypes.has(local)) {
            return 'atomic';
        }
        const typeEl: XMLElement | undefined = simpleTypes.get(local);
        if (!typeEl) {
            return 'unknown';
        }
        if (visited.has(local)) {
            return 'unknown'; // Cycle guard.
        }
        visited.add(local);
        for (const child of typeEl.getChildren()) {
            const childLocal: string = XSDSemanticValidator.localName(child.getName());
            if (childLocal === 'list') {
                return 'list';
            }
            if (childLocal === 'union') {
                return 'union';
            }
            if (childLocal === 'restriction') {
                const baseAttr: XMLAttribute | undefined = child.getAttribute('base');
                if (baseAttr) {
                    return XSDSemanticValidator.getTypeVariety(baseAttr.getValue(), simpleTypes, visited);
                }
                // Restriction with an inline xs:simpleType child instead of a base attribute.
                for (const restrChild of child.getChildren()) {
                    if (XSDSemanticValidator.localName(restrChild.getName()) === 'simpleType') {
                        return XSDSemanticValidator.getInlineSimpleTypeVariety(restrChild);
                    }
                }
            }
        }
        return 'unknown';
    }

    // Determines the variety of an anonymous xs:simpleType element.
    private static getInlineSimpleTypeVariety(simpleTypeEl: XMLElement): 'list' | 'union' | 'atomic' | 'unknown' {
        for (const child of simpleTypeEl.getChildren()) {
            const childLocal: string = XSDSemanticValidator.localName(child.getName());
            if (childLocal === 'list') {
                return 'list';
            }
            if (childLocal === 'union') {
                return 'union';
            }
            if (childLocal === 'restriction') {
                return 'atomic';
            }
        }
        return 'unknown';
    }

    // Walks the tree and validates facets inside every xs:simpleType/xs:restriction.
    private static checkSimpleTypeRestrictions(el: XMLElement, simpleTypes: Map<string, XMLElement>): void {
        const localEl: string = XSDSemanticValidator.localName(el.getName());
        if (localEl === 'simpleType') {
            for (const child of el.getChildren()) {
                if (XSDSemanticValidator.localName(child.getName()) === 'restriction') {
                    XSDSemanticValidator.validateRestrictionFacets(child, simpleTypes);
                }
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkSimpleTypeRestrictions(child, simpleTypes);
        }
    }

    // Validates that the facets used in a restriction are applicable to the base type's variety.
    private static validateRestrictionFacets(restrictionEl: XMLElement, simpleTypes: Map<string, XMLElement>): void {
        let variety: 'list' | 'union' | 'atomic' | 'unknown' = 'unknown';
        const baseAttr: XMLAttribute | undefined = restrictionEl.getAttribute('base');
        if (baseAttr) {
            variety = XSDSemanticValidator.getTypeVariety(baseAttr.getValue(), simpleTypes, new Set<string>());
        } else {
            for (const child of restrictionEl.getChildren()) {
                if (XSDSemanticValidator.localName(child.getName()) === 'simpleType') {
                    variety = XSDSemanticValidator.getInlineSimpleTypeVariety(child);
                    break;
                }
            }
        }
        for (const child of restrictionEl.getChildren()) {
            const childLocal: string = XSDSemanticValidator.localName(child.getName());
            if (!VALID_FACET_NAMES.has(childLocal) && !RESTRICTION_NON_FACET_CHILDREN.has(childLocal)) {
                throw new Error('"xs:' + childLocal + '" is not a valid facet name');
            }
        }
        if (variety === 'unknown' || variety === 'atomic') {
            return;
        }
        for (const child of restrictionEl.getChildren()) {
            const childLocal: string = XSDSemanticValidator.localName(child.getName());
            if (variety === 'list' && LIST_INVALID_FACETS.has(childLocal)) {
                throw new Error('Facet "xs:' + childLocal + '" is not applicable to a list-variety restriction');
            }
            if (variety === 'union' && UNION_INVALID_FACETS.has(childLocal)) {
                throw new Error('Facet "xs:' + childLocal + '" is not applicable to a union-variety restriction');
            }
        }
    }

    private static isIdType(typeName: string, simpleTypes: Map<string, XMLElement>, visited: Set<string>): boolean {
        const local: string = XSDSemanticValidator.localName(typeName);
        if (local === 'ID') {
            return true;
        }
        const typeEl: XMLElement | undefined = simpleTypes.get(local);
        if (!typeEl || visited.has(local)) {
            return false;
        }
        visited.add(local);
        for (const child of typeEl.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) === 'restriction') {
                const baseAttr: XMLAttribute | undefined = child.getAttribute('base');
                if (baseAttr) {
                    return XSDSemanticValidator.isIdType(baseAttr.getValue(), simpleTypes, visited);
                }
            }
        }
        return false;
    }

    private static checkElementRefConstraints(el: XMLElement): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'appinfo' || local === 'documentation') {
            return;
        }
        if (local === 'element') {
            const refAttr: XMLAttribute | undefined = el.getAttribute('ref');
            if (refAttr !== undefined) {
                const forbidden: string[] = ['name', 'type', 'nillable', 'default', 'fixed', 'abstract', 'form', 'block', 'substitutionGroup', 'final'];
                for (const attr of forbidden) {
                    if (el.getAttribute(attr) !== undefined) {
                        throw new Error('xs:element with "ref" cannot also have "' + attr + '"');
                    }
                }
            }
            if (el.getAttribute('default') !== undefined && el.getAttribute('fixed') !== undefined) {
                const elemName: string = el.getAttribute('name')?.getValue() ?? '(anonymous)';
                throw new Error('xs:element "' + elemName + '" cannot have both "default" and "fixed"');
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkElementRefConstraints(child);
        }
    }

    private static collectFacetsFromSimpleType(typeEl: XMLElement, simpleTypes: Map<string, XMLElement>, visited: Set<string>): SchemaFacets {
        const facets: SchemaFacets = {};
        for (const child of typeEl.getChildren()) {
            const childLocal: string = XSDSemanticValidator.localName(child.getName());
            if (childLocal === 'list') {
                facets.isList = true;
                return facets;
            }
            if (childLocal === 'restriction') {
                const baseAttr: XMLAttribute | undefined = child.getAttribute('base');
                let parentFacets: SchemaFacets | undefined;
                if (baseAttr) {
                    const baseLocal: string = XSDSemanticValidator.localName(baseAttr.getValue());
                    const baseEl: XMLElement | undefined = simpleTypes.get(baseLocal);
                    if (baseEl && !visited.has(baseLocal)) {
                        visited.add(baseLocal);
                        parentFacets = XSDSemanticValidator.collectFacetsFromSimpleType(baseEl, simpleTypes, visited);
                    }
                }
                const currentPatterns: string[] = [];
                for (const facetChild of child.getChildren()) {
                    const facetLocal: string = XSDSemanticValidator.localName(facetChild.getName());
                    const valueAttr: XMLAttribute | undefined = facetChild.getAttribute('value');
                    if (!valueAttr) {
                        continue;
                    }
                    const val: string = valueAttr.getValue();
                    if (facetLocal === 'enumeration') {
                        if (!facets.enumeration) { facets.enumeration = []; }
                        facets.enumeration.push(val);
                    } else if (facetLocal === 'pattern') {
                        currentPatterns.push(val);
                    } else if (facetLocal === 'minExclusive') {
                        facets.minExclusive = val;
                    } else if (facetLocal === 'maxExclusive') {
                        facets.maxExclusive = val;
                    } else if (facetLocal === 'minInclusive') {
                        facets.minInclusive = val;
                    } else if (facetLocal === 'maxInclusive') {
                        facets.maxInclusive = val;
                    } else if (facetLocal === 'length') {
                        facets.length = Number.parseInt(val, 10);
                    } else if (facetLocal === 'minLength') {
                        facets.minLength = Number.parseInt(val, 10);
                    } else if (facetLocal === 'maxLength') {
                        facets.maxLength = Number.parseInt(val, 10);
                    } else if (facetLocal === 'totalDigits') {
                        facets.totalDigits = Number.parseInt(val, 10);
                    } else if (facetLocal === 'fractionDigits') {
                        facets.fractionDigits = Number.parseInt(val, 10);
                    } else if (facetLocal === 'whiteSpace') {
                        facets.whiteSpace = val;
                    }
                }
                const patternGroups: string[][] = parentFacets && parentFacets.patterns ? parentFacets.patterns.slice() : [];
                if (currentPatterns.length > 0) {
                    patternGroups.push(currentPatterns);
                }
                if (patternGroups.length > 0) {
                    facets.patterns = patternGroups;
                }
                if (parentFacets) {
                    if (facets.enumeration === undefined && parentFacets.enumeration !== undefined) { facets.enumeration = parentFacets.enumeration; }
                    if (facets.minExclusive === undefined && parentFacets.minExclusive !== undefined) { facets.minExclusive = parentFacets.minExclusive; }
                    if (facets.maxExclusive === undefined && parentFacets.maxExclusive !== undefined) { facets.maxExclusive = parentFacets.maxExclusive; }
                    if (facets.minInclusive === undefined && parentFacets.minInclusive !== undefined) { facets.minInclusive = parentFacets.minInclusive; }
                    if (facets.maxInclusive === undefined && parentFacets.maxInclusive !== undefined) { facets.maxInclusive = parentFacets.maxInclusive; }
                    if (facets.length === undefined && parentFacets.length !== undefined) { facets.length = parentFacets.length; }
                    if (facets.minLength === undefined && parentFacets.minLength !== undefined) { facets.minLength = parentFacets.minLength; }
                    if (facets.maxLength === undefined && parentFacets.maxLength !== undefined) { facets.maxLength = parentFacets.maxLength; }
                    if (facets.totalDigits === undefined && parentFacets.totalDigits !== undefined) { facets.totalDigits = parentFacets.totalDigits; }
                    if (facets.fractionDigits === undefined && parentFacets.fractionDigits !== undefined) { facets.fractionDigits = parentFacets.fractionDigits; }
                    if (facets.whiteSpace === undefined && parentFacets.whiteSpace !== undefined) { facets.whiteSpace = parentFacets.whiteSpace; }
                    if (facets.isList === undefined && parentFacets.isList !== undefined) { facets.isList = parentFacets.isList; }
                }
                return facets;
            }
        }
        return facets;
    }

    private static resolveSimpleType(
        typeName: string,
        simpleTypes: Map<string, XMLElement>,
        visited: Set<string>
    ): { baseType: string, facets: SchemaFacets, variety: 'atomic' | 'list' | 'union', memberTypes: string[] } {
        const local: string = XSDSemanticValidator.localName(typeName);
        const typeEl: XMLElement | undefined = simpleTypes.get(local);
        if (!typeEl || visited.has(local)) {
            return { baseType: typeName, facets: {}, variety: 'atomic', memberTypes: [] };
        }
        visited.add(local);
        for (const child of typeEl.getChildren()) {
            const childLocal: string = XSDSemanticValidator.localName(child.getName());
            if (childLocal === 'list') {
                const itemTypeAttr: XMLAttribute | undefined = child.getAttribute('itemType');
                const itemType: string = itemTypeAttr ? itemTypeAttr.getValue() : 'xsd:string';
                return { baseType: itemType, facets: { isList: true }, variety: 'list', memberTypes: [] };
            }
            if (childLocal === 'union') {
                const members: string[] = [];
                const memberTypesAttr: XMLAttribute | undefined = child.getAttribute('memberTypes');
                if (memberTypesAttr) {
                    const names: string[] = memberTypesAttr.getValue().trim().split(/\s+/);
                    for (let i: number = 0; i < names.length; i++) {
                        members.push(names[i]);
                    }
                }
                for (const unionChild of child.getChildren()) {
                    if (XSDSemanticValidator.localName(unionChild.getName()) === 'simpleType') {
                        members.push('__inline__');
                    }
                }
                return { baseType: typeName, facets: {}, variety: 'union', memberTypes: members };
            }
            if (childLocal === 'restriction') {
                const baseAttr: XMLAttribute | undefined = child.getAttribute('base');
                if (baseAttr) {
                    const baseLocal: string = XSDSemanticValidator.localName(baseAttr.getValue());
                    if (!simpleTypes.has(baseLocal)) {
                        const facets: SchemaFacets = XSDSemanticValidator.collectFacetsFromSimpleType(typeEl, simpleTypes, new Set<string>());
                        return { baseType: baseAttr.getValue(), facets, variety: 'atomic', memberTypes: [] };
                    }
                    const result: { baseType: string, facets: SchemaFacets, variety: 'atomic' | 'list' | 'union', memberTypes: string[] } =
                        XSDSemanticValidator.resolveSimpleType(baseAttr.getValue(), simpleTypes, visited);
                    const myFacets: SchemaFacets = XSDSemanticValidator.collectFacetsFromSimpleType(typeEl, simpleTypes, new Set<string>());
                    const merged: SchemaFacets = Object.assign({}, result.facets, myFacets);
                    if (result.facets.patterns && myFacets.patterns) {
                        merged.patterns = result.facets.patterns.concat(myFacets.patterns);
                    }
                    return { baseType: result.baseType, facets: merged, variety: result.variety, memberTypes: result.memberTypes };
                }
            }
        }
        return { baseType: typeName, facets: {}, variety: 'atomic', memberTypes: [] };
    }

    private static isValidForResolvedType(value: string, typeName: string, simpleTypes: Map<string, XMLElement>): boolean {
        const local: string = XSDSemanticValidator.localName(typeName);
        if (!simpleTypes.has(local)) {
            return SchemaTypeValidator.validate(value, typeName);
        }
        const resolved: { baseType: string, facets: SchemaFacets, variety: 'atomic' | 'list' | 'union', memberTypes: string[] } =
            XSDSemanticValidator.resolveSimpleType(typeName, simpleTypes, new Set<string>());
        if (resolved.variety === 'list') {
            const items: string[] = value.trim().length === 0 ? [] : value.trim().split(/\s+/);
            for (let i: number = 0; i < items.length; i++) {
                if (!XSDSemanticValidator.isValidForResolvedType(items[i], resolved.baseType, simpleTypes)) {
                    return false;
                }
            }
            return true;
        }
        if (resolved.variety === 'union') {
            for (let i: number = 0; i < resolved.memberTypes.length; i++) {
                const member: string = resolved.memberTypes[i];
                if (member === '__inline__') {
                    continue;
                }
                if (XSDSemanticValidator.isValidForResolvedType(value, member, simpleTypes)) {
                    return true;
                }
            }
            return resolved.memberTypes.length === 0;
        }
        if (!SchemaTypeValidator.validate(value, resolved.baseType)) {
            return false;
        }
        return SchemaTypeValidator.validateFacets(value, resolved.facets, resolved.baseType);
    }

    private static getSimpleContentBase(typeName: string, complexTypes: Map<string, XMLElement>): string | undefined {
        const local: string = XSDSemanticValidator.localName(typeName);
        const typeEl: XMLElement | undefined = complexTypes.get(local);
        if (typeEl === undefined) {
            return undefined;
        }
        for (const child of typeEl.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) === 'simpleContent') {
                for (const scChild of child.getChildren()) {
                    const scLocal: string = XSDSemanticValidator.localName(scChild.getName());
                    if (scLocal === 'extension' || scLocal === 'restriction') {
                        const baseAttr: XMLAttribute | undefined = scChild.getAttribute('base');
                        if (baseAttr !== undefined) {
                            return baseAttr.getValue();
                        }
                    }
                }
            }
        }
        return undefined;
    }

    private static checkElementValueConstraints(el: XMLElement, simpleTypes: Map<string, XMLElement>, complexTypes: Map<string, XMLElement>): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'element' || local === 'attribute') {
            const fixedAttr: XMLAttribute | undefined = el.getAttribute('fixed');
            const defaultAttr: XMLAttribute | undefined = el.getAttribute('default');
            const constraintAttr: XMLAttribute | undefined = fixedAttr ?? defaultAttr;
            if (constraintAttr !== undefined) {
                const constraintKind: string = fixedAttr !== undefined ? 'fixed' : 'default';
                const declName: string = el.getAttribute('name')?.getValue() ?? '(anonymous)';
                const typeAttr: XMLAttribute | undefined = el.getAttribute('type');
                if (typeAttr) {
                    if (local === 'element' && XSDSemanticValidator.isIdType(typeAttr.getValue(), simpleTypes, new Set<string>())) {
                        throw new Error('Element "' + declName + '" with xs:ID type may not have a "' + constraintKind + '" value constraint');
                    }
                    const value: string = constraintAttr.getValue();
                    const typeLocalName: string = XSDSemanticValidator.localName(typeAttr.getValue());
                    if (complexTypes.has(typeLocalName)) {
                        const simpleBase: string | undefined = XSDSemanticValidator.getSimpleContentBase(typeLocalName, complexTypes);
                        if (simpleBase === undefined) {
                            throw new Error('Element "' + declName + '" type "' + typeLocalName + '" does not have simple content; a "' + constraintKind + '" value constraint is not allowed');
                        }
                        if (!XSDSemanticValidator.isValidForResolvedType(value, simpleBase, simpleTypes)) {
                            throw new Error('Element "' + declName + '" has invalid ' + constraintKind + ' value "' + value + '" for type "' + typeAttr.getValue() + '"');
                        }
                    } else if (!XSDSemanticValidator.isValidForResolvedType(value, typeAttr.getValue(), simpleTypes)) {
                        const kind: string = local === 'element' ? 'Element' : 'Attribute';
                        throw new Error(kind + ' "' + declName + '" has invalid ' + constraintKind + ' value "' + value + '" for type "' + typeAttr.getValue() + '"');
                    }
                }
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkElementValueConstraints(child, simpleTypes, complexTypes);
        }
    }

    private static checkAllNesting(el: XMLElement, insideCompositor: boolean): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'appinfo' || local === 'documentation') {
            return;
        }
        if (insideCompositor && local === 'all') {
            throw new Error('xs:all may not appear inside xs:sequence or xs:choice');
        }
        if (local === 'all') {
            for (const child of el.getChildren()) {
                const childLocal: string = XSDSemanticValidator.localName(child.getName());
                if (childLocal !== 'element' && childLocal !== 'annotation') {
                    throw new Error('xs:all may only contain xs:element particles, found xs:' + childLocal);
                }
                if (childLocal === 'element') {
                    const maxOccursAttr: XMLAttribute | undefined = child.getAttribute('maxOccurs');
                    if (maxOccursAttr !== undefined) {
                        const maxVal: string = maxOccursAttr.getValue();
                        if (maxVal !== '0' && maxVal !== '1') {
                            const elemName: string = child.getAttribute('name')?.getValue() ?? child.getAttribute('ref')?.getValue() ?? '(anonymous)';
                            throw new Error('xs:element "' + elemName + '" inside xs:all must have maxOccurs of 0 or 1');
                        }
                    }
                }
            }
        }
        const resetsContext: boolean = local === 'element' || local === 'complexType';
        const isCompositor: boolean = local === 'sequence' || local === 'choice';
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkAllNesting(child, resetsContext ? false : (insideCompositor || isCompositor));
        }
    }

    private static checkKeyrefReferences(schemaRoot: XMLElement): void {
        const allConstraintNames: Set<string> = new Set<string>();
        const keyUniqueNames: Set<string> = new Set<string>();
        const fieldCounts: Map<string, number> = new Map<string, number>();
        XSDSemanticValidator.collectKeyUniqueNames(schemaRoot, allConstraintNames, keyUniqueNames, fieldCounts);
        XSDSemanticValidator.validateKeyrefRefer(schemaRoot, keyUniqueNames, fieldCounts);
    }

    private static countFields(el: XMLElement): number {
        let count: number = 0;
        for (const child of el.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) === 'field') {
                count++;
            }
        }
        return count;
    }

    private static collectKeyUniqueNames(el: XMLElement, allNames: Set<string>, keyUniqueNames: Set<string>, fieldCounts: Map<string, number>): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'key' || local === 'unique' || local === 'keyref') {
            const nameAttr: XMLAttribute | undefined = el.getAttribute('name');
            if (nameAttr) {
                const constraintName: string = nameAttr.getValue();
                if (allNames.has(constraintName)) {
                    throw new Error('Duplicate identity constraint name: "' + constraintName + '"');
                }
                allNames.add(constraintName);
                if (local === 'key' || local === 'unique') {
                    keyUniqueNames.add(constraintName);
                    fieldCounts.set(constraintName, XSDSemanticValidator.countFields(el));
                }
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.collectKeyUniqueNames(child, allNames, keyUniqueNames, fieldCounts);
        }
    }

    private static validateKeyrefRefer(el: XMLElement, keyUniqueNames: Set<string>, fieldCounts: Map<string, number>): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'keyref') {
            const referAttr: XMLAttribute | undefined = el.getAttribute('refer');
            if (referAttr) {
                const referValue: string = referAttr.getValue();
                const referLocal: string = XSDSemanticValidator.localName(referValue);
                if (!keyUniqueNames.has(referLocal)) {
                    const nameAttr: XMLAttribute | undefined = el.getAttribute('name');
                    const keyrefName: string = nameAttr ? nameAttr.getValue() : '(anonymous)';
                    throw new Error('xs:keyref "' + keyrefName + '" refers to undeclared key or unique: "' + referValue + '"');
                }
                const keyrefFieldCount: number = XSDSemanticValidator.countFields(el);
                const targetFieldCount: number | undefined = fieldCounts.get(referLocal);
                if (targetFieldCount !== undefined && keyrefFieldCount !== targetFieldCount) {
                    const nameAttr: XMLAttribute | undefined = el.getAttribute('name');
                    const keyrefName: string = nameAttr ? nameAttr.getValue() : '(anonymous)';
                    throw new Error('xs:keyref "' + keyrefName + '" has ' + keyrefFieldCount + ' field(s) but referred constraint "' + referValue + '" has ' + targetFieldCount);
                }
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.validateKeyrefRefer(child, keyUniqueNames, fieldCounts);
        }
    }

    private static checkIdentityConstraintPlacement(el: XMLElement, parentIsElement: boolean): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'appinfo' || local === 'documentation') {
            return;
        }
        if (local === 'key' || local === 'unique' || local === 'keyref') {
            if (!parentIsElement) {
                throw new Error('xs:' + local + ' must be a direct child of xs:element');
            }
            const nameAttr: XMLAttribute | undefined = el.getAttribute('name');
            if (nameAttr && !XMLUtils.isValidNCName(nameAttr.getValue())) {
                throw new Error('xs:' + local + ' "name" attribute must be a valid NCName, got: "' + nameAttr.getValue() + '"');
            }
            let selectorCount: number = 0;
            let fieldCount: number = 0;
            for (const child of el.getChildren()) {
                const childLocal: string = XSDSemanticValidator.localName(child.getName());
                if (childLocal === 'selector') {
                    selectorCount++;
                    const selectorXpathAttr: XMLAttribute | undefined = child.getAttribute('xpath');
                    if (!selectorXpathAttr) {
                        throw new Error('xs:selector is missing required "xpath" attribute');
                    }
                    XSDSemanticValidator.validateSelectorXPath(selectorXpathAttr.getValue());
                } else if (childLocal === 'field') {
                    fieldCount++;
                    const fieldXpathAttr: XMLAttribute | undefined = child.getAttribute('xpath');
                    if (!fieldXpathAttr) {
                        throw new Error('xs:field is missing required "xpath" attribute');
                    }
                    XSDSemanticValidator.validateFieldXPath(fieldXpathAttr.getValue());
                } else if (childLocal !== 'annotation') {
                    throw new Error('xs:' + local + ' contains invalid child element xs:' + childLocal);
                }
            }
            if (selectorCount !== 1) {
                throw new Error('xs:' + local + ' must have exactly one xs:selector child');
            }
            if (fieldCount < 1) {
                throw new Error('xs:' + local + ' must have at least one xs:field child');
            }
            return;
        }
        if (local === 'selector' || local === 'field') {
            throw new Error('xs:' + local + ' must appear inside xs:key, xs:unique, or xs:keyref');
        }
        const isElement: boolean = local === 'element';
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkIdentityConstraintPlacement(child, isElement);
        }
    }

    private static gatherAttributeNames(el: XMLElement, names: Set<string>): void {
        for (const child of el.getChildren()) {
            const childLocal: string = XSDSemanticValidator.localName(child.getName());
            if (childLocal === 'attribute') {
                const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
                if (nameAttr) {
                    names.add(nameAttr.getValue());
                }
            }
            XSDSemanticValidator.gatherAttributeNames(child, names);
        }
    }

    private static collectBaseAttributeNames(
        typeName: string,
        complexTypes: Map<string, XMLElement>,
        visited: Set<string>
    ): Set<string> {
        const names: Set<string> = new Set<string>();
        const local: string = XSDSemanticValidator.localName(typeName);
        if (visited.has(local)) {
            return names;
        }
        visited.add(local);
        const typeEl: XMLElement | undefined = complexTypes.get(local);
        if (!typeEl) {
            return names;
        }
        XSDSemanticValidator.gatherAttributeNames(typeEl, names);
        for (const contentChild of typeEl.getChildren()) {
            const contentLocal: string = XSDSemanticValidator.localName(contentChild.getName());
            if (contentLocal !== 'complexContent' && contentLocal !== 'simpleContent') {
                continue;
            }
            for (const derivChild of contentChild.getChildren()) {
                const baseAttr: XMLAttribute | undefined = derivChild.getAttribute('base');
                if (baseAttr) {
                    const inherited: Set<string> = XSDSemanticValidator.collectBaseAttributeNames(
                        baseAttr.getValue(), complexTypes, visited
                    );
                    for (const n of inherited) {
                        names.add(n);
                    }
                }
            }
        }
        return names;
    }

    private static findAnyAttributeConstraint(el: XMLElement): string | undefined {
        for (const child of el.getChildren()) {
            const ln: string = XSDSemanticValidator.localName(child.getName());
            if (ln === 'anyAttribute') {
                const nsAttr: XMLAttribute | undefined = child.getAttribute('namespace');
                return nsAttr ? nsAttr.getValue() : '##any';
            }
            if (ln === 'complexContent' || ln === 'simpleContent' || ln === 'extension' || ln === 'restriction' || ln === 'complexType') {
                const found: string | undefined = XSDSemanticValidator.findAnyAttributeConstraint(child);
                if (found !== undefined) {
                    return found;
                }
            }
        }
        return undefined;
    }

    private static expandWildcardTokens(ns: string, targetNs: string): Set<string> | 'other' {
        if (ns === '##other') {
            return 'other';
        }
        const result: Set<string> = new Set<string>();
        for (const token of ns.split(/\s+/)) {
            if (token === '##local') {
                result.add('');
            } else if (token === '##targetNamespace') {
                result.add(targetNs);
            } else {
                result.add(token);
            }
        }
        return result;
    }

    private static isAnyAttributeSubset(derived: string, base: string, targetNs: string): boolean {
        if (base === '##any') {
            return true;
        }
        if (derived === '##any') {
            return false;
        }
        const parsedDerived: Set<string> | 'other' = XSDSemanticValidator.expandWildcardTokens(derived, targetNs);
        const parsedBase: Set<string> | 'other' = XSDSemanticValidator.expandWildcardTokens(base, targetNs);
        if (parsedDerived === 'other' && parsedBase === 'other') {
            return true;
        }
        if (parsedDerived === 'other') {
            return false;
        }
        if (parsedBase === 'other') {
            for (const u of parsedDerived) {
                if (u === '' || u === targetNs) {
                    return false;
                }
            }
            return true;
        }
        for (const u of parsedDerived) {
            if (!parsedBase.has(u)) {
                return false;
            }
        }
        return true;
    }

    private static checkComplexRestrictionAttributes(schemaRoot: XMLElement, complexTypes: Map<string, XMLElement>): void {
        const targetNsAttr: XMLAttribute | undefined = schemaRoot.getAttribute('targetNamespace');
        const targetNs: string = targetNsAttr ? targetNsAttr.getValue() : '';
        for (const typeEl of complexTypes.values()) {
            for (const contentChild of typeEl.getChildren()) {
                const contentLocal: string = XSDSemanticValidator.localName(contentChild.getName());
                if (contentLocal !== 'complexContent' && contentLocal !== 'simpleContent') {
                    continue;
                }
                for (const derivChild of contentChild.getChildren()) {
                    if (XSDSemanticValidator.localName(derivChild.getName()) !== 'restriction') {
                        continue;
                    }
                    const baseAttr: XMLAttribute | undefined = derivChild.getAttribute('base');
                    if (!baseAttr) {
                        continue;
                    }
                    const baseLocal: string = XSDSemanticValidator.localName(baseAttr.getValue());
                    const baseEl: XMLElement | undefined = complexTypes.get(baseLocal);
                    if (!baseEl) {
                        continue;
                    }
                    const baseWildcard: string | undefined = XSDSemanticValidator.findAnyAttributeConstraint(baseEl);
                    const derivedWildcard: string | undefined = XSDSemanticValidator.findAnyAttributeConstraint(derivChild);
                    if (derivedWildcard !== undefined) {
                        const typeName: string = typeEl.getAttribute('name')?.getValue() ?? '(anonymous)';
                        if (baseWildcard === undefined) {
                            throw new Error(
                                'xs:complexType "' + typeName + '" restriction adds an xs:anyAttribute wildcard not present in base type "' + baseLocal + '"'
                            );
                        }
                        if (!XSDSemanticValidator.isAnyAttributeSubset(derivedWildcard, baseWildcard, targetNs)) {
                            throw new Error(
                                'xs:complexType "' + typeName + '" restriction xs:anyAttribute "' + derivedWildcard +
                                '" is not a subset of base type "' + baseLocal + '" xs:anyAttribute "' + baseWildcard + '"'
                            );
                        }
                    }
                    if (baseWildcard !== undefined) {
                        continue;
                    }
                    const baseAttrs: Set<string> = XSDSemanticValidator.collectBaseAttributeNames(
                        baseLocal, complexTypes, new Set<string>()
                    );
                    for (const restrictionChild of derivChild.getChildren()) {
                        if (XSDSemanticValidator.localName(restrictionChild.getName()) !== 'attribute') {
                            continue;
                        }
                        const nameAttr: XMLAttribute | undefined = restrictionChild.getAttribute('name');
                        if (nameAttr && !baseAttrs.has(nameAttr.getValue())) {
                            const typeName: string = typeEl.getAttribute('name')?.getValue() ?? '(anonymous)';
                            throw new Error(
                                'xs:complexType "' + typeName + '" restriction adds attribute "' +
                                nameAttr.getValue() + '" not present in base type "' + baseLocal + '"'
                            );
                        }
                    }
                }
            }
        }
    }

    private static isValidNameTest(token: string): boolean {
        if (token === '*') {
            return true;
        }
        const colonIdx: number = token.indexOf(':');
        if (colonIdx !== -1) {
            const prefix: string = token.substring(0, colonIdx);
            const local: string = token.substring(colonIdx + 1);
            if (!XMLUtils.isValidNCName(prefix)) {
                return false;
            }
            if (local === '*') {
                return true;
            }
            return XMLUtils.isValidNCName(local);
        }
        return XMLUtils.isValidNCName(token);
    }

    private static validateSelectorXPath(xpath: string): void {
        const alternatives: string[] = xpath.split('|');
        for (const raw of alternatives) {
            const alt: string = raw.trim();
            if (alt.length === 0) {
                throw new Error('xs:selector xpath contains empty path alternative: "' + xpath + '"');
            }
            let rest: string = alt;
            if (rest.startsWith('.//')) {
                rest = rest.substring(3);
                if (rest.length === 0) {
                    throw new Error('xs:selector xpath ".//" has no step after descendant axis in: "' + xpath + '"');
                }
            }
            if (rest.indexOf('//') !== -1) {
                throw new Error('xs:selector xpath contains "//" in invalid position in: "' + xpath + '"');
            }
            const steps: string[] = rest.split('/');
            for (const rawStep of steps) {
                const step: string = rawStep.trim();
                if (step.length === 0) {
                    throw new Error('xs:selector xpath contains empty step in: "' + xpath + '"');
                }
                if (step === '.') {
                    continue;
                }
                if (step.startsWith('@') || step.startsWith('attribute::')) {
                    throw new Error('xs:selector xpath must not contain attribute steps in: "' + xpath + '"');
                }
                const nameTest: string = step.startsWith('child::') ? step.substring(7) : step;
                if (!XSDSemanticValidator.isValidNameTest(nameTest)) {
                    throw new Error('xs:selector xpath contains invalid step "' + step + '" in: "' + xpath + '"');
                }
            }
        }
    }

    private static validateFieldXPath(xpath: string): void {
        const alternatives: string[] = xpath.split('|');
        for (const raw of alternatives) {
            const alt: string = raw.trim();
            if (alt.length === 0) {
                throw new Error('xs:field xpath contains empty path alternative: "' + xpath + '"');
            }
            if (alt === '.') {
                continue;
            }
            let rest: string = alt;
            if (rest.startsWith('.//')) {
                rest = rest.substring(3);
                if (rest.length === 0) {
                    throw new Error('xs:field xpath ".//" has no step after descendant axis in: "' + xpath + '"');
                }
            } else if (rest.startsWith('./')) {
                rest = rest.substring(2);
            }
            if (rest.indexOf('//') !== -1) {
                throw new Error('xs:field xpath contains "//" in invalid position in: "' + xpath + '"');
            }
            const steps: string[] = rest.split('/');
            for (let si: number = 0; si < steps.length; si++) {
                const step: string = steps[si].trim();
                if (step.length === 0) {
                    throw new Error('xs:field xpath contains empty step in: "' + xpath + '"');
                }
                const isLast: boolean = si === steps.length - 1;
                if (step.startsWith('@') || step.startsWith('attribute::')) {
                    if (!isLast) {
                        throw new Error('xs:field xpath contains attribute step in non-final position "' + step + '" in: "' + xpath + '"');
                    }
                    const nameTest: string = step.startsWith('attribute::') ? step.substring(11) : step.substring(1);
                    if (!XSDSemanticValidator.isValidNameTest(nameTest)) {
                        throw new Error('xs:field xpath contains invalid attribute step "' + step + '" in: "' + xpath + '"');
                    }
                } else {
                    if (step === '.') {
                        continue;
                    }
                    const nameTest: string = step.startsWith('child::') ? step.substring(7) : step;
                    if (!XSDSemanticValidator.isValidNameTest(nameTest)) {
                        throw new Error('xs:field xpath contains invalid step "' + step + '" in: "' + xpath + '"');
                    }
                }
            }
        }
    }

    private static checkAttributeUseConstraints(el: XMLElement): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'appinfo' || local === 'documentation') {
            return;
        }
        if (local === 'attribute') {
            const useAttr: XMLAttribute | undefined = el.getAttribute('use');
            const useValue: string | undefined = useAttr?.getValue();
            const attrName: string = el.getAttribute('name')?.getValue() ?? '(anonymous)';
            if (useValue === 'required' && el.getAttribute('default') !== undefined) {
                throw new Error('xs:attribute "' + attrName + '" with use="required" cannot have "default"');
            }
            if (useValue === 'prohibited') {
                if (el.getAttribute('fixed') !== undefined) {
                    throw new Error('xs:attribute "' + attrName + '" with use="prohibited" cannot have "fixed"');
                }
                if (el.getAttribute('default') !== undefined) {
                    throw new Error('xs:attribute "' + attrName + '" with use="prohibited" cannot have "default"');
                }
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkAttributeUseConstraints(child);
        }
    }

    private static checkOccurrenceConstraints(el: XMLElement): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'appinfo' || local === 'documentation') {
            return;
        }
        const OCCURRENCE_ELEMENTS: Set<string> = new Set(['element', 'group', 'choice', 'sequence', 'all', 'any']);
        if (OCCURRENCE_ELEMENTS.has(local)) {
            const minOccursAttr: XMLAttribute | undefined = el.getAttribute('minOccurs');
            if (minOccursAttr !== undefined && !/^\d+$/.test(minOccursAttr.getValue())) {
                throw new Error('xs:' + local + ' minOccurs must be a non-negative integer, got: "' + minOccursAttr.getValue() + '"');
            }
            const maxOccursAttr: XMLAttribute | undefined = el.getAttribute('maxOccurs');
            if (maxOccursAttr !== undefined) {
                const maxVal: string = maxOccursAttr.getValue();
                if (maxVal !== 'unbounded' && !/^\d+$/.test(maxVal)) {
                    throw new Error('xs:' + local + ' maxOccurs must be a non-negative integer or "unbounded", got: "' + maxVal + '"');
                }
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkOccurrenceConstraints(child);
        }
    }

    private static checkSimpleTypeChildren(el: XMLElement): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'appinfo' || local === 'documentation') {
            return;
        }
        if (local === 'simpleType') {
            const VALID_CHILDREN: Set<string> = new Set(['restriction', 'list', 'union']);
            let count: number = 0;
            for (const child of el.getChildren()) {
                const childLocal: string = XSDSemanticValidator.localName(child.getName());
                if (VALID_CHILDREN.has(childLocal)) {
                    count++;
                }
            }
            if (count !== 1) {
                const nameAttr: string = el.getAttribute('name')?.getValue() ?? '(anonymous)';
                throw new Error('xs:simpleType "' + nameAttr + '" must have exactly one of xs:restriction, xs:list, or xs:union, found ' + count);
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkSimpleTypeChildren(child);
        }
    }

    private static checkListUnionConstraints(el: XMLElement): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'appinfo' || local === 'documentation') {
            return;
        }
        if (local === 'list') {
            const hasItemType: boolean = el.getAttribute('itemType') !== undefined;
            const hasInlineType: boolean = el.getChildren().some(
                (c: XMLElement) => XSDSemanticValidator.localName(c.getName()) === 'simpleType'
            );
            if (hasItemType && hasInlineType) {
                throw new Error('xs:list cannot have both "itemType" attribute and an inline xs:simpleType child');
            }
            if (!hasItemType && !hasInlineType) {
                throw new Error('xs:list must have either an "itemType" attribute or an inline xs:simpleType child');
            }
        }
        if (local === 'union') {
            const memberTypesAttr: XMLAttribute | undefined = el.getAttribute('memberTypes');
            const hasMemberTypes: boolean = memberTypesAttr !== undefined && memberTypesAttr.getValue().trim() !== '';
            const hasInlineType: boolean = el.getChildren().some(
                (c: XMLElement) => XSDSemanticValidator.localName(c.getName()) === 'simpleType'
            );
            if (!hasMemberTypes && !hasInlineType) {
                throw new Error('xs:union must have at least one memberTypes item or an inline xs:simpleType child');
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkListUnionConstraints(child);
        }
    }

    private static checkComplexTypeContentModel(el: XMLElement): void {
        const local: string = XSDSemanticValidator.localName(el.getName());
        if (local === 'appinfo' || local === 'documentation') {
            return;
        }
        if (local === 'complexType') {
            const typeName: string = el.getAttribute('name')?.getValue() ?? '(anonymous)';
            let hasSimpleContent: boolean = false;
            let hasComplexContent: boolean = false;
            for (const child of el.getChildren()) {
                const childLocal: string = XSDSemanticValidator.localName(child.getName());
                if (childLocal === 'simpleContent') {
                    hasSimpleContent = true;
                }
                if (childLocal === 'complexContent') {
                    hasComplexContent = true;
                }
            }
            if (hasSimpleContent && hasComplexContent) {
                throw new Error('xs:complexType "' + typeName + '" cannot have both simpleContent and complexContent');
            }
            const mixedAttr: XMLAttribute | undefined = el.getAttribute('mixed');
            if (hasSimpleContent && mixedAttr !== undefined && mixedAttr.getValue() === 'true') {
                throw new Error('xs:complexType "' + typeName + '" with simpleContent cannot also have mixed="true"');
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkComplexTypeContentModel(child);
        }
    }

    private static checkGroupCompositorCount(schemaRoot: XMLElement): void {
        for (const child of schemaRoot.getChildren()) {
            const childLocal: string = XSDSemanticValidator.localName(child.getName());
            if (childLocal !== 'group') {
                continue;
            }
            const groupName: string = child.getAttribute('name')?.getValue() ?? '(anonymous)';
            const compositors: Array<string> = [];
            for (const gc of child.getChildren()) {
                const gcLocal: string = XSDSemanticValidator.localName(gc.getName());
                if (gcLocal !== 'annotation') {
                    compositors.push(gcLocal);
                }
            }
            if (compositors.length !== 1) {
                throw new Error('xs:group "' + groupName + '" must have exactly one compositor child (all, choice, or sequence), found ' + compositors.length);
            }
        }
    }

    private static validateDerivationSet(value: string, attrName: string, allowedTokens: Set<string>): void {
        const trimmed: string = value.trim();
        if (trimmed === '#all') { return; }
        for (const token of trimmed.split(/\s+/)) {
            if (token && !allowedTokens.has(token)) {
                throw new Error('Invalid token "' + token + '" in xs:' + attrName + ' attribute');
            }
        }
    }

    private static checkBlockFinalAttributes(el: XMLElement): void {
        const localEl: string = XSDSemanticValidator.localName(el.getName());
        if (localEl === 'element') {
            const blockAttr: XMLAttribute | undefined = el.getAttribute('block');
            if (blockAttr) {
                XSDSemanticValidator.validateDerivationSet(blockAttr.getValue(), 'block', new Set(['extension', 'restriction', 'substitution']));
            }
            const finalAttr: XMLAttribute | undefined = el.getAttribute('final');
            if (finalAttr) {
                XSDSemanticValidator.validateDerivationSet(finalAttr.getValue(), 'final', new Set(['extension', 'restriction']));
            }
        } else if (localEl === 'complexType') {
            const blockAttr: XMLAttribute | undefined = el.getAttribute('block');
            if (blockAttr) {
                XSDSemanticValidator.validateDerivationSet(blockAttr.getValue(), 'block', new Set(['extension', 'restriction']));
            }
            const finalAttr: XMLAttribute | undefined = el.getAttribute('final');
            if (finalAttr) {
                XSDSemanticValidator.validateDerivationSet(finalAttr.getValue(), 'final', new Set(['extension', 'restriction']));
            }
        } else if (localEl === 'simpleType') {
            const finalAttr: XMLAttribute | undefined = el.getAttribute('final');
            if (finalAttr) {
                XSDSemanticValidator.validateDerivationSet(finalAttr.getValue(), 'final', new Set(['list', 'union', 'restriction', 'extension']));
            }
        } else if (localEl === 'schema') {
            const blockDefaultAttr: XMLAttribute | undefined = el.getAttribute('blockDefault');
            if (blockDefaultAttr) {
                XSDSemanticValidator.validateDerivationSet(blockDefaultAttr.getValue(), 'blockDefault', new Set(['extension', 'restriction', 'substitution']));
            }
            const finalDefaultAttr: XMLAttribute | undefined = el.getAttribute('finalDefault');
            if (finalDefaultAttr) {
                XSDSemanticValidator.validateDerivationSet(finalDefaultAttr.getValue(), 'finalDefault', new Set(['extension', 'restriction', 'list', 'union']));
            }
        }
        for (const child of el.getChildren()) {
            XSDSemanticValidator.checkBlockFinalAttributes(child);
        }
    }

    private static checkSubstitutionGroupFinalConstraints(
        schemaRoot: XMLElement,
        allComplexTypes: Map<string, XMLElement>
    ): void {
        const topLevelElements: Map<string, XMLElement> = new Map<string, XMLElement>();
        for (const child of schemaRoot.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) === 'element') {
                const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
                if (nameAttr) {
                    topLevelElements.set(nameAttr.getValue(), child);
                }
            }
        }
        for (const [, memberEl] of topLevelElements) {
            const sgAttr: XMLAttribute | undefined = memberEl.getAttribute('substitutionGroup');
            if (!sgAttr) { continue; }
            const headName: string = XSDSemanticValidator.localName(sgAttr.getValue().trim());
            const headEl: XMLElement | undefined = topLevelElements.get(headName);
            if (!headEl) { continue; }
            const headFinalAttr: XMLAttribute | undefined = headEl.getAttribute('final');
            if (!headFinalAttr) { continue; }
            const headFinal: string = headFinalAttr.getValue().trim();
            if (headFinal.length === 0) { continue; }
            const headTypeAttr: XMLAttribute | undefined = headEl.getAttribute('type');
            if (!headTypeAttr) { continue; }
            const headTypeName: string = XSDSemanticValidator.localName(headTypeAttr.getValue().trim());
            const derivMethod: string | undefined = XSDSemanticValidator.findDerivationFromType(memberEl, headTypeName, allComplexTypes);
            if (derivMethod === undefined) { continue; }
            const headFinalTokens: string[] = headFinal.split(/\s+/);
            if (headFinalTokens.indexOf('#all') !== -1 || headFinalTokens.indexOf(derivMethod) !== -1) {
                const memberName: string = memberEl.getAttribute('name')?.getValue() ?? '(anonymous)';
                throw new Error(
                    'Element "' + memberName + '" cannot be a member of substitution group headed by "' + headName +
                    '": head element has final="' + headFinal + '" which prohibits derivation by ' + derivMethod
                );
            }
        }
    }

    private static findDerivationFromType(
        memberEl: XMLElement,
        headTypeName: string,
        allComplexTypes: Map<string, XMLElement>
    ): string | undefined {
        for (const child of memberEl.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) === 'complexType') {
                return XSDSemanticValidator.findDerivationInComplexType(child, headTypeName, allComplexTypes, new Set<string>());
            }
        }
        const typeAttr: XMLAttribute | undefined = memberEl.getAttribute('type');
        if (typeAttr) {
            const typeName: string = XSDSemanticValidator.localName(typeAttr.getValue().trim());
            const typeEl: XMLElement | undefined = allComplexTypes.get(typeName);
            if (typeEl) {
                return XSDSemanticValidator.findDerivationInComplexType(typeEl, headTypeName, allComplexTypes, new Set<string>());
            }
        }
        return undefined;
    }

    private static findDerivationInComplexType(
        typeEl: XMLElement,
        headTypeName: string,
        allComplexTypes: Map<string, XMLElement>,
        visited: Set<string>
    ): string | undefined {
        for (const child of typeEl.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) !== 'complexContent') { continue; }
            for (const derivChild of child.getChildren()) {
                const derivLocal: string = XSDSemanticValidator.localName(derivChild.getName());
                if (derivLocal !== 'extension' && derivLocal !== 'restriction') { continue; }
                const baseAttr: XMLAttribute | undefined = derivChild.getAttribute('base');
                if (!baseAttr) { continue; }
                const baseName: string = XSDSemanticValidator.localName(baseAttr.getValue().trim());
                if (baseName === headTypeName) {
                    return derivLocal;
                }
                if (!visited.has(baseName)) {
                    visited.add(baseName);
                    const baseEl: XMLElement | undefined = allComplexTypes.get(baseName);
                    if (baseEl) {
                        const indirect: string | undefined = XSDSemanticValidator.findDerivationInComplexType(baseEl, headTypeName, allComplexTypes, visited);
                        if (indirect !== undefined) {
                            return indirect;
                        }
                    }
                }
            }
        }
        return undefined;
    }

    private static localName(name: string): string {
        const idx: number = name.indexOf(':');
        return idx !== -1 ? name.substring(idx + 1) : name;
    }
}
