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
import { SchemaFacets } from './SchemaTypeValidator.js';
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

        // Expand substitution groups to include transitive members.
        // e.g. if B substitutes A and C substitutes B, then A's group must include C.
        let changed: boolean = true;
        while (changed) {
            changed = false;
            for (const [head, members] of this.substitutionGroups) {
                const before: number = members.size;
                for (const member of Array.from(members)) {
                    const memberGroup: Set<string> | undefined = this.substitutionGroups.get(member);
                    if (memberGroup) {
                        for (const transitive of memberGroup) {
                            members.add(transitive);
                        }
                    }
                }
                if (members.size !== before) {
                    changed = true;
                }
            }
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

        // Build complex type decls for xsi:type substitution support.
        // Store one decl per unique local type name so the grammar can swap content models.
        const processedTypeNames: Set<string> = new Set<string>();
        for (const [key, typeElement] of this.complexTypeDefinitions) {
            const pipeIdx: number = key.indexOf('|');
            const typeLocalName: string = pipeIdx !== -1 ? key.substring(pipeIdx + 1) : key;
            if (processedTypeNames.has(typeLocalName)) {
                continue;
            }
            processedTypeNames.add(typeLocalName);
            const typeNamespace: string | undefined = pipeIdx !== -1 ? key.substring(0, pipeIdx) : undefined;
            const decl: SchemaElementDecl = new SchemaElementDecl(typeLocalName, typeNamespace);
            decl.setContentModel(this.buildContentModel(typeElement, typeNamespace));
            const { attrs, anyAttributeNamespace } = this.collectAllAttributes(typeElement, typeNamespace);
            for (const attrDecl of attrs.values()) {
                decl.addAttributeDecl(attrDecl);
            }
            if (anyAttributeNamespace !== undefined) {
                decl.setAnyAttribute(anyAttributeNamespace);
            }
            grammar.addComplexTypeDecl(typeLocalName, decl);
        }

        // Build type hierarchy for xsi:type ancestry validation (spec §3.9.4).
        const processedHierarchy: Set<string> = new Set<string>();
        for (const [key, typeElement] of this.complexTypeDefinitions) {
            const pipeIdx: number = key.indexOf('|');
            const typeLocalName: string = pipeIdx !== -1 ? key.substring(pipeIdx + 1) : key;
            if (processedHierarchy.has(typeLocalName)) {
                continue;
            }
            processedHierarchy.add(typeLocalName);
            const baseTypeName: string | undefined = this.findTypeBase(typeElement);
            if (baseTypeName) {
                grammar.addTypeHierarchyEntry(typeLocalName, baseTypeName);
            }
        }

        // Register element decls for inline element declarations found in groups and complex types.
        // These are needed so attribute and child validation works for locally-declared elements
        // (e.g. elements declared inside xs:group or inside anonymous/named xs:complexType).
        const inlineNameProcessed: Set<string> = new Set<string>();
        const inlineContainerProcessed: Set<XMLElement> = new Set<XMLElement>();
        const walkInlineElements = (container: XMLElement): void => {
            for (const child of container.getChildren()) {
                if (inlineContainerProcessed.has(child)) {
                    continue;
                }
                inlineContainerProcessed.add(child);
                const childLocal: string = this.getLocalName(child.getName());
                if (childLocal === 'element') {
                    const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
                    if (nameAttr && !child.getAttribute('ref')) {
                        const elName: string = nameAttr.getValue();
                        if (!inlineNameProcessed.has(elName)) {
                            inlineNameProcessed.add(elName);
                            const info: ElementInfo = { element: child, namespace: undefined, localName: elName };
                            grammar.addElementDecl(this.buildElementDecl(info));
                        }
                    }
                }
                walkInlineElements(child);
            }
        };
        const containerProcessed: Set<XMLElement> = new Set<XMLElement>();
        for (const [, groupEl] of this.modelGroupDefinitions) {
            if (!containerProcessed.has(groupEl)) {
                containerProcessed.add(groupEl);
                walkInlineElements(groupEl);
            }
        }
        for (const [, typeEl] of this.complexTypeDefinitions) {
            if (!containerProcessed.has(typeEl)) {
                containerProcessed.add(typeEl);
                walkInlineElements(typeEl);
            }
        }
        // Also walk original types saved by xs:redefine so their inline elements remain registered.
        for (const [, typeEl] of this.redefineOriginals) {
            if (!containerProcessed.has(typeEl)) {
                containerProcessed.add(typeEl);
                walkInlineElements(typeEl);
            }
        }
        // Walk the anonymous xs:complexType children of top-level element declarations.
        // These are not in complexTypeDefinitions (they are inline/anonymous) so they are missed above.
        for (const [, info] of this.elementDefinitions) {
            const inlineComplexType: XMLElement | undefined = this.findChildByLocalName(info.element, 'complexType');
            if (inlineComplexType && !containerProcessed.has(inlineComplexType)) {
                containerProcessed.add(inlineComplexType);
                walkInlineElements(inlineComplexType);
            }
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
        if (typeAttr) {
            decl.setDeclaredTypeName(this.getLocalName(typeAttr.getValue()));
        }
        const abstractAttr: XMLAttribute | undefined = info.element.getAttribute('abstract');
        if (abstractAttr && abstractAttr.getValue() === 'true') {
            decl.setAbstract(true);
        }
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
            const typeValue: string = typeAttr.getValue();
            if (typeValue.startsWith('xs:')) {
                decl.setSimpleType(typeValue);
            } else {
                const localTypeName: string = this.getLocalName(typeValue);
                const namedSimpleType: XMLElement | undefined = this.simpleTypeDefinitions.get(localTypeName);
                if (namedSimpleType) {
                    // Resolve base xs: type so validateTextContent can use SchemaTypeValidator.
                    const resolvedBase: string | undefined = this.resolveSimpleTypeBase(namedSimpleType);
                    if (resolvedBase) {
                        decl.setSimpleType(resolvedBase);
                    }
                    const facets: SchemaFacets = this.collectFacets(namedSimpleType);
                    decl.setTextFacets(facets);
                } else {
                    decl.setSimpleType(typeValue);
                }
            }
        } else {
            // Check for an inline xs:simpleType child (no complexType, no type attribute).
            const simpleTypeEl: XMLElement | undefined = this.findChildByLocalName(info.element, 'simpleType');
            if (simpleTypeEl) {
                decl.setContentModel(SchemaContentModel.empty());
                const resolvedBase2: string | undefined = this.resolveSimpleTypeBase(simpleTypeEl);
                if (resolvedBase2) {
                    decl.setSimpleType(resolvedBase2);
                }
                const facets: SchemaFacets = this.collectFacets(simpleTypeEl);
                decl.setTextFacets(facets);
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
                    } else {
                        // Cycle detected — may be xs:redefine self-extension; try the original definition.
                        const originalTypeEl: XMLElement | undefined = this.lookupOriginalComplexType(baseAttr.getValue());
                        if (originalTypeEl) {
                            baseParticle = this.buildContentModel(originalTypeEl, namespace, new Set<string>()).getRootParticle();
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

    private resolveCharRefs(s: string): string {
        return s.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
                .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
                .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    }

    private collectFacets(simpleTypeEl: XMLElement): SchemaFacets {
        const facets: SchemaFacets = {};
        const restrictionEl: XMLElement | undefined = this.findChildByLocalName(simpleTypeEl, 'restriction');
        if (!restrictionEl) {
            return facets;
        }
        for (const child of restrictionEl.getChildren()) {
            const localChildName: string = this.getLocalName(child.getName());
            const valueAttr: XMLAttribute | undefined = child.getAttribute('value');
            if (!valueAttr) {
                continue;
            }
            const val: string = this.resolveCharRefs(valueAttr.getValue());
            if (localChildName === 'enumeration') {
                if (!facets.enumeration) {
                    facets.enumeration = [];
                }
                facets.enumeration.push(val);
            } else if (localChildName === 'pattern') {
                if (!facets.patterns) {
                    facets.patterns = [];
                }
                facets.patterns.push(val);
            } else if (localChildName === 'minExclusive') {
                facets.minExclusive = val;
            } else if (localChildName === 'maxExclusive') {
                facets.maxExclusive = val;
            } else if (localChildName === 'minInclusive') {
                facets.minInclusive = val;
            } else if (localChildName === 'maxInclusive') {
                facets.maxInclusive = val;
            } else if (localChildName === 'length') {
                facets.length = parseInt(val, 10);
            } else if (localChildName === 'minLength') {
                facets.minLength = parseInt(val, 10);
            } else if (localChildName === 'maxLength') {
                facets.maxLength = parseInt(val, 10);
            } else if (localChildName === 'totalDigits') {
                facets.totalDigits = parseInt(val, 10);
            } else if (localChildName === 'fractionDigits') {
                facets.fractionDigits = parseInt(val, 10);
            }
        }
        return facets;
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
                    values.push(this.resolveCharRefs(valueAttr.getValue()));
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
                    patterns.push(this.resolveCharRefs(valueAttr.getValue()));
                }
            }
        }
        return patterns;
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
        const facets: SchemaFacets = this.collectFacets(simpleTypeEl);
        if (facets.enumeration && facets.enumeration.length > 0) {
            decl.setEnumeration(facets.enumeration);
        }
        if (facets.patterns && facets.patterns.length > 0) {
            decl.setPatterns(facets.patterns);
        }
        if (facets.minExclusive !== undefined) {
            decl.setMinExclusive(facets.minExclusive);
        }
        if (facets.maxExclusive !== undefined) {
            decl.setMaxExclusive(facets.maxExclusive);
        }
        if (facets.minInclusive !== undefined) {
            decl.setMinInclusive(facets.minInclusive);
        }
        if (facets.maxInclusive !== undefined) {
            decl.setMaxInclusive(facets.maxInclusive);
        }
        if (facets.length !== undefined) {
            decl.setLength(facets.length);
        }
        if (facets.minLength !== undefined) {
            decl.setMinLength(facets.minLength);
        }
        if (facets.maxLength !== undefined) {
            decl.setMaxLength(facets.maxLength);
        }
        if (facets.totalDigits !== undefined) {
            decl.setTotalDigits(facets.totalDigits);
        }
        if (facets.fractionDigits !== undefined) {
            decl.setFractionDigits(facets.fractionDigits);
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

    private resolveSimpleTypeBase(simpleTypeEl: XMLElement): string | undefined {
        const restrictionEl: XMLElement | undefined = this.findChildByLocalName(simpleTypeEl, 'restriction');
        if (restrictionEl) {
            const baseAttr: XMLAttribute | undefined = restrictionEl.getAttribute('base');
            if (baseAttr) {
                return baseAttr.getValue();
            }
            // restriction with no base attribute — look for inline xs:simpleType child
            const innerSimpleType: XMLElement | undefined = this.findChildByLocalName(restrictionEl, 'simpleType');
            if (innerSimpleType) {
                return this.resolveSimpleTypeBase(innerSimpleType);
            }
        }
        if (this.findChildByLocalName(simpleTypeEl, 'list') || this.findChildByLocalName(simpleTypeEl, 'union')) {
            return 'xs:string';
        }
        return undefined;
    }

    private findTypeBase(typeElement: XMLElement): string | undefined {
        const complexContentEl: XMLElement | undefined = this.findChildByLocalName(typeElement, 'complexContent');
        if (complexContentEl) {
            const extEl: XMLElement | undefined = this.findChildByLocalName(complexContentEl, 'extension');
            if (extEl) {
                const baseAttr: XMLAttribute | undefined = extEl.getAttribute('base');
                if (baseAttr) {
                    return this.getLocalName(baseAttr.getValue());
                }
            }
            const restrEl: XMLElement | undefined = this.findChildByLocalName(complexContentEl, 'restriction');
            if (restrEl) {
                const baseAttr: XMLAttribute | undefined = restrEl.getAttribute('base');
                if (baseAttr) {
                    return this.getLocalName(baseAttr.getValue());
                }
            }
        }
        const simpleContentEl: XMLElement | undefined = this.findChildByLocalName(typeElement, 'simpleContent');
        if (simpleContentEl) {
            const extEl: XMLElement | undefined = this.findChildByLocalName(simpleContentEl, 'extension');
            if (extEl) {
                const baseAttr: XMLAttribute | undefined = extEl.getAttribute('base');
                if (baseAttr) {
                    return this.getLocalName(baseAttr.getValue());
                }
            }
            const restrEl: XMLElement | undefined = this.findChildByLocalName(simpleContentEl, 'restriction');
            if (restrEl) {
                const baseAttr: XMLAttribute | undefined = restrEl.getAttribute('base');
                if (baseAttr) {
                    return this.getLocalName(baseAttr.getValue());
                }
            }
        }
        return undefined;
    }
}
