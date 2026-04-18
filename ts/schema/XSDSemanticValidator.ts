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

export class XSDSemanticValidator {

    static validate(schemaRoot: XMLElement): void {
        XSDSemanticValidator.checkNamedComponents(schemaRoot);
        XSDSemanticValidator.checkAnnotationCount(schemaRoot);
        XSDSemanticValidator.checkNotationAttributes(schemaRoot);
        XSDSemanticValidator.checkNotationPlacement(schemaRoot, true);
        XSDSemanticValidator.checkIdAttributes(schemaRoot);
        XSDSemanticValidator.checkFacetValues(schemaRoot);
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
