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

import { Catalog } from '../Catalog.js';
import { XMLSchemaParser } from '../XMLSchemaParser.js';
import { XMLAttribute } from '../XMLAttribute.js';
import { XMLElement } from '../XMLElement.js';
import { AttributeUse } from '../grammar/Grammar.js';
import { SchemaAll } from './SchemaAll.js';
import { SchemaAttributeDecl } from './SchemaAttributeDecl.js';
import { SchemaChoice } from './SchemaChoice.js';
import { SchemaContentModel } from './SchemaContentModel.js';
import { SchemaElementDecl } from './SchemaElementDecl.js';
import { SchemaElementParticle } from './SchemaElementParticle.js';
import { SchemaGrammar } from './SchemaGrammar.js';
import { SchemaParticle } from './SchemaParticle.js';
import { SchemaSequence } from './SchemaSequence.js';
import { SchemaWildcardParticle } from './SchemaWildcardParticle.js';

type ElementInfo = {
    element: XMLElement;
    namespace?: string;
    localName: string;
};

export class SchemaBuilder extends XMLSchemaParser {

    private modelGroupDefinitions: Map<string, XMLElement>;
    private substitutionGroups: Map<string, Set<string>>;

    constructor(catalog?: Catalog) {
        super(catalog);
        this.modelGroupDefinitions = new Map<string, XMLElement>();
        this.substitutionGroups = new Map<string, Set<string>>();
    }

    buildGrammar(schemaPath: string): SchemaGrammar {
        this.resetWorkingState();
        this.modelGroupDefinitions = new Map<string, XMLElement>();
        this.substitutionGroups = new Map<string, Set<string>>();
        this.walkSchema(this.normalizePath(schemaPath));

        // Build substitution groups map: headLocalName -> set of member localNames.
        for (const [, info] of this.elementDefinitions) {
            const sgAttr: XMLAttribute | undefined = info.element.getAttribute('substitutionGroup');
            if (!sgAttr) {
                continue;
            }
            const headQName: string = sgAttr.getValue().trim();
            const colonIdx: number = headQName.indexOf(':');
            const headLocal: string = colonIdx !== -1 ? headQName.substring(colonIdx + 1) : headQName;
            let members: Set<string> | undefined = this.substitutionGroups.get(headLocal);
            if (!members) {
                members = new Set<string>();
                this.substitutionGroups.set(headLocal, members);
            }
            members.add(info.localName);
        }

        const grammar: SchemaGrammar = new SchemaGrammar();

        // Register every target namespace found across the walked schema set.
        const seenNamespaces: Set<string> = new Set<string>();
        for (const [, info] of this.elementDefinitions) {
            if (info.namespace && !seenNamespaces.has(info.namespace)) {
                seenNamespaces.add(info.namespace);
                grammar.addTargetNamespace(info.namespace);
            }
        }

        // Build one SchemaElementDecl per canonical key.
        // XMLSchemaParser stores each element under multiple keys (namespace|name and name),
        // so skip any key that is not the canonical namespace-qualified form.
        const processed: Set<string> = new Set<string>();
        for (const [key, info] of this.elementDefinitions) {
            const canonical: string = info.namespace ? info.namespace + '|' + info.localName : info.localName;
            if (key !== canonical) {
                continue;
            }
            if (processed.has(canonical)) {
                continue;
            }
            processed.add(canonical);
            grammar.addElementDecl(this.buildElementDecl(info));
        }

        // Build per-namespace sub-grammars for global attribute declarations.
        // These are needed so that attributes from imported namespaces (e.g. xml:lang,
        // xsi:type) can be validated against their declaring schema.
        const subGrammars: Map<string, SchemaGrammar> = new Map<string, SchemaGrammar>();
        for (const [key, info] of this.attributeDefinitions) {
            const colonIndex: number = key.indexOf('|');
            if (colonIndex === -1) {
                continue;
            }
            const ns: string = key.substring(0, colonIndex);
            if (!subGrammars.has(ns)) {
                subGrammars.set(ns, new SchemaGrammar());
            }
            const subGrammar: SchemaGrammar = subGrammars.get(ns) as SchemaGrammar;
            const attrDecl: SchemaAttributeDecl | undefined = this.buildAttributeDecl(info.element, info.namespace);
            if (attrDecl) {
                subGrammar.addGlobalAttributeDecl(attrDecl);
            }
        }
        for (const [ns, subGrammar] of subGrammars) {
            grammar.addImportedGrammar(ns, subGrammar);
        }

        return grammar;
    }

