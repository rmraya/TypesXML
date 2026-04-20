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
import { IdentityConstraint, SchemaElementDecl } from './SchemaElementDecl.js';
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

    private static readonly XSD_BUILT_IN_TYPES: Set<string> = new Set<string>([
        'string', 'boolean', 'decimal', 'float', 'double', 'duration', 'dateTime', 'time', 'date',
        'gYearMonth', 'gYear', 'gMonthDay', 'gDay', 'gMonth', 'hexBinary', 'base64Binary', 'anyURI',
        'QName', 'NOTATION', 'normalizedString', 'token', 'language', 'NMTOKEN', 'NMTOKENS',
        'Name', 'NCName', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'integer',
        'nonPositiveInteger', 'negativeInteger', 'long', 'int', 'short', 'byte',
        'nonNegativeInteger', 'unsignedLong', 'unsignedInt', 'unsignedShort', 'unsignedByte',
        'positiveInteger', 'anySimpleType', 'anyType'
    ]);

    private modelGroupDefinitions: Map<string, XMLElement>;
    private substitutionGroups: Map<string, Set<string>>;
    private schemaBlockDefaults: Map<string, string>;
    private schemaFinalDefaults: Map<string, string>;
    private earlyTypeHierarchy: Map<string, {base: string, method: string}>;
    private schemaPrefixMaps: Map<string, Map<string, string>>;

    constructor(catalog?: Catalog) {
        super(catalog);
        this.modelGroupDefinitions = new Map<string, XMLElement>();
        this.substitutionGroups = new Map<string, Set<string>>();
        this.schemaBlockDefaults = new Map<string, string>();
        this.schemaFinalDefaults = new Map<string, string>();
        this.earlyTypeHierarchy = new Map<string, {base: string, method: string}>();
        this.schemaPrefixMaps = new Map<string, Map<string, string>>();
    }

    buildGrammar(schemaPath: string): SchemaGrammar {
        this.resetWorkingState();
        this.modelGroupDefinitions = new Map<string, XMLElement>();
        this.substitutionGroups = new Map<string, Set<string>>();
        this.schemaBlockDefaults = new Map<string, string>();
        this.schemaFinalDefaults = new Map<string, string>();
        this.earlyTypeHierarchy = new Map<string, {base: string, method: string}>();
        this.schemaPrefixMaps = new Map<string, Map<string, string>>();
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

        // Pre-compute type hierarchy so buildParticleList can filter substitution group members
        // by derivation method (block="extension" / block="restriction" on the head element).
        for (const [key, typeElement] of this.complexTypeDefinitions) {
            const pipeIdx: number = key.indexOf('|');
            const typeLocalName: string = pipeIdx !== -1 ? key.substring(pipeIdx + 1) : key;
            if (!this.earlyTypeHierarchy.has(typeLocalName)) {
                const baseTypeInfo: {base: string, method: string} | undefined = this.findTypeBase(typeElement);
                if (baseTypeInfo) {
                    this.earlyTypeHierarchy.set(typeLocalName, baseTypeInfo);
                }
            }
        }
        for (const [key, typeElement] of this.simpleTypeDefinitions) {
            const pipeIdx: number = key.indexOf('|');
            const typeLocalName: string = pipeIdx !== -1 ? key.substring(pipeIdx + 1) : key;
            if (!this.earlyTypeHierarchy.has(typeLocalName)) {
                const restrictionEl: XMLElement | undefined = this.findChildByLocalName(typeElement, 'restriction');
                if (restrictionEl) {
                    const baseAttr: XMLAttribute | undefined = restrictionEl.getAttribute('base');
                    if (baseAttr) {
                        this.earlyTypeHierarchy.set(typeLocalName, {base: this.getLocalName(baseAttr.getValue()), method: 'restriction'});
                    }
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
            const { attrs, anyAttributeNamespace, anyAttributeProcessContents, anyAttributeOwnerNs, anyAttributeExcludedNamespaces } = this.collectAllAttributes(typeElement, typeNamespace);
            for (const attrDecl of attrs.values()) {
                decl.addAttributeDecl(attrDecl);
            }
            if (anyAttributeNamespace !== undefined) {
                decl.setAnyAttribute(anyAttributeNamespace, anyAttributeProcessContents, anyAttributeOwnerNs, anyAttributeExcludedNamespaces);
            }
            const typeBlockAttr: XMLAttribute | undefined = typeElement.getAttribute('block');
            const typeBlockSet: Set<string> = new Set<string>();
            if (typeBlockAttr) {
                const typeBlockVal: string = typeBlockAttr.getValue().trim();
                if (typeBlockVal === '#all') {
                    typeBlockSet.add('#all');
                } else {
                    for (const token of typeBlockVal.split(/\s+/)) {
                        if (token) {
                            typeBlockSet.add(token);
                        }
                    }
                }
            } else {
                const defaultKey: string = typeNamespace !== undefined ? typeNamespace : '';
                const blockDefault: string | undefined = this.schemaBlockDefaults.get(defaultKey);
                if (blockDefault && blockDefault.length > 0) {
                    if (blockDefault === '#all') {
                        typeBlockSet.add('#all');
                    } else {
                        for (const token of blockDefault.split(/\s+/)) {
                            if (token) {
                                typeBlockSet.add(token);
                            }
                        }
                    }
                }
            }
            if (typeBlockSet.size > 0) {
                decl.setBlockConstraints(typeBlockSet);
            }
            const typeAbstractAttr: XMLAttribute | undefined = typeElement.getAttribute('abstract');
            if (typeAbstractAttr && typeAbstractAttr.getValue() === 'true') {
                decl.setAbstract(true);
            }
            const typeFinalAttr: XMLAttribute | undefined = typeElement.getAttribute('final');
            const typeFinalSet: Set<string> = new Set<string>();
            if (typeFinalAttr) {
                const typeFinalVal: string = typeFinalAttr.getValue().trim();
                if (typeFinalVal === '#all') {
                    typeFinalSet.add('#all');
                } else {
                    for (const token of typeFinalVal.split(/\s+/)) {
                        if (token) {
                            typeFinalSet.add(token);
                        }
                    }
                }
            } else {
                const defaultKey: string = typeNamespace !== undefined ? typeNamespace : '';
                const finalDefault: string | undefined = this.schemaFinalDefaults.get(defaultKey);
                if (finalDefault && finalDefault.length > 0) {
                    if (finalDefault === '#all') {
                        typeFinalSet.add('#all');
                    } else {
                        for (const token of finalDefault.split(/\s+/)) {
                            if (token) {
                                typeFinalSet.add(token);
                            }
                        }
                    }
                }
            }
            if (typeFinalSet.size > 0) {
                decl.setFinalConstraints(typeFinalSet);
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
            const baseTypeInfo: {base: string, method: string} | undefined = this.findTypeBase(typeElement);
            if (baseTypeInfo) {
                grammar.addTypeHierarchyEntry(typeLocalName, baseTypeInfo.base, baseTypeInfo.method);
            }
        }
        // Also build type hierarchy from simple type definitions so that xsi:type can
        // reference a simple type derived from the element's declared simple type.
        for (const [key, typeElement] of this.simpleTypeDefinitions) {
            const pipeIdx: number = key.indexOf('|');
            const typeLocalName: string = pipeIdx !== -1 ? key.substring(pipeIdx + 1) : key;
            if (processedHierarchy.has(typeLocalName)) {
                continue;
            }
            processedHierarchy.add(typeLocalName);
            const restrictionEl: XMLElement | undefined = this.findChildByLocalName(typeElement, 'restriction');
            if (restrictionEl) {
                const baseAttr: XMLAttribute | undefined = restrictionEl.getAttribute('base');
                if (baseAttr) {
                    grammar.addTypeHierarchyEntry(typeLocalName, this.getLocalName(baseAttr.getValue()), 'restriction');
                }
            }
        }
        // Build per-named-simpleType decls so validateTextContent can apply the substitute
        // type's facets when xsi:type references a xs:simpleType (spec §3.9.4).
        const processedSimpleDecls: Set<string> = new Set<string>();
        for (const [key, typeElement] of this.simpleTypeDefinitions) {
            const pipeIdx: number = key.indexOf('|');
            const typeLocalName: string = pipeIdx !== -1 ? key.substring(pipeIdx + 1) : key;
            if (processedSimpleDecls.has(typeLocalName)) {
                continue;
            }
            processedSimpleDecls.add(typeLocalName);
            const simpleDecl: SchemaElementDecl = new SchemaElementDecl(typeLocalName);
            simpleDecl.setContentModel(SchemaContentModel.empty());
            const unionMembersDecl: string[] = this.extractUnionMemberTypeNames(typeElement);
            if (unionMembersDecl.length > 0) {
                simpleDecl.setUnionMemberTypes(unionMembersDecl);
            } else {
                const listItemDecl: string | undefined = this.extractListItemTypeName(typeElement);
                if (listItemDecl !== undefined) {
                    simpleDecl.setListItemType(listItemDecl);
                } else {
                    const resolvedBase: string | undefined = this.resolveSimpleTypeBase(typeElement);
                    if (resolvedBase) {
                        simpleDecl.setSimpleType(resolvedBase);
                    }
                }
            }
            const facets: SchemaFacets = this.collectFacets(typeElement);
            simpleDecl.setTextFacets(facets);
            const simpleFinalAttr: XMLAttribute | undefined = typeElement.getAttribute('final');
            if (simpleFinalAttr) {
                const simpleFinalVal: string = simpleFinalAttr.getValue().trim();
                const simpleFinalSet: Set<string> = new Set<string>();
                if (simpleFinalVal === '#all') {
                    simpleFinalSet.add('#all');
                } else {
                    for (const token of simpleFinalVal.split(/\s+/)) {
                        if (token) {
                            simpleFinalSet.add(token);
                        }
                    }
                }
                if (simpleFinalSet.size > 0) {
                    simpleDecl.setFinalConstraints(simpleFinalSet);
                }
            }
            grammar.addSimpleTypeDecl(typeLocalName, simpleDecl);
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
        const nsKey: string = targetNamespace !== undefined ? targetNamespace : '';
        let prefixMap: Map<string, string> | undefined = this.schemaPrefixMaps.get(nsKey);
        if (!prefixMap) {
            prefixMap = new Map<string, string>();
            this.schemaPrefixMaps.set(nsKey, prefixMap);
        }
        for (const attr of schemaElement.getAttributes()) {
            const attrName: string = attr.getName();
            if (attrName === 'xmlns') {
                prefixMap.set('', attr.getValue());
            } else if (attrName.length > 6 && attrName.substring(0, 6) === 'xmlns:') {
                prefixMap.set(attrName.substring(6), attr.getValue());
            }
        }
        const blockDefaultAttr: XMLAttribute | undefined = schemaElement.getAttribute('blockDefault');
        if (blockDefaultAttr) {
            const key: string = targetNamespace !== undefined ? targetNamespace : '';
            if (!this.schemaBlockDefaults.has(key)) {
                this.schemaBlockDefaults.set(key, blockDefaultAttr.getValue().trim());
            }
        }
        const finalDefaultAttr: XMLAttribute | undefined = schemaElement.getAttribute('finalDefault');
        if (finalDefaultAttr) {
            const key: string = targetNamespace !== undefined ? targetNamespace : '';
            if (!this.schemaFinalDefaults.has(key)) {
                this.schemaFinalDefaults.set(key, finalDefaultAttr.getValue().trim());
            }
        }
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
        const nillableAttr: XMLAttribute | undefined = info.element.getAttribute('nillable');
        if (nillableAttr && nillableAttr.getValue() === 'true') {
            decl.setNillable(true);
        }
        const elementFixedAttr: XMLAttribute | undefined = info.element.getAttribute('fixed');
        if (elementFixedAttr) {
            decl.setFixedValue(elementFixedAttr.getValue());
        }
        const elementDefaultAttr: XMLAttribute | undefined = info.element.getAttribute('default');
        if (elementDefaultAttr) {
            decl.setDefaultValue(elementDefaultAttr.getValue());
        }
        const blockAttr: XMLAttribute | undefined = info.element.getAttribute('block');
        if (blockAttr) {
            const blockVal: string = blockAttr.getValue().trim();
            const blockSet: Set<string> = new Set<string>();
            if (blockVal === '#all') {
                blockSet.add('#all');
            } else {
                for (const token of blockVal.split(/\s+/)) {
                    if (token) {
                        blockSet.add(token);
                    }
                }
            }
            if (blockSet.size > 0) {
                decl.setBlockConstraints(blockSet);
            }
        } else {
            const defaultKey: string = info.namespace !== undefined ? info.namespace : '';
            const blockDefault: string | undefined = this.schemaBlockDefaults.get(defaultKey);
            if (blockDefault && blockDefault.length > 0) {
                const blockSet: Set<string> = new Set<string>();
                if (blockDefault === '#all') {
                    blockSet.add('#all');
                } else {
                    for (const token of blockDefault.split(/\s+/)) {
                        if (token) {
                            blockSet.add(token);
                        }
                    }
                }
                if (blockSet.size > 0) {
                    decl.setBlockConstraints(blockSet);
                }
            }
        }
        let typeElement: XMLElement | undefined;

        if (typeAttr) {
            typeElement = this.lookupComplexType(typeAttr.getValue());
        } else {
            typeElement = this.findChildByLocalName(info.element, 'complexType');
        }

        if (typeElement) {
            decl.setContentModel(this.buildContentModel(typeElement, info.namespace));
            const { attrs, anyAttributeNamespace, anyAttributeProcessContents, anyAttributeOwnerNs, anyAttributeExcludedNamespaces } = this.collectAllAttributes(typeElement, info.namespace);
            for (const attrDecl of attrs.values()) {
                decl.addAttributeDecl(attrDecl);
            }
            if (anyAttributeNamespace !== undefined) {
                decl.setAnyAttribute(anyAttributeNamespace, anyAttributeProcessContents, anyAttributeOwnerNs, anyAttributeExcludedNamespaces);
            }
            // xs:complexType with xs:simpleContent — text element with a simple base type.
            const simpleContentEl: XMLElement | undefined = this.findChildByLocalName(typeElement, 'simpleContent');
            if (simpleContentEl) {
                const derivation: XMLElement = this.unwrapDerivation(simpleContentEl);
                const baseAttr: XMLAttribute | undefined = derivation.getAttribute('base');
                if (baseAttr) {
                    decl.setSimpleType(this.normalizeXsdType(baseAttr.getValue(), info.namespace));
                }
            }
        } else if (typeAttr) {
            // Named simple type reference — text content only, no child elements.
            decl.setContentModel(SchemaContentModel.empty());
            const typeValue: string = this.normalizeXsdType(typeAttr.getValue(), info.namespace);
            if (SchemaBuilder.XSD_BUILT_IN_TYPES.has(typeValue)) {
                decl.setSimpleType(typeValue);
            } else {
                const localTypeName: string = this.getLocalName(typeValue);
                const namedSimpleType: XMLElement | undefined = this.simpleTypeDefinitions.get(localTypeName);
                if (namedSimpleType) {
                    // Detect union/list types and store their member/item type instead of resolving to xs:string.
                    const unionMembers: string[] = this.extractUnionMemberTypeNames(namedSimpleType);
                    if (unionMembers.length > 0) {
                        decl.setUnionMemberTypes(unionMembers);
                    } else {
                        const listItem: string | undefined = this.extractListItemTypeName(namedSimpleType);
                        if (listItem !== undefined) {
                            decl.setListItemType(listItem);
                        } else {
                            // Resolve base xs: type so validateTextContent can use SchemaTypeValidator.
                            const resolvedBase: string | undefined = this.resolveSimpleTypeBase(namedSimpleType);
                            if (resolvedBase) {
                                decl.setSimpleType(this.normalizeXsdType(resolvedBase, info.namespace));
                            }
                        }
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
                const unionMembers2: string[] = this.extractUnionMemberTypeNames(simpleTypeEl);
                if (unionMembers2.length > 0) {
                    decl.setUnionMemberTypes(unionMembers2);
                } else {
                    const listItem2: string | undefined = this.extractListItemTypeName(simpleTypeEl);
                    if (listItem2 !== undefined) {
                        decl.setListItemType(listItem2);
                    } else {
                        const resolvedBase2: string | undefined = this.resolveSimpleTypeBase(simpleTypeEl);
                        if (resolvedBase2) {
                            decl.setSimpleType(this.normalizeXsdType(resolvedBase2, info.namespace));
                        }
                    }
                }
                const facets: SchemaFacets = this.collectFacets(simpleTypeEl);
                decl.setTextFacets(facets);
            }
        }
        // No type, no inline complexType, no simpleType → leave the default ANY content model.

        for (const child of info.element.getChildren()) {
            const childLocal: string = this.getLocalName(child.getName());
            if (childLocal !== 'key' && childLocal !== 'keyref' && childLocal !== 'unique') {
                continue;
            }
            const nameAttr: XMLAttribute | undefined = child.getAttribute('name');
            const selectorEl: XMLElement | undefined = this.findChildByLocalName(child, 'selector');
            if (!nameAttr || !selectorEl) {
                continue;
            }
            const xpathAttr: XMLAttribute | undefined = selectorEl.getAttribute('xpath');
            if (!xpathAttr) {
                continue;
            }
            const fields: string[] = [];
            for (const fieldEl of child.getChildren()) {
                if (this.getLocalName(fieldEl.getName()) === 'field') {
                    const fieldXpathAttr: XMLAttribute | undefined = fieldEl.getAttribute('xpath');
                    if (fieldXpathAttr) {
                        fields.push(fieldXpathAttr.getValue().trim());
                    }
                }
            }
            const constraintLocalName: string = nameAttr.getValue().trim();
            const constraint: IdentityConstraint = {
                name: info.namespace ? info.namespace + '|' + constraintLocalName : constraintLocalName,
                kind: childLocal as 'key' | 'keyref' | 'unique',
                selector: xpathAttr.getValue().trim(),
                fields,
            };
            if (childLocal === 'keyref') {
                const referAttr: XMLAttribute | undefined = child.getAttribute('refer');
                if (referAttr) {
                    const referVal: string = referAttr.getValue().trim();
                    const colonIdx: number = referVal.indexOf(':');
                    if (colonIdx !== -1) {
                        const prefix: string = referVal.substring(0, colonIdx);
                        const localPart: string = referVal.substring(colonIdx + 1);
                        const pKey: string = info.namespace !== undefined ? info.namespace : '';
                        const pMap: Map<string, string> | undefined = this.schemaPrefixMaps.get(pKey);
                        const resolvedNs: string | undefined = pMap ? pMap.get(prefix) : undefined;
                        constraint.refer = resolvedNs ? resolvedNs + '|' + localPart : localPart;
                    } else {
                        constraint.refer = info.namespace ? info.namespace + '|' + referVal : referVal;
                    }
                }
            }
            decl.addIdentityConstraint(constraint);
        }

        return decl;
    }

    private buildContentModel(typeElement: XMLElement, namespace?: string, visitingTypes: Set<string> = new Set<string>()): SchemaContentModel {
        const mixedAttr: XMLAttribute | undefined = typeElement.getAttribute('mixed');
        const isMixed: boolean = mixedAttr !== undefined && mixedAttr.getValue() === 'true';

        // simpleContent → text content with attributes, no child elements.
        const simpleContentEl: XMLElement | undefined = this.findChildByLocalName(typeElement, 'simpleContent');
        if (simpleContentEl) {
            const derivationEl: XMLElement | undefined =
                this.findChildByLocalName(simpleContentEl, 'restriction') ||
                this.findChildByLocalName(simpleContentEl, 'extension');
            if (derivationEl) {
                const baseAttr: XMLAttribute | undefined = derivationEl.getAttribute('base');
                if (baseAttr) {
                    const baseTypeEl: XMLElement | undefined = this.lookupComplexType(baseAttr.getValue());
                    if (baseTypeEl) {
                        // base is a complex type — it must itself have simpleContent to be valid here
                        if (!this.findChildByLocalName(baseTypeEl, 'simpleContent')) {
                            throw new Error('simpleContent base "' + baseAttr.getValue() + '" is a complex type without simpleContent');
                        }
                    }
                }
            }
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
                    const headBlockSet: Set<string> = this.getElementBlockSet(particleName);
                    let members: Set<string> | undefined;
                    if (!headBlockSet.has('#all') && !headBlockSet.has('substitution')) {
                        const allMembers: Set<string> | undefined = this.substitutionGroups.get(particleName);
                        if (allMembers !== undefined) {
                            members = this.filterMembersByBlock(particleName, headBlockSet, allMembers);
                        }
                    }
                    particles.push(new SchemaElementParticle(particleName, min, max, members));
                }
            } else if (localName === 'any') {
                const nsAttr: XMLAttribute | undefined = child.getAttribute('namespace');
                const pcAttr: XMLAttribute | undefined = child.getAttribute('processContents');
                const ns: string = nsAttr ? nsAttr.getValue() : '##any';
                const pc: 'strict' | 'lax' | 'skip' = pcAttr
                    ? (pcAttr.getValue() as 'strict' | 'lax' | 'skip')
                    : 'strict';
                particles.push(new SchemaWildcardParticle(ns, pc, min, max, namespace));
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
            throw new Error('Reference to undeclared model group: "' + ref + '"');
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

    private collectAllAttributes(typeElement: XMLElement, namespace?: string): { attrs: Map<string, SchemaAttributeDecl>; anyAttributeNamespace: string | undefined; anyAttributeProcessContents: string; anyAttributeOwnerNs: string | undefined; anyAttributeExcludedNamespaces: string[] | undefined } {
        const attrs: Map<string, SchemaAttributeDecl> = new Map<string, SchemaAttributeDecl>();
        const visitedTypes: Set<string> = new Set<string>();
        const wildcards: Array<{ ns: string; pc: string; ownerNs: string | undefined; excluded: string[] | undefined }> = [];
        this.gatherAttributes(typeElement, attrs, visitedTypes, namespace, (ns, pc, ownerNs, excluded) => {
            wildcards.push({ ns, pc, ownerNs, excluded });
        });
        let anyAttributeNamespace: string | undefined = undefined;
        let anyAttributeProcessContents: string = 'strict';
        let anyAttributeOwnerNs: string | undefined = undefined;
        let anyAttributeExcludedNamespaces: string[] | undefined = undefined;
        if (wildcards.length > 0) {
            anyAttributeNamespace = wildcards[0].ns;
            anyAttributeProcessContents = wildcards[0].pc;
            anyAttributeOwnerNs = wildcards[0].ownerNs;
            anyAttributeExcludedNamespaces = wildcards[0].excluded;
            for (let i: number = 1; i < wildcards.length; i++) {
                const curr: { ns: string; pc: string; ownerNs: string | undefined; excluded: string[] | undefined } = wildcards[i];
                const combined: string = this.intersectNamespaceConstraints(anyAttributeNamespace, anyAttributeOwnerNs, curr.ns, curr.ownerNs);
                const ownerInfo: { ownerNs: string | undefined; excluded: string[] | undefined } = this.combineOwnerNsAfterIntersect(combined, anyAttributeOwnerNs, anyAttributeExcludedNamespaces, curr.ownerNs, curr.excluded);
                anyAttributeNamespace = combined;
                anyAttributeOwnerNs = ownerInfo.ownerNs;
                anyAttributeExcludedNamespaces = ownerInfo.excluded;
                anyAttributeProcessContents = this.intersectProcessContents(anyAttributeProcessContents, curr.pc);
            }
        }
        return { attrs, anyAttributeNamespace, anyAttributeProcessContents, anyAttributeOwnerNs, anyAttributeExcludedNamespaces };
    }

    private parseWildcardTokens(ns: string, targetNamespace: string | undefined): Set<string> | 'other' {
        if (ns === '##other') {
            return 'other';
        }
        const result: Set<string> = new Set<string>();
        for (const token of ns.split(/\s+/)) {
            if (token === '##local') {
                result.add('');
            } else if (token === '##targetNamespace') {
                result.add(targetNamespace || '');
            } else {
                result.add(token);
            }
        }
        return result;
    }

    private intersectNamespaceConstraints(a: string, ownerNsA: string | undefined, b: string, ownerNsB: string | undefined): string {
        if (a === '##any') {
            return b;
        }
        if (b === '##any') {
            return a;
        }
        if (a === '##empty' || b === '##empty') {
            return '##empty';
        }
        const parsedA: Set<string> | 'other' = this.parseWildcardTokens(a, ownerNsA);
        const parsedB: Set<string> | 'other' = this.parseWildcardTokens(b, ownerNsB);
        let result: Set<string>;
        if (parsedA === 'other' && parsedB === 'other') {
            return '##other';
        }
        if (parsedA === 'other') {
            result = new Set<string>();
            for (const u of parsedB as Set<string>) {
                if (u !== '' && u !== (ownerNsA || '')) {
                    result.add(u);
                }
            }
        } else if (parsedB === 'other') {
            result = new Set<string>();
            for (const u of parsedA) {
                if (u !== '' && u !== (ownerNsB || '')) {
                    result.add(u);
                }
            }
        } else {
            result = new Set<string>();
            for (const u of parsedA) {
                if (parsedB.has(u)) {
                    result.add(u);
                }
            }
        }
        if (result.size === 0) {
            return '##empty';
        }
        const tokens: string[] = [];
        for (const u of result) {
            tokens.push(u === '' ? '##local' : u);
        }
        return tokens.join(' ');
    }

    private intersectProcessContents(a: string, b: string): string {
        if (a === 'strict' || b === 'strict') {
            return 'strict';
        }
        if (a === 'lax' || b === 'lax') {
            return 'lax';
        }
        return 'skip';
    }

    private unionProcessContents(a: string, b: string): string {
        if (a === 'skip' || b === 'skip') {
            return 'skip';
        }
        if (a === 'lax' || b === 'lax') {
            return 'lax';
        }
        return 'strict';
    }

    private unionNamespaceConstraints(a: string, ownerNsA: string | undefined, b: string, ownerNsB: string | undefined): string {
        if (a === '##any' || b === '##any') {
            return '##any';
        }
        if (a === '##empty') {
            return b;
        }
        if (b === '##empty') {
            return a;
        }
        const parsedA: Set<string> | 'other' = this.parseWildcardTokens(a, ownerNsA);
        const parsedB: Set<string> | 'other' = this.parseWildcardTokens(b, ownerNsB);
        if (parsedA === 'other' && parsedB === 'other') {
            if (ownerNsA !== ownerNsB) {
                return '##any';
            }
            return '##other';
        }
        if (parsedA === 'other') {
            for (const u of parsedB as Set<string>) {
                if (u === '' || u === (ownerNsA || '')) {
                    return '##any';
                }
            }
            return '##other';
        }
        if (parsedB === 'other') {
            for (const u of parsedA) {
                if (u === '' || u === (ownerNsB || '')) {
                    return '##any';
                }
            }
            return '##other';
        }
        const result: Set<string> = new Set<string>([...parsedA, ...parsedB]);
        const tokens: string[] = [];
        for (const u of result) {
            tokens.push(u === '' ? '##local' : u);
        }
        return tokens.join(' ');
    }

    private combineOwnerNsAfterIntersect(
        resultNs: string,
        prevOwner: string | undefined,
        prevExcluded: string[] | undefined,
        currOwner: string | undefined,
        currExcluded: string[] | undefined
    ): { ownerNs: string | undefined; excluded: string[] | undefined } {
        if (resultNs !== '##other') {
            return { ownerNs: undefined, excluded: undefined };
        }
        const excl: Set<string> = new Set<string>();
        if (prevExcluded !== undefined && prevExcluded.length > 0) {
            for (const n of prevExcluded) {
                excl.add(n);
            }
        } else if (prevOwner !== undefined) {
            excl.add(prevOwner);
        }
        if (currExcluded !== undefined && currExcluded.length > 0) {
            for (const n of currExcluded) {
                excl.add(n);
            }
        } else if (currOwner !== undefined) {
            excl.add(currOwner);
        }
        if (excl.size === 0) {
            return { ownerNs: undefined, excluded: undefined };
        }
        if (excl.size === 1) {
            return { ownerNs: Array.from(excl)[0], excluded: undefined };
        }
        return { ownerNs: undefined, excluded: Array.from(excl) };
    }

    private combineOwnerNsAfterUnion(
        resultNs: string,
        prevOwner: string | undefined
    ): { ownerNs: string | undefined; excluded: string[] | undefined } {
        if (resultNs !== '##other') {
            return { ownerNs: undefined, excluded: undefined };
        }
        return { ownerNs: prevOwner, excluded: undefined };
    }

    private gatherAttributes(el: XMLElement, result: Map<string, SchemaAttributeDecl>, visitedTypes: Set<string>, namespace?: string, onAnyAttribute?: (ns: string, pc: string, ownerNs: string | undefined, excluded?: string[]) => void): void {
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
                    const pcAttr: XMLAttribute | undefined = child.getAttribute('processContents');
                    onAnyAttribute(nsAttr ? nsAttr.getValue() : '##any', pcAttr ? pcAttr.getValue() : 'strict', namespace);
                }
            } else if (localName === 'attributeGroup') {
                const refAttr: XMLAttribute | undefined = child.getAttribute('ref');
                if (refAttr) {
                    const groupInfo: { element: XMLElement; namespace: string | undefined } | undefined = this.lookupAttributeGroupWithNamespace(refAttr.getValue());
                    if (groupInfo) {
                        this.gatherAttributes(groupInfo.element, result, visitedTypes, groupInfo.namespace, onAnyAttribute);
                    } else {
                        throw new Error('Reference to undeclared attribute group: "' + refAttr.getValue() + '"');
                    }
                }
            } else if (localName === 'complexContent' || localName === 'simpleContent') {
                this.gatherAttributes(child, result, visitedTypes, namespace, onAnyAttribute);
            } else if (localName === 'extension' || localName === 'restriction') {
                const isExtension: boolean = localName === 'extension';
                const baseAttr: XMLAttribute | undefined = child.getAttribute('base');
                let baseNs: string | undefined;
                let baseNsOwner: string | undefined;
                let baseNsExcluded: string[] | undefined;
                let basePc: string = 'strict';
                if (baseAttr) {
                    const baseLocalName: string = this.getLocalName(baseAttr.getValue());
                    if (!visitedTypes.has(baseLocalName)) {
                        visitedTypes.add(baseLocalName);
                        const baseTypeInfo: { element: XMLElement; namespace: string | undefined } | undefined = this.lookupComplexTypeWithNamespace(baseAttr.getValue());
                        if (baseTypeInfo) {
                            this.gatherAttributes(baseTypeInfo.element, result, visitedTypes, baseTypeInfo.namespace, (ns, pc, ownerNs, excluded) => {
                                if (baseNs === undefined) {
                                    baseNs = ns;
                                    baseNsOwner = ownerNs;
                                    baseNsExcluded = excluded;
                                    basePc = pc;
                                } else {
                                    const combined: string = this.intersectNamespaceConstraints(baseNs, baseNsOwner, ns, ownerNs);
                                    const ownerInfo: { ownerNs: string | undefined; excluded: string[] | undefined } = this.combineOwnerNsAfterIntersect(combined, baseNsOwner, baseNsExcluded, ownerNs, excluded);
                                    baseNs = combined;
                                    baseNsOwner = ownerInfo.ownerNs;
                                    baseNsExcluded = ownerInfo.excluded;
                                    basePc = this.intersectProcessContents(basePc, pc);
                                }
                            });
                        }
                    }
                }
                let derivedNs: string | undefined;
                let derivedNsOwner: string | undefined;
                let derivedNsExcluded: string[] | undefined;
                let derivedPc: string = 'strict';
                this.gatherAttributes(child, result, visitedTypes, namespace, (ns, pc, ownerNs, excluded) => {
                    if (derivedNs === undefined) {
                        derivedNs = ns;
                        derivedNsOwner = ownerNs;
                        derivedNsExcluded = excluded;
                        derivedPc = pc;
                    } else {
                        const combined: string = this.intersectNamespaceConstraints(derivedNs, derivedNsOwner, ns, ownerNs);
                        const ownerInfo: { ownerNs: string | undefined; excluded: string[] | undefined } = this.combineOwnerNsAfterIntersect(combined, derivedNsOwner, derivedNsExcluded, ownerNs, excluded);
                        derivedNs = combined;
                        derivedNsOwner = ownerInfo.ownerNs;
                        derivedNsExcluded = ownerInfo.excluded;
                        derivedPc = this.intersectProcessContents(derivedPc, pc);
                    }
                });
                if (onAnyAttribute) {
                    if (baseNs !== undefined && derivedNs !== undefined) {
                        if (isExtension) {
                            const combined: string = this.unionNamespaceConstraints(baseNs, baseNsOwner, derivedNs, derivedNsOwner);
                            const ownerInfo: { ownerNs: string | undefined; excluded: string[] | undefined } = this.combineOwnerNsAfterUnion(combined, baseNsOwner);
                            onAnyAttribute(combined, this.unionProcessContents(basePc, derivedPc), ownerInfo.ownerNs, ownerInfo.excluded);
                        } else {
                            const combined: string = this.intersectNamespaceConstraints(baseNs, baseNsOwner, derivedNs, derivedNsOwner);
                            const ownerInfo: { ownerNs: string | undefined; excluded: string[] | undefined } = this.combineOwnerNsAfterIntersect(combined, baseNsOwner, baseNsExcluded, derivedNsOwner, derivedNsExcluded);
                            onAnyAttribute(combined, this.intersectProcessContents(basePc, derivedPc), ownerInfo.ownerNs, ownerInfo.excluded);
                        }
                    } else if (baseNs !== undefined) {
                        onAnyAttribute(baseNs, basePc, baseNsOwner, baseNsExcluded);
                    } else if (derivedNs !== undefined) {
                        onAnyAttribute(derivedNs, derivedPc, derivedNsOwner, derivedNsExcluded);
                    }
                }
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
        let type: string = 'string';
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
                throw new Error('Reference to undeclared attribute: "' + refAttr.getValue() + '"');
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

        type = this.normalizeXsdType(type, namespace);

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
        } else if (!SchemaBuilder.XSD_BUILT_IN_TYPES.has(type)) {
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
        if (this.findChildByLocalName(simpleTypeEl, 'list')) {
            facets.isList = true;
            return facets;
        }
        const restrictionEl: XMLElement | undefined = this.findChildByLocalName(simpleTypeEl, 'restriction');
        if (!restrictionEl) {
            return facets;
        }
        const baseAttr: XMLAttribute | undefined = restrictionEl.getAttribute('base');
        let parentFacets: SchemaFacets | undefined;
        if (baseAttr) {
            const baseLocal: string = this.getLocalName(baseAttr.getValue());
            if (baseLocal === 'normalizedString') {
                facets.whiteSpace = 'replace';
            } else if (baseLocal === 'token' || baseLocal === 'language' || baseLocal === 'Name' ||
                       baseLocal === 'NCName' || baseLocal === 'ID' || baseLocal === 'IDREF' ||
                       baseLocal === 'ENTITY' || baseLocal === 'NMTOKEN' ||
                       baseLocal === 'decimal' || baseLocal === 'float' || baseLocal === 'double' ||
                       baseLocal === 'integer' || baseLocal === 'long' || baseLocal === 'int' ||
                       baseLocal === 'short' || baseLocal === 'byte' || baseLocal === 'unsignedLong' ||
                       baseLocal === 'unsignedInt' || baseLocal === 'unsignedShort' || baseLocal === 'unsignedByte' ||
                       baseLocal === 'nonNegativeInteger' || baseLocal === 'positiveInteger' ||
                       baseLocal === 'nonPositiveInteger' || baseLocal === 'negativeInteger' ||
                       baseLocal === 'boolean' || baseLocal === 'dateTime' || baseLocal === 'date' ||
                       baseLocal === 'time' || baseLocal === 'duration' || baseLocal === 'gYear' ||
                       baseLocal === 'gYearMonth' || baseLocal === 'gMonth' || baseLocal === 'gMonthDay' ||
                       baseLocal === 'gDay' || baseLocal === 'hexBinary' || baseLocal === 'base64Binary' ||
                       baseLocal === 'anyURI' || baseLocal === 'QName' || baseLocal === 'NOTATION') {
                facets.whiteSpace = 'collapse';
            }
            const namedBase: XMLElement | undefined = this.simpleTypeDefinitions.get(baseLocal);
            if (namedBase) {
                if (this.findChildByLocalName(namedBase, 'list')) {
                    facets.isList = true;
                }
                parentFacets = this.collectFacets(namedBase);
                if (parentFacets.whiteSpace !== undefined) {
                    facets.whiteSpace = parentFacets.whiteSpace;
                }
            } else if (baseLocal === 'IDREFS' || baseLocal === 'ENTITIES' || baseLocal === 'NMTOKENS') {
                facets.isList = true;
            }
        }
        const currentPatterns: string[] = [];
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
                currentPatterns.push(val);
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
            } else if (localChildName === 'whiteSpace') {
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
            if (facets.enumeration === undefined && parentFacets.enumeration !== undefined) {
                facets.enumeration = parentFacets.enumeration;
            }
            if (facets.minExclusive === undefined && parentFacets.minExclusive !== undefined) {
                facets.minExclusive = parentFacets.minExclusive;
            }
            if (facets.maxExclusive === undefined && parentFacets.maxExclusive !== undefined) {
                facets.maxExclusive = parentFacets.maxExclusive;
            }
            if (facets.minInclusive === undefined && parentFacets.minInclusive !== undefined) {
                facets.minInclusive = parentFacets.minInclusive;
            }
            if (facets.maxInclusive === undefined && parentFacets.maxInclusive !== undefined) {
                facets.maxInclusive = parentFacets.maxInclusive;
            }
            if (facets.length === undefined && parentFacets.length !== undefined) {
                facets.length = parentFacets.length;
            }
            if (facets.minLength === undefined && parentFacets.minLength !== undefined) {
                facets.minLength = parentFacets.minLength;
            }
            if (facets.maxLength === undefined && parentFacets.maxLength !== undefined) {
                facets.maxLength = parentFacets.maxLength;
            }
            if (facets.totalDigits === undefined && parentFacets.totalDigits !== undefined) {
                facets.totalDigits = parentFacets.totalDigits;
            }
            if (facets.fractionDigits === undefined && parentFacets.fractionDigits !== undefined) {
                facets.fractionDigits = parentFacets.fractionDigits;
            }
            if (facets.whiteSpace === undefined && parentFacets.whiteSpace !== undefined) {
                facets.whiteSpace = parentFacets.whiteSpace;
            }
            if (facets.isList === undefined && parentFacets.isList !== undefined) {
                facets.isList = parentFacets.isList;
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

    private collectPatterns(simpleTypeEl: XMLElement): string[][] {
        const patterns: string[] = [];
        const restrictionEl: XMLElement | undefined = this.findChildByLocalName(simpleTypeEl, 'restriction');
        if (!restrictionEl) {
            return [];
        }
        for (const child of restrictionEl.getChildren()) {
            if (this.getLocalName(child.getName()) === 'pattern') {
                const valueAttr: XMLAttribute | undefined = child.getAttribute('value');
                if (valueAttr) {
                    patterns.push(this.resolveCharRefs(valueAttr.getValue()));
                }
            }
        }
        return patterns.length > 0 ? [patterns] : [];
    }


    private collectUnionAlternatives(simpleTypeEl: XMLElement): Array<{enumerations: string[], patterns: string[][]}>  {
        const alternatives: Array<{enumerations: string[], patterns: string[][]}>  = [];
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
        const unionAlts: Array<{enumerations: string[], patterns: string[][]}> = this.collectUnionAlternatives(simpleTypeEl);
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
        if (facets.whiteSpace !== undefined) {
            decl.setWhiteSpace(facets.whiteSpace);
        }
        if (facets.isList !== undefined) {
            decl.setIsList(facets.isList);
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

    private normalizeXsdType(typeValue: string, namespace?: string): string {
        const colonIdx: number = typeValue.indexOf(':');
        if (colonIdx === -1) {
            return typeValue;
        }
        const prefix: string = typeValue.substring(0, colonIdx);
        const localPart: string = typeValue.substring(colonIdx + 1);
        const nsKey: string = namespace !== undefined ? namespace : '';
        const prefixMap: Map<string, string> | undefined = this.schemaPrefixMaps.get(nsKey);
        if (prefixMap !== undefined) {
            const uri: string | undefined = prefixMap.get(prefix);
            if (uri === 'http://www.w3.org/2001/XMLSchema') {
                return localPart;
            }
        }
        if (nsKey !== '') {
            const fallbackMap: Map<string, string> | undefined = this.schemaPrefixMaps.get('');
            if (fallbackMap !== undefined) {
                const uri: string | undefined = fallbackMap.get(prefix);
                if (uri === 'http://www.w3.org/2001/XMLSchema') {
                    return localPart;
                }
            }
        }
        for (const [, map] of this.schemaPrefixMaps) {
            const uri: string | undefined = map.get(prefix);
            if (uri === 'http://www.w3.org/2001/XMLSchema') {
                return localPart;
            }
        }
        return typeValue;
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
            return 'string';
        }
        return undefined;
    }

    private extractUnionMemberTypeNames(simpleTypeEl: XMLElement): string[] {
        const unionEl: XMLElement | undefined = this.findChildByLocalName(simpleTypeEl, 'union');
        if (!unionEl) {
            return [];
        }
        const names: string[] = [];
        const memberTypesAttr: XMLAttribute | undefined = unionEl.getAttribute('memberTypes');
        if (memberTypesAttr) {
            for (const name of memberTypesAttr.getValue().trim().split(/\s+/)) {
                if (name) {
                    names.push(name);
                }
            }
        }
        for (const child of unionEl.getChildren()) {
            if (this.getLocalName(child.getName()) === 'simpleType') {
                const base: string | undefined = this.resolveSimpleTypeBase(child);
                if (base) {
                    names.push(base);
                }
            }
        }
        return names;
    }

    private extractListItemTypeName(simpleTypeEl: XMLElement): string | undefined {
        const listEl: XMLElement | undefined = this.findChildByLocalName(simpleTypeEl, 'list');
        if (!listEl) {
            return undefined;
        }
        const itemTypeAttr: XMLAttribute | undefined = listEl.getAttribute('itemType');
        if (itemTypeAttr) {
            return itemTypeAttr.getValue();
        }
        const inlineSimpleType: XMLElement | undefined = this.findChildByLocalName(listEl, 'simpleType');
        if (inlineSimpleType) {
            return this.resolveSimpleTypeBase(inlineSimpleType);
        }
        return undefined;
    }

    private findTypeBase(typeElement: XMLElement): {base: string, method: string} | undefined {
        const complexContentEl: XMLElement | undefined = this.findChildByLocalName(typeElement, 'complexContent');
        if (complexContentEl) {
            const extEl: XMLElement | undefined = this.findChildByLocalName(complexContentEl, 'extension');
            if (extEl) {
                const baseAttr: XMLAttribute | undefined = extEl.getAttribute('base');
                if (baseAttr) {
                    return {base: this.getLocalName(baseAttr.getValue()), method: 'extension'};
                }
            }
            const restrEl: XMLElement | undefined = this.findChildByLocalName(complexContentEl, 'restriction');
            if (restrEl) {
                const baseAttr: XMLAttribute | undefined = restrEl.getAttribute('base');
                if (baseAttr) {
                    return {base: this.getLocalName(baseAttr.getValue()), method: 'restriction'};
                }
            }
        }
        const simpleContentEl: XMLElement | undefined = this.findChildByLocalName(typeElement, 'simpleContent');
        if (simpleContentEl) {
            const extEl: XMLElement | undefined = this.findChildByLocalName(simpleContentEl, 'extension');
            if (extEl) {
                const baseAttr: XMLAttribute | undefined = extEl.getAttribute('base');
                if (baseAttr) {
                    return {base: this.getLocalName(baseAttr.getValue()), method: 'extension'};
                }
            }
            const restrEl: XMLElement | undefined = this.findChildByLocalName(simpleContentEl, 'restriction');
            if (restrEl) {
                const baseAttr: XMLAttribute | undefined = restrEl.getAttribute('base');
                if (baseAttr) {
                    return {base: this.getLocalName(baseAttr.getValue()), method: 'restriction'};
                }
            }
        }
        return undefined;
    }

    private getElementBlockSet(elementLocalName: string): Set<string> {
        for (const [namespace, info] of this.elementDefinitions) {
            if (info.localName === elementLocalName) {
                const blockAttr: XMLAttribute | undefined = info.element.getAttribute('block');
                let val: string;
                if (blockAttr) {
                    val = blockAttr.getValue().trim();
                } else {
                    const defaultKey: string = namespace !== undefined ? namespace : '';
                    val = this.schemaBlockDefaults.get(defaultKey) ?? '';
                }
                const result: Set<string> = new Set<string>();
                if (val === '#all') {
                    result.add('#all');
                } else {
                    for (const token of val.split(/\s+/)) {
                        if (token) {
                            result.add(token);
                        }
                    }
                }
                return result;
            }
        }
        return new Set<string>();
    }

    private getElementDeclaredType(localName: string): string | undefined {
        for (const [, info] of this.elementDefinitions) {
            if (info.localName === localName) {
                const typeAttr: XMLAttribute | undefined = info.element.getAttribute('type');
                if (typeAttr) {
                    return this.getLocalName(typeAttr.getValue());
                }
                return undefined;
            }
        }
        return undefined;
    }

    private isMemberTypeBlocked(
        memberType: string,
        headType: string,
        blocksExtension: boolean,
        blocksRestriction: boolean
    ): boolean {
        let current: string | undefined = memberType;
        const visited: Set<string> = new Set<string>();
        while (current !== undefined && current !== headType) {
            if (visited.has(current)) {
                break;
            }
            visited.add(current);
            const entry: {base: string, method: string} | undefined = this.earlyTypeHierarchy.get(current);
            if (!entry) {
                break;
            }
            if (blocksExtension && entry.method === 'extension') {
                return true;
            }
            if (blocksRestriction && entry.method === 'restriction') {
                return true;
            }
            current = entry.base;
        }
        return false;
    }

    private filterMembersByBlock(
        headLocalName: string,
        blockSet: Set<string>,
        allMembers: Set<string>
    ): Set<string> {
        const blocksExtension: boolean = blockSet.has('#all') || blockSet.has('extension');
        const blocksRestriction: boolean = blockSet.has('#all') || blockSet.has('restriction');
        if (!blocksExtension && !blocksRestriction) {
            return allMembers;
        }
        const headType: string | undefined = this.getElementDeclaredType(headLocalName);
        if (headType === undefined) {
            return allMembers;
        }
        const filtered: Set<string> = new Set<string>();
        for (const member of allMembers) {
            const memberType: string | undefined = this.getElementDeclaredType(member);
            if (memberType === undefined) {
                filtered.add(member);
                continue;
            }
            if (!this.isMemberTypeBlocked(memberType, headType, blocksExtension, blocksRestriction)) {
                filtered.add(member);
            }
        }
        return filtered;
    }
}
