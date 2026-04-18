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

const NAMED_COMPONENTS: Set<string> = new Set<string>([
    'element',
    'attribute',
    'complexType',
    'simpleType',
    'group',
    'attributeGroup',
    'notation'
]);

const NC_NAME_PATTERN: RegExp =
    /^[A-Za-z_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][A-Za-z0-9_\-\.\u00B7\u0300-\u036F\u203F-\u2040\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]*$/;

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

export class XSDSemanticValidator {

    static validate(schemaRoot: XMLElement): void {
        XSDSemanticValidator.checkNamedComponents(schemaRoot);
        XSDSemanticValidator.checkAnnotationCount(schemaRoot);
        XSDSemanticValidator.checkNotationAttributes(schemaRoot);
        XSDSemanticValidator.checkNotationPlacement(schemaRoot, true);
        XSDSemanticValidator.checkIdAttributes(schemaRoot);
        XSDSemanticValidator.checkDuplicateIds(schemaRoot);
        XSDSemanticValidator.checkIncludeRedefine(schemaRoot);
        XSDSemanticValidator.checkDuplicateImports(schemaRoot);
        XSDSemanticValidator.checkFacetValues(schemaRoot);
        const simpleTypes: Map<string, XMLElement> = XSDSemanticValidator.collectSimpleTypes(schemaRoot);
        XSDSemanticValidator.checkSimpleTypeRestrictions(schemaRoot, simpleTypes);
        XSDSemanticValidator.checkFinalConstraints(schemaRoot, simpleTypes);
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
            if (!XSDSemanticValidator.isNCName(value)) {
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

    private static checkIdAttributes(el: XMLElement): void {
        const idAttr: XMLAttribute | undefined = el.getAttribute('id');
        if (idAttr) {
            const value: string = idAttr.getValue();
            if (!XSDSemanticValidator.isNCName(value)) {
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

    private static checkDuplicateImports(schemaRoot: XMLElement): void {
        const seenNamespaces: Set<string> = new Set<string>();
        for (const child of schemaRoot.getChildren()) {
            if (XSDSemanticValidator.localName(child.getName()) !== 'import') {
                continue;
            }
            const nsAttr: XMLAttribute | undefined = child.getAttribute('namespace');
            if (nsAttr) {
                const ns: string = nsAttr.getValue();
                if (seenNamespaces.has(ns)) {
                    throw new Error('Duplicate xs:import for namespace: "' + ns + '"');
                }
                seenNamespaces.add(ns);
            }
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
                if (!/^[0-9]+$/.test(raw) || parseInt(raw, 10) < 1) {
                    throw new Error('xs:totalDigits value must be a positive integer, got: "' + raw + '"');
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

    private static isNCName(value: string): boolean {
        if (value.length === 0) {
            return false;
        }
        return NC_NAME_PATTERN.test(value);
    }

    private static localName(name: string): string {
        const idx: number = name.indexOf(':');
        return idx !== -1 ? name.substring(idx + 1) : name;
    }
}