    protected override registerSchemaComponents(schemaElement: XMLElement, targetNamespace?: string): void {
        super.registerSchemaComponents(schemaElement, targetNamespace);
        // Also collect xs:group (model group) definitions that xs:sequence/choice/all may reference.
        for (const child of schemaElement.getChildren()) {
            if (this.getLocalName(child.getName()) !== 'group') {
                continue;
            }
            const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
            if (!nameAttr) {
                continue;
            }
            const groupName: string = nameAttr.getValue();
            if (!this.modelGroupDefinitions.has(groupName)) {
                this.modelGroupDefinitions.set(groupName, child);
            }
            if (targetNamespace) {
                const nsKey: string = targetNamespace + '|' + groupName;
                if (!this.modelGroupDefinitions.has(nsKey)) {
                    this.modelGroupDefinitions.set(nsKey, child);
                }
            }
        }
    }

    private buildElementDecl(info: ElementInfo): SchemaElementDecl {
        const decl: SchemaElementDecl = new SchemaElementDecl(info.localName, info.namespace);

        const typeAttr: XMLAttribute | undefined = info.element.getAttribute('type');
        let typeElement: XMLElement | undefined;

        if (typeAttr) {
            typeElement = this.lookupComplexType(typeAttr.getValue());
        } else {
            typeElement = this.findChildByLocalName(info.element, 'complexType');
        }

        if (typeElement) {
            decl.setContentModel(this.buildContentModel(typeElement, info.namespace));
            const { attrs, anyAttributeNamespace } = this.collectAllAttributes(typeElement, info.namespace);
            for (const attrDecl of attrs.values()) {
                decl.addAttributeDecl(attrDecl);
            }
            if (anyAttributeNamespace !== undefined) {
                decl.setAnyAttribute(anyAttributeNamespace);
            }
            // xs:complexType with xs:simpleContent — text element with a simple base type.
            const simpleContentEl: XMLElement | undefined = this.findChildByLocalName(typeElement, 'simpleContent');
            if (simpleContentEl) {
                const derivation: XMLElement = this.unwrapDerivation(simpleContentEl);
                const baseAttr: XMLAttribute | undefined = derivation.getAttribute('base');
                if (baseAttr) {
                    decl.setSimpleType(baseAttr.getValue());
                }
            }
        } else if (typeAttr) {
            // Named simple type reference — text content only, no child elements.
            decl.setContentModel(SchemaContentModel.empty());
            decl.setSimpleType(typeAttr.getValue());
        } else {
            // Check for an inline xs:simpleType child (no complexType, no type attribute).
            const simpleTypeEl: XMLElement | undefined = this.findChildByLocalName(info.element, 'simpleType');
            if (simpleTypeEl) {
                decl.setContentModel(SchemaContentModel.empty());
                const restrictionEl: XMLElement | undefined = this.findChildByLocalName(simpleTypeEl, 'restriction');
                if (restrictionEl) {
                    const baseAttr: XMLAttribute | undefined = restrictionEl.getAttribute('base');
                    if (baseAttr) {
                        decl.setSimpleType(baseAttr.getValue());
                    }
                }
            }
        }
        // No type, no inline complexType, no simpleType → leave the default ANY content model.

        return decl;
    }

    private buildContentModel(typeElement: XMLElement, namespace?: string, visitingTypes: Set<string> = new Set<string>()): SchemaContentModel {
        const mixedAttr: XMLAttribute | undefined = typeElement.getAttribute('mixed');
        const isMixed: boolean = mixedAttr !== undefined && mixedAttr.getValue() === 'true';

        // simpleContent → text content with attributes, no child elements.
        if (this.findChildByLocalName(typeElement, 'simpleContent')) {
            return SchemaContentModel.mixed();
        }

        // complexContent may wrap extension/restriction; unwrap to find the particle.
        const complexContentEl: XMLElement | undefined = this.findChildByLocalName(typeElement, 'complexContent');

        // When extending a base type, prepend the base type's particle before the extension's own particle.
        let baseParticle: SchemaParticle | undefined;
        if (complexContentEl) {
            const extensionEl: XMLElement | undefined = this.findChildByLocalName(complexContentEl, 'extension');
            if (extensionEl) {
                const baseAttr: XMLAttribute | undefined = extensionEl.getAttribute('base');
                if (baseAttr) {
                    const baseTypeName: string = this.getLocalName(baseAttr.getValue());
                    if (!visitingTypes.has(baseTypeName)) {
                        visitingTypes.add(baseTypeName);
                        const baseTypeEl: XMLElement | undefined = this.lookupComplexType(baseAttr.getValue());
                        if (baseTypeEl) {
                            baseParticle = this.buildContentModel(baseTypeEl, namespace, visitingTypes).getRootParticle();
                        }
                    }
                }
            }
        }

        const particleSource: XMLElement = complexContentEl ? this.unwrapDerivation(complexContentEl) : typeElement;
        const particle: SchemaParticle | undefined = this.buildParticle(particleSource, namespace);

        const effectiveParticle: SchemaParticle | undefined = (baseParticle && particle)
            ? new SchemaSequence([baseParticle, particle], 1, 1)
            : (baseParticle || particle);

        if (isMixed) {
            return SchemaContentModel.mixed(effectiveParticle);
        }
        if (effectiveParticle) {
            return SchemaContentModel.element(effectiveParticle);
        }
        if (this.findChildByLocalName(typeElement, 'any')) {
            return SchemaContentModel.any();
        }
        return SchemaContentModel.empty();
    }

    private unwrapDerivation(el: XMLElement): XMLElement {
        const extension: XMLElement | undefined = this.findChildByLocalName(el, 'extension');
        if (extension) {
            return extension;
        }
        const restriction: XMLElement | undefined = this.findChildByLocalName(el, 'restriction');
        if (restriction) {
            return restriction;
        }
        return el;
    }

    private buildParticle(container: XMLElement, namespace?: string): SchemaParticle | undefined {
        for (const child of container.getChildren()) {
            const localName: string = this.getLocalName(child.getName());
            const [min, max] = this.parseOccurs(child);
            if (localName === 'sequence') {
                return new SchemaSequence(this.buildParticleList(child, namespace), min, max);
            }
            if (localName === 'choice') {
                return new SchemaChoice(this.buildParticleList(child, namespace), min, max);
            }
            if (localName === 'all') {
                return new SchemaAll(this.buildParticleList(child, namespace), min, max);
            }
            if (localName === 'group') {
                const refAttr: XMLAttribute | undefined = child.getAttribute('ref');
                if (refAttr) {
                    return this.resolveGroupRef(refAttr.getValue(), namespace, min, max);
                }
            }
        }
        return undefined;
    }

    private buildParticleList(container: XMLElement, namespace?: string): SchemaParticle[] {
        const particles: SchemaParticle[] = [];
        for (const child of container.getChildren()) {
            const localName: string = this.getLocalName(child.getName());
            const [min, max] = this.parseOccurs(child);

            if (localName === 'element') {
                const refAttr: XMLAttribute | undefined = child.getAttribute('ref');
                const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
                const particleName: string | undefined = refAttr
                    ? this.getLocalName(refAttr.getValue())
                    : nameAttr ? nameAttr.getValue() : undefined;
                if (particleName) {
                    const members: Set<string> | undefined = this.substitutionGroups.get(particleName);
                    particles.push(new SchemaElementParticle(particleName, min, max, members));
                }
            } else if (localName === 'any') {
                const nsAttr: XMLAttribute | undefined = child.getAttribute('namespace');
                const pcAttr: XMLAttribute | undefined = child.getAttribute('processContents');
                const ns: string = nsAttr ? nsAttr.getValue() : '##any';
                const pc: 'strict' | 'lax' | 'skip' = pcAttr
                    ? (pcAttr.getValue() as 'strict' | 'lax' | 'skip')
                    : 'strict';
                particles.push(new SchemaWildcardParticle(ns, pc, min, max));
            } else if (localName === 'sequence') {
                particles.push(new SchemaSequence(this.buildParticleList(child, namespace), min, max));
            } else if (localName === 'choice') {
                particles.push(new SchemaChoice(this.buildParticleList(child, namespace), min, max));
            } else if (localName === 'all') {
                particles.push(new SchemaAll(this.buildParticleList(child, namespace), min, max));
            } else if (localName === 'group') {
                const refAttr: XMLAttribute | undefined = child.getAttribute('ref');
                if (refAttr) {
                    const groupParticle: SchemaParticle | undefined = this.resolveGroupRef(refAttr.getValue(), namespace, min, max);
                    if (groupParticle) {
                        particles.push(groupParticle);
                    }
                }
            }
        }
        return particles;
    }

    private resolveGroupRef(ref: string, namespace: string | undefined, min: number, max: number | 'unbounded'): SchemaParticle | undefined {
        const localRef: string = this.getLocalName(ref);
        let groupEl: XMLElement | undefined = this.modelGroupDefinitions.get(ref);
        if (!groupEl && namespace) {
            groupEl = this.modelGroupDefinitions.get(namespace + '|' + localRef);
        }
        if (!groupEl) {
            groupEl = this.modelGroupDefinitions.get(localRef);
        }
        if (!groupEl) {
            return undefined;
        }
        // xs:group element wraps sequence/choice/all — find the inner particle.
        const inner: SchemaParticle | undefined = this.buildParticle(groupEl, namespace);
        if (!inner) {
            return undefined;
        }
        // Apply the reference's own minOccurs/maxOccurs on top of the group particle.
        inner.minOccurs = min;
        inner.maxOccurs = max;
        return inner;
    }

    private collectAllAttributes(typeElement: XMLElement, namespace?: string): { attrs: Map<string, SchemaAttributeDecl>; anyAttributeNamespace: string | undefined } {
        const attrs: Map<string, SchemaAttributeDecl> = new Map<string, SchemaAttributeDecl>();
        const visitedTypes: Set<string> = new Set<string>();
        let anyAttributeNamespace: string | undefined = undefined;
        this.gatherAttributes(typeElement, attrs, visitedTypes, namespace, (ns) => { anyAttributeNamespace = ns; });
        return { attrs, anyAttributeNamespace };
    }

    private gatherAttributes(el: XMLElement, result: Map<string, SchemaAttributeDecl>, visitedTypes: Set<string>, namespace?: string, onAnyAttribute?: (ns: string) => void): void {
        for (const child of el.getChildren()) {
            const localName: string = this.getLocalName(child.getName());
            if (localName === 'attribute') {
                const attrDecl: SchemaAttributeDecl | undefined = this.buildAttributeDecl(child, namespace);
                if (attrDecl) {
                    result.set(attrDecl.getName(), attrDecl);
                }
            } else if (localName === 'anyAttribute') {
                if (onAnyAttribute) {
                    const nsAttr: XMLAttribute | undefined = child.getAttribute('namespace');
                    onAnyAttribute(nsAttr ? nsAttr.getValue() : '##any');
                }
            } else if (localName === 'attributeGroup') {
                const refAttr: XMLAttribute | undefined = child.getAttribute('ref');
                if (refAttr) {
                    const groupEl: XMLElement | undefined = this.lookupAttributeGroup(refAttr.getValue());
                    if (groupEl) {
                        this.gatherAttributes(groupEl, result, visitedTypes, namespace, onAnyAttribute);
                    }
                }
            } else if (localName === 'complexContent' || localName === 'simpleContent') {
                this.gatherAttributes(child, result, visitedTypes, namespace, onAnyAttribute);
            } else if (localName === 'extension' || localName === 'restriction') {
                const baseAttr: XMLAttribute | undefined = child.getAttribute('base');
                if (baseAttr) {
                    const baseLocalName: string = this.getLocalName(baseAttr.getValue());
                    if (!visitedTypes.has(baseLocalName)) {
                        visitedTypes.add(baseLocalName);
                        const baseTypeEl: XMLElement | undefined = this.lookupComplexType(baseAttr.getValue());
                        if (baseTypeEl) {
                            this.gatherAttributes(baseTypeEl, result, visitedTypes, namespace, onAnyAttribute);
                        }
                    }
                }
                this.gatherAttributes(child, result, visitedTypes, namespace, onAnyAttribute);
            } else if (localName === 'complexType') {
                this.gatherAttributes(child, result, visitedTypes, namespace, onAnyAttribute);
            }
        }
    }

    private buildAttributeDecl(attrEl: XMLElement, namespace?: string): SchemaAttributeDecl | undefined {
        const nameAttr: XMLAttribute | undefined = attrEl.getAttribute('name');
        const refAttr: XMLAttribute | undefined = attrEl.getAttribute('ref');
        const useAttr: XMLAttribute | undefined = attrEl.getAttribute('use');
        const typeAttr: XMLAttribute | undefined = attrEl.getAttribute('type');
        const defaultAttr: XMLAttribute | undefined = attrEl.getAttribute('default');
        const fixedAttr: XMLAttribute | undefined = attrEl.getAttribute('fixed');

        let name: string | undefined;
        let attrNamespace: string | undefined;
        let type: string = 'xs:string';
        let defaultValue: string | undefined;
        let fixedValue: string | undefined;

        if (nameAttr) {
            name = nameAttr.getValue();
        } else if (refAttr) {
            // Resolve the referenced global attribute declaration.
            const refInfo = this.lookupAttribute(refAttr.getValue(), namespace);
            if (refInfo) {
                const refNameAttr: XMLAttribute | undefined = refInfo.element.getAttribute('name');
                name = refNameAttr ? refNameAttr.getValue() : this.getLocalName(refAttr.getValue());
                attrNamespace = refInfo.namespace;
                const refTypeAttr: XMLAttribute | undefined = refInfo.element.getAttribute('type');
                if (refTypeAttr) {
                    type = refTypeAttr.getValue();
                }
                const refDefaultAttr: XMLAttribute | undefined = refInfo.element.getAttribute('default');
                const refFixedAttr: XMLAttribute | undefined = refInfo.element.getAttribute('fixed');
                if (refDefaultAttr) {
                    defaultValue = refDefaultAttr.getValue();
                }
                if (refFixedAttr) {
                    fixedValue = refFixedAttr.getValue();
                }
            } else {
                name = this.getLocalName(refAttr.getValue());
            }
        }

        if (!name) {
            return undefined;
        }

        if (typeAttr) {
            type = typeAttr.getValue();
        }
        if (defaultAttr) {
            defaultValue = defaultAttr.getValue();
        }
        if (fixedAttr) {
            fixedValue = fixedAttr.getValue();
        }

        const formAttr: XMLAttribute | undefined = attrEl.getAttribute('form');
        if (formAttr && formAttr.getValue() === 'qualified') {
            attrNamespace = namespace;
        }

        let use: AttributeUse = AttributeUse.OPTIONAL;
        if (useAttr) {
            if (useAttr.getValue() === 'required') {
                use = AttributeUse.REQUIRED;
            } else if (useAttr.getValue() === 'prohibited') {
                use = AttributeUse.PROHIBITED;
            }
        } else if (fixedValue !== undefined) {
            use = AttributeUse.FIXED;
        }

        // Prohibited attributes are not added to the element declaration.
        if (use === AttributeUse.PROHIBITED) {
            return undefined;
        }

        const decl: SchemaAttributeDecl = new SchemaAttributeDecl(name, type, use, defaultValue, fixedValue, attrNamespace);

        const simpleTypeEl: XMLElement | undefined = this.findChildByLocalName(attrEl, 'simpleType');
        if (simpleTypeEl) {
            this.applySimpleTypeConstraints(decl, simpleTypeEl);
        } else if (!type.startsWith('xs:')) {
            const localTypeName: string = this.getLocalName(type);
            const namedSimpleType: XMLElement | undefined = this.simpleTypeDefinitions.get(localTypeName);
            if (namedSimpleType) {
                this.applySimpleTypeConstraints(decl, namedSimpleType);
            }
        }

        return decl;
    }

    private collectEnumeration(simpleTypeEl: XMLElement): string[] {
        const values: string[] = [];
        const restrictionEl: XMLElement | undefined = this.findChildByLocalName(simpleTypeEl, 'restriction');
        if (!restrictionEl) {
            return values;
        }
        for (const child of restrictionEl.getChildren()) {
            if (this.getLocalName(child.getName()) === 'enumeration') {
                const valueAttr: XMLAttribute | undefined = child.getAttribute('value');
                if (valueAttr) {
                    values.push(valueAttr.getValue());
                }
            }
        }
        return values;
    }

    private collectPatterns(simpleTypeEl: XMLElement): string[] {
        const patterns: string[] = [];
        const restrictionEl: XMLElement | undefined = this.findChildByLocalName(simpleTypeEl, 'restriction');
        if (!restrictionEl) {
            return patterns;
        }
        for (const child of restrictionEl.getChildren()) {
            if (this.getLocalName(child.getName()) === 'pattern') {
                const valueAttr: XMLAttribute | undefined = child.getAttribute('value');
                if (valueAttr) {
                    patterns.push(valueAttr.getValue());
                }
            }
        }
        return patterns;
    }

    private collectRangeFacets(simpleTypeEl: XMLElement): {min: number | undefined, max: number | undefined} {
        let min: number | undefined;
        let max: number | undefined;
        const restrictionEl: XMLElement | undefined = this.findChildByLocalName(simpleTypeEl, 'restriction');
        if (!restrictionEl) {
            return {min, max};
        }
        for (const child of restrictionEl.getChildren()) {
            const localChildName: string = this.getLocalName(child.getName());
            const valueAttr: XMLAttribute | undefined = child.getAttribute('value');
            if (!valueAttr) {
                continue;
            }
            if (localChildName === 'minInclusive') {
                min = parseFloat(valueAttr.getValue());
            } else if (localChildName === 'maxInclusive') {
                max = parseFloat(valueAttr.getValue());
            }
        }
        return {min, max};
    }

    private collectUnionAlternatives(simpleTypeEl: XMLElement): Array<{enumerations: string[], patterns: string[]}> {
        const alternatives: Array<{enumerations: string[], patterns: string[]}> = [];
        const unionEl: XMLElement | undefined = this.findChildByLocalName(simpleTypeEl, 'union');
        if (!unionEl) {
            return alternatives;
        }
        // Inline simpleType children of the union element.
        for (const child of unionEl.getChildren()) {
            if (this.getLocalName(child.getName()) === 'simpleType') {
                alternatives.push({enumerations: this.collectEnumeration(child), patterns: this.collectPatterns(child)});
            }
        }
        // Named member types from the memberTypes attribute.
        const memberTypesAttr: XMLAttribute | undefined = unionEl.getAttribute('memberTypes');
        if (memberTypesAttr) {
            const memberTypeNames: string[] = memberTypesAttr.getValue().trim().split(/\s+/);
            for (let i: number = 0; i < memberTypeNames.length; i++) {
                const localName: string = this.getLocalName(memberTypeNames[i]);
                const namedSimpleType: XMLElement | undefined = this.simpleTypeDefinitions.get(localName);
                if (namedSimpleType) {
                    alternatives.push({enumerations: this.collectEnumeration(namedSimpleType), patterns: this.collectPatterns(namedSimpleType)});
                } else {
                    // Unknown member type — treat as always-valid to avoid false positives.
                    alternatives.push({enumerations: [], patterns: []});
                }
            }
        }
        return alternatives;
    }

    private applySimpleTypeConstraints(decl: SchemaAttributeDecl, simpleTypeEl: XMLElement): void {
        const unionAlts: Array<{enumerations: string[], patterns: string[]}> = this.collectUnionAlternatives(simpleTypeEl);
        if (unionAlts.length > 0) {
            decl.setUnionAlternatives(unionAlts);
            return;
        }
        const enumValues: string[] = this.collectEnumeration(simpleTypeEl);
        if (enumValues.length > 0) {
            decl.setEnumeration(enumValues);
        }
        const patternValues: string[] = this.collectPatterns(simpleTypeEl);
        if (patternValues.length > 0) {
            decl.setPatterns(patternValues);
        }
        const range: {min: number | undefined, max: number | undefined} = this.collectRangeFacets(simpleTypeEl);
        if (range.min !== undefined) {
            decl.setMinInclusive(range.min);
        }
        if (range.max !== undefined) {
            decl.setMaxInclusive(range.max);
        }
    }

    private parseOccurs(el: XMLElement): [number, number | 'unbounded'] {
        const minAttr: XMLAttribute | undefined = el.getAttribute('minOccurs');
        const maxAttr: XMLAttribute | undefined = el.getAttribute('maxOccurs');
        const min: number = minAttr ? parseInt(minAttr.getValue(), 10) : 1;
        const max: number | 'unbounded' = maxAttr
            ? (maxAttr.getValue() === 'unbounded' ? 'unbounded' : parseInt(maxAttr.getValue(), 10))
            : 1;
        return [min, max];
    }

    private findChildByLocalName(el: XMLElement, localName: string): XMLElement | undefined {
        for (const child of el.getChildren()) {
            if (this.getLocalName(child.getName()) === localName) {
                return child;
            }
        }
        return undefined;
    }
}
