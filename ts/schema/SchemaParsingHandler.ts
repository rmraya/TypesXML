/*******************************************************************************
 * Copyright (c) 2023-2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { Catalog } from "../Catalog";
import { ContentHandler } from "../ContentHandler";
import { GrammarHandler } from "../grammar/GrammarHandler";
import { XMLAttribute } from "../XMLAttribute";
import { XMLUtils } from "../XMLUtils";
import { AllModel } from "./AllModel";
import { AnyModel } from "./AnyModel";
import { SchemaAttributeDecl } from "./Attribute";
import { AttributeGroup } from "./AttributeGroup";
import { ChoiceModel } from "./ChoiceModel";
import { ComplexType } from "./ComplexType";
import { ContentModel } from "./ContentModel";
import { SchemaElementDecl } from "./Element";
import { ElementModel } from "./ElementModel";
import { GroupModel } from "./GroupModel";
import { SequenceModel } from "./SequenceModel";
import { SimpleType } from "./SimpleType";
import { XMLSchemaGrammar } from "./XMLSchemaGrammar";

export class SchemaParsingHandler implements ContentHandler {
    private grammar: XMLSchemaGrammar;
    private elementStack: string[] = [];
    private currentElement?: string;
    private targetNamespace: string = '';
    private elementFormDefault: boolean = false;
    private attributeFormDefault: boolean = false;

    // Namespace prefix mapping
    private namespacePrefixes: Map<string, string> = new Map();
    private defaultNamespace: string = '';

    // Schema composition tracking
    private includes: string[] = [];
    private imports: Array<{ namespace: string, location?: string }> = [];

    // Type being processed
    private currentType?: SimpleType | ComplexType;
    private currentElementDecl?: SchemaElementDecl;
    private currentAttributeDecl?: SchemaAttributeDecl;
    private currentAttributeGroup?: AttributeGroup;

    // Content model tracking
    private contentModelStack: ContentModel[] = [];
    private currentContentModel?: ContentModel;

    // Group definitions storage
    private groupDefinitions: Map<string, ContentModel> = new Map();
    private currentGroupModel?: GroupModel;

    // Attribute group definitions storage
    private attributeGroupDefinitions: Map<string, AttributeGroup> = new Map();
    private attributeGroupReferences: Array<{
        ref: string;
        refQName: string;
        targetComplexType: ComplexType;
        elementPath: string;
    }> = [];

    // Track the most recent anonymous complex type for attribute group resolution
    private lastAnonymousComplexType?: ComplexType;

    // Deferred group references (for forward references)
    private deferredGroupReferences: Array<{
        ref: string;
        refQName: string;
        localName: string;
        minOccurs: number;
        maxOccursValue: number;
        parentContext: any;
        contextType: 'sequence' | 'choice' | 'all' | 'complexType';
    }> = [];

    // Cross-schema resolver for group references
    private crossSchemaResolver?: (qualifiedName: string) => ContentModel | undefined;

    // Cross-schema resolver for attribute group references
    private crossSchemaAttributeGroupResolver?: (qualifiedName: string) => AttributeGroup | undefined;

    constructor(
        grammar: XMLSchemaGrammar,
        crossSchemaResolver?: (qualifiedName: string) => ContentModel | undefined,
        crossSchemaAttributeGroupResolver?: (qualifiedName: string) => AttributeGroup | undefined
    ) {
        this.grammar = grammar;
        this.crossSchemaResolver = crossSchemaResolver;
        this.crossSchemaAttributeGroupResolver = crossSchemaAttributeGroupResolver;
    }

    setCatalog(catalog: Catalog): void {
        // Not used in schema parsing
    }

    setValidating(validating: boolean): void {
        // Not used in schema parsing
    }

    setIncludeDefaultAttributes(include: boolean): void {
        // Not used in schema parsing
    }

    setGrammarHandler(grammarHandler: GrammarHandler): void {
        // Not used in schema parsing - schema handler uses XMLSchemaGrammar directly
    }

    getIncludes(): string[] {
        return this.includes;
    }

    getImports(): Array<{ namespace: string, location?: string }> {
        return this.imports;
    }

    getNamespaceResolver(): (prefix: string) => string {
        return (prefix: string) => {
            if (prefix === '') {
                return this.elementFormDefault ? this.targetNamespace : '';
            }
            return this.namespacePrefixes.get(prefix) || '';
        };
    }

    getNamespacePrefixes(): Map<string, string> {
        return new Map(this.namespacePrefixes);
    }

    getGroupDefinitions(): Map<string, ContentModel> {
        return new Map(this.groupDefinitions);
    }

    getAttributeGroupDefinitions(): Map<string, AttributeGroup> {
        return new Map(this.attributeGroupDefinitions);
    }

    getAttributeGroupReferences(): Array<{
        ref: string;
        refQName: string;
        targetComplexType: ComplexType;
        elementPath: string;
    }> {
        return [...this.attributeGroupReferences];
    }

    getTargetNamespace(): string {
        return this.targetNamespace;
    }

    private getPrefixForNamespace(namespaceURI: string): string | undefined {
        for (const [prefix, uri] of Array.from(this.namespacePrefixes.entries())) {
            if (uri === namespaceURI) {
                return prefix;
            }
        }
        return undefined;
    }

    getElementFormDefault(): boolean {
        return this.elementFormDefault;
    }

    initialize(): void {
        this.elementStack = [];
        this.includes = [];
        this.imports = [];
    }

    startDocument(): void {
        // Schema parsing setup
    }

    endDocument(): void {
        // Resolve any deferred group references after all definitions are processed
        this.resolveDeferredGroupReferences();

        // Note: Attribute group resolution is deferred until after include/import processing 
        // in XMLSchemaParser to ensure all components are available

        // Schema parsing cleanup
    }

    xmlDeclaration(version: string, encoding: string, standalone: string | undefined): void {
        // Not needed for schema parsing
    }

    startElement(name: string, attributes: XMLAttribute[]): void {
        this.currentElement = name;
        this.elementStack.push(name);

        // Process namespace declarations first
        this.processNamespaceDeclarations(attributes);

        const localName = this.getLocalName(name);

        switch (localName) {
            case 'schema':
                this.processSchemaElement(attributes);
                break;
            case 'element':
                this.processElementDeclaration(attributes);
                break;
            case 'complexType':
                this.processComplexTypeDefinition(attributes);
                break;
            case 'simpleType':
                this.processSimpleTypeDefinition(attributes);
                break;
            case 'attribute':
                this.processAttributeDeclaration(attributes);
                break;
            case 'anyAttribute':
                this.processAnyAttribute(attributes);
                break;
            case 'sequence':
                this.processSequence(attributes);
                break;
            case 'choice':
                this.processChoice(attributes);
                break;
            case 'all':
                this.processAll(attributes);
                break;
            case 'any':
                this.processAny(attributes);
                break;
            case 'restriction':
                this.processRestriction(attributes);
                break;
            case 'extension':
                this.processExtension(attributes);
                break;
            case 'enumeration':
                this.processEnumeration(attributes);
                break;
            case 'pattern':
                this.processPattern(attributes);
                break;
            case 'minLength':
            case 'maxLength':
            case 'length':
            case 'minInclusive':
            case 'maxInclusive':
            case 'minExclusive':
            case 'maxExclusive':
            case 'totalDigits':
            case 'fractionDigits':
            case 'whiteSpace':
                this.processFacet(localName, attributes);
                break;
            case 'import':
                this.processImport(attributes);
                break;
            case 'include':
                this.processInclude(attributes);
                break;
            case 'group':
                this.processGroup(attributes);
                break;
            case 'attributeGroup':
                this.processAttributeGroup(attributes);
                break;
            case 'union':
                this.processUnion(attributes);
                break;
            case 'list':
                this.processList(attributes);
                break;
            case 'notation':
                this.processNotation(attributes);
                break;
        }
    }

    endElement(name: string): void {
        const localName = this.getLocalName(name);

        switch (localName) {
            case 'complexType':
                this.finishComplexType();
                break;
            case 'simpleType':
                this.finishSimpleType();
                break;
            case 'element':
                this.finishElementDeclaration();
                break;
            case 'attribute':
                this.finishAttributeDeclaration();
                break;
            case 'sequence':
                this.finishSequence();
                break;
            case 'choice':
                this.finishChoice();
                break;
            case 'all':
                this.finishAll();
                break;
            case 'group':
                this.finishGroup();
                break;
        }

        this.elementStack.pop();
        this.currentElement = this.elementStack.length > 0 ?
            this.elementStack[this.elementStack.length - 1] : undefined;
    }

    internalSubset(declaration: string): void {
        // Not used in schema parsing
    }

    characters(ch: string): void {
        // Schema parsing doesn't need character content
    }

    ignorableWhitespace(ch: string): void {
        // Ignore whitespace in schema
    }

    comment(ch: string): void {
        // Ignore comments in schema
    }

    processingInstruction(target: string, data: string): void {
        // Ignore PIs in schema
    }

    startCDATA(): void {
        // Not used in schema parsing
    }

    endCDATA(): void {
        // Not used in schema parsing
    }

    startDTD(name: string, publicId: string, systemId: string): void {
        // Not used in schema parsing
    }

    endDTD(): void {
        // Not used in schema parsing
    }

    skippedEntity(name: string): void {
        // Not used in schema parsing
    }

    private getLocalName(qName: string): string {
        const colonIndex = qName.indexOf(':');
        return colonIndex !== -1 ? qName.substring(colonIndex + 1) : qName;
    }

    private getAttributeValue(attributes: XMLAttribute[], name: string): string | undefined {
        for (const attr of attributes) {
            if (attr.getName() === name || this.getLocalName(attr.getName()) === name) {
                return attr.getValue();
            }
        }
        return undefined;
    }

    private processSchemaElement(attributes: XMLAttribute[]): void {
        // Extract target namespace
        this.targetNamespace = this.getAttributeValue(attributes, 'targetNamespace') || '';
        this.grammar.setTargetNamespace(this.targetNamespace);

        // Extract form defaults
        this.elementFormDefault = this.getAttributeValue(attributes, 'elementFormDefault') === 'qualified';
        this.attributeFormDefault = this.getAttributeValue(attributes, 'attributeFormDefault') === 'qualified';

        this.grammar.setFormDefaults(this.elementFormDefault, this.attributeFormDefault);
    }

    private processElementDeclaration(attributes: XMLAttribute[]): void {
        const name = this.getAttributeValue(attributes, 'name');
        const ref = this.getAttributeValue(attributes, 'ref');
        const type = this.getAttributeValue(attributes, 'type');

        // Schema spec requires exactly one of 'name' or 'ref'
        if (!name && !ref) {
            throw new Error("Schema validation error: element declaration must have either 'name' or 'ref' attribute");
        }
        if (name && ref) {
            throw new Error("Schema validation error: element declaration cannot have both 'name' and 'ref' attributes");
        }

        // Names must be valid NCName tokens per XML Schema specification
        if (name && !XMLUtils.isValidNCName(name)) {
            throw new Error(`Schema validation error: element name '${name}' is not a valid NCName`);
        }

        // Parse occurrence constraints
        const minOccurs = this.parseOccurrence(this.getAttributeValue(attributes, 'minOccurs'), 1);
        const maxOccurs = this.parseOccurrence(this.getAttributeValue(attributes, 'maxOccurs'), 1);

        // Validate occurrence constraints
        if (minOccurs < 0) {
            throw new Error(`Schema validation error: minOccurs must be non-negative, got ${minOccurs}`);
        }
        if (maxOccurs !== -1 && maxOccurs < minOccurs) {
            throw new Error(`Schema validation error: maxOccurs (${maxOccurs}) must be greater than or equal to minOccurs (${minOccurs})`);
        }

        if (this.currentContentModel) {
            // Inside a content model (sequence/choice/all) - create element particle
            let elementName: string;

            if (ref) {
                // Element reference - use the referenced element's qualified name
                elementName = this.parseQName(ref);
            } else if (name) {
                // Inline element declaration - apply form qualification rules
                if (this.elementFormDefault && this.targetNamespace) {
                    const prefix = this.getPrefixForNamespace(this.targetNamespace);
                    elementName = prefix ? `${prefix}:${name}` : name;
                } else {
                    elementName = name;
                }

                // Register inline elements in grammar for attribute lookup
                const elementDecl = new SchemaElementDecl(elementName);

                if (type) {
                    const typeQName = this.parseQName(type);
                    elementDecl.setTypeName(typeQName);
                }

                // Handle other attributes
                elementDecl.setMinOccurs(minOccurs);
                elementDecl.setMaxOccurs(maxOccurs === -1 ? 'unbounded' : maxOccurs);

                const abstract = this.getAttributeValue(attributes, 'abstract');
                if (abstract === 'true') {
                    elementDecl.setAbstract(true);
                }

                const substitutionGroup = this.getAttributeValue(attributes, 'substitutionGroup');
                if (substitutionGroup) {
                    const substitutionGroupQName = this.parseQName(substitutionGroup);
                    elementDecl.setSubstitutionGroup(substitutionGroupQName);
                }

                // Add to grammar so it can be found for attribute processing
                this.grammar.addElementDeclaration(elementName, elementDecl);
                this.currentElementDecl = elementDecl;
            } else {
                // Should never reach here due to validation above
                return;
            }

            // For CompositeGrammar storage consistency, ensure element name has prefix
            const elementNameForStorage: string = this.ensureElementPrefix(elementName);
            const particle = new ElementModel(elementNameForStorage, minOccurs, maxOccurs);

            // Add particle to current content model based on its type
            if (this.currentContentModel instanceof SequenceModel) {
                this.currentContentModel.addParticle(particle);
            } else if (this.currentContentModel instanceof ChoiceModel) {
                this.currentContentModel.addParticle(particle);
            } else if (this.currentContentModel instanceof AllModel) {
                this.currentContentModel.addParticle(particle);
            }
        } else if (name) {
            // Global element declaration - register in schema grammar
            let qname = name;
            if (this.targetNamespace) {
                const prefix = this.getPrefixForNamespace(this.targetNamespace);
                qname = prefix ? `${prefix}:${name}` : name;
            }
            const elementDecl = new SchemaElementDecl(qname);

            if (type) {
                const typeQName = this.parseQName(type);
                elementDecl.setTypeName(typeQName);
            }

            // Handle other attributes
            elementDecl.setMinOccurs(minOccurs);
            elementDecl.setMaxOccurs(maxOccurs === -1 ? 'unbounded' : maxOccurs);

            const nillable = this.getAttributeValue(attributes, 'nillable');
            if (nillable === 'true') {
                elementDecl.setNillable(true);
            }

            const abstract = this.getAttributeValue(attributes, 'abstract');
            if (abstract === 'true') {
                elementDecl.setAbstract(true);
            }

            const substitutionGroup = this.getAttributeValue(attributes, 'substitutionGroup');
            if (substitutionGroup) {
                const substitutionGroupQName = this.parseQName(substitutionGroup);
                elementDecl.setSubstitutionGroup(substitutionGroupQName);
            }

            this.currentElementDecl = elementDecl;
            this.grammar.addElementDeclaration(qname, elementDecl);
        }
    }

    private processComplexTypeDefinition(attributes: XMLAttribute[]): void {
        const name = this.getAttributeValue(attributes, 'name');
        const mixed = this.getAttributeValue(attributes, 'mixed');
        const abstract = this.getAttributeValue(attributes, 'abstract');

        // Names must be valid NCName tokens per XML Schema specification
        if (name && !XMLUtils.isValidNCName(name)) {
            throw new Error(`Schema validation error: complexType name '${name}' is not a valid NCName`);
        }

        // Boolean attributes must have valid values
        if (mixed && mixed !== 'true' && mixed !== 'false') {
            throw new Error(`Schema validation error: mixed attribute must be 'true' or 'false', got '${mixed}'`);
        }
        if (abstract && abstract !== 'true' && abstract !== 'false') {
            throw new Error(`Schema validation error: abstract attribute must be 'true' or 'false', got '${abstract}'`);
        }

        const complexType = new ComplexType();
        complexType.setMixed(mixed === 'true');
        complexType.setAbstract(abstract === 'true');

        if (name) {
            // Named complex type - use qualified naming convention
            let qname = name;
            if (this.targetNamespace) {
                const prefix = this.getPrefixForNamespace(this.targetNamespace);
                qname = prefix ? `${prefix}:${name}` : name;
            }

            // Prevent duplicate type definitions in same namespace
            if (this.grammar.getTypeDefinition(qname)) {
                throw new Error(`Schema validation error: duplicate complexType definition for '${qname}'`);
            }

            complexType.setName(qname);
            this.grammar.addTypeDefinition(qname, complexType);
        } else if (this.currentElementDecl) {
            // Anonymous type - must be within element declaration context
            this.currentElementDecl.setType(complexType);
            // Track this as the most recent anonymous complex type
            this.lastAnonymousComplexType = complexType;
        } else {
            // Anonymous types outside elements are invalid per schema spec
            throw new Error('Schema validation error: anonymous complexType must be defined within an element declaration');
        }

        this.currentType = complexType;
    }

    private processSimpleTypeDefinition(attributes: XMLAttribute[]): void {
        const name = this.getAttributeValue(attributes, 'name');

        const simpleType = new SimpleType();

        if (name) {
            // Named simple type - use qualified naming convention
            let qname = name;
            if (this.targetNamespace) {
                const prefix = this.getPrefixForNamespace(this.targetNamespace);
                qname = prefix ? `${prefix}:${name}` : name;
            }
            simpleType.setName(qname);
            this.grammar.addTypeDefinition(qname, simpleType);
        } else if (this.currentElementDecl) {
            // Anonymous inline simple type within element declaration
            this.currentElementDecl.setType(simpleType);
        }

        this.currentType = simpleType;
    }

    private processAttributeDeclaration(attributes: XMLAttribute[]): void {
        const name = this.getAttributeValue(attributes, 'name');
        const ref = this.getAttributeValue(attributes, 'ref');
        const type = this.getAttributeValue(attributes, 'type');

        // Schema spec requires exactly one of 'name' or 'ref'
        if (!name && !ref) {
            throw new Error("Schema validation error: attribute declaration must have either 'name' or 'ref' attribute");
        }
        if (name && ref) {
            throw new Error("Schema validation error: attribute declaration cannot have both 'name' and 'ref' attributes");
        }

        // Names must be valid NCName tokens per XML Schema specification
        if (name && !XMLUtils.isValidNCName(name)) {
            throw new Error(`Schema validation error: attribute name '${name}' is not a valid NCName`);
        }

        let attrName: string;
        let attrDecl: SchemaAttributeDecl;

        if (ref) {
            // Attribute reference - resolve to global attribute declaration
            attrName = this.parseQName(ref);

            // Look up the global attribute in schema grammar
            const globalAttr = this.grammar.getAttributeDeclaration(attrName);
            if (globalAttr) {
                // Clone global attribute properties for local use
                attrDecl = new SchemaAttributeDecl(globalAttr.getName(), globalAttr.getType());
                attrDecl.setUse(globalAttr.getUse());
                attrDecl.setForm(globalAttr.getForm());
                if (globalAttr.getDefaultValue()) {
                    attrDecl.setDefaultValue(globalAttr.getDefaultValue()!);
                }
                if (globalAttr.getFixedValue()) {
                    attrDecl.setFixedValue(globalAttr.getFixedValue()!);
                }
            } else {
                // Forward reference - create placeholder for later resolution
                const simpleType = new SimpleType();
                attrDecl = new SchemaAttributeDecl(attrName, simpleType);
            }
        } else if (name) {
            // Local or global attribute declaration with form qualification
            attrName = this.attributeFormDefault && this.targetNamespace ? `{${this.targetNamespace}}${name}` : name;

            let attrType: SimpleType;
            if (type) {
                const typeQName = this.parseQName(type);
                attrType = new SimpleType(typeQName);
                attrType.setTypeName(typeQName);
            } else {
                // Default to xs:string when no type is specified
                const stringType = '{http://www.w3.org/2001/XMLSchema}string';
                attrType = new SimpleType(stringType);
                attrType.setTypeName(stringType);
            }

            attrDecl = new SchemaAttributeDecl(attrName, attrType);
        } else {
            // Should never reach here due to validation above
            return;
        }

        // Set use constraint
        const use = this.getAttributeValue(attributes, 'use');
        if (use) {
            attrDecl.setUse(use as 'required' | 'optional' | 'prohibited');
        }

        // Set default value
        const defaultValue = this.getAttributeValue(attributes, 'default');
        if (defaultValue) {
            attrDecl.setDefaultValue(defaultValue);
        }

        // Set fixed value
        const fixed = this.getAttributeValue(attributes, 'fixed');
        if (fixed) {
            attrDecl.setFixedValue(fixed);
        }

        // Set form (qualified/unqualified)
        const form = this.getAttributeValue(attributes, 'form');
        if (form === 'qualified' || form === 'unqualified') {
            attrDecl.setForm(form);
        }

        this.currentAttributeDecl = attrDecl;

        // If this is a global attribute declaration, add to grammar
        if (name && !this.currentType) {
            // Global attribute declaration
            const globalAttrName = this.targetNamespace ? `{${this.targetNamespace}}${name}` : name;
            attrDecl.setName(globalAttrName);
            this.grammar.addAttributeDeclaration(globalAttrName, attrDecl);
        }

        // Add to current complex type if we're inside one
        if (this.currentType && this.currentType.isComplexType()) {
            (this.currentType as ComplexType).addAttribute(attrName, attrDecl);
        }

        // Add to current attribute group if we're inside one
        if (this.currentAttributeGroup) {
            this.currentAttributeGroup.addAttribute(attrDecl);
        }
    }

    private processAnyAttribute(attributes: XMLAttribute[]): void {
        // xs:anyAttribute allows attributes from specified namespaces
        if (this.currentType && this.currentType.isComplexType()) {
            const complexType = this.currentType as ComplexType;
            // Mark complex type as accepting wildcard attributes
            complexType.setAllowsAnyAttributes(true);
        }
    }

    private processRestriction(attributes: XMLAttribute[]): void {
        const base = this.getAttributeValue(attributes, 'base');
        if (base && this.currentType && this.currentType.isSimpleType()) {
            const baseTypeQName = this.parseQName(base);
            const baseType = new SimpleType(baseTypeQName);
            (this.currentType as SimpleType).setBaseType(baseType);
        }
    }

    private processEnumeration(attributes: XMLAttribute[]): void {
        const value = this.getAttributeValue(attributes, 'value');
        if (value && this.currentType && this.currentType.isSimpleType()) {
            (this.currentType as SimpleType).addRestriction('enumeration', value);
        }
    }

    private processPattern(attributes: XMLAttribute[]): void {
        const value = this.getAttributeValue(attributes, 'value');
        if (value && this.currentType && this.currentType.isSimpleType()) {
            (this.currentType as SimpleType).addRestriction('pattern', value);
        }
    }

    private processFacet(facetName: string, attributes: XMLAttribute[]): void {
        const value = this.getAttributeValue(attributes, 'value');
        if (value && this.currentType && this.currentType.isSimpleType()) {
            (this.currentType as SimpleType).addRestriction(facetName, value);
        }
    }

    private processImport(attributes: XMLAttribute[]): void {
        const namespace = this.getAttributeValue(attributes, 'namespace');
        const schemaLocation = this.getAttributeValue(attributes, 'schemaLocation');

        if (namespace) {
            this.imports.push({
                namespace: namespace,
                location: schemaLocation
            });
        }
    }

    private processInclude(attributes: XMLAttribute[]): void {
        const schemaLocation = this.getAttributeValue(attributes, 'schemaLocation');
        if (schemaLocation) {
            this.includes.push(schemaLocation);
        }
    }

    private parseQName(qname: string): string {
        const colonIndex = qname.indexOf(':');
        if (colonIndex !== -1) {
            // Already has a prefix - return as-is
            return qname;
        }

        // No prefix - add appropriate prefix if needed
        if (this.isSchemaNamespace(qname)) {
            // XML Schema built-in types stay without prefix
            return qname;
        } else if (this.targetNamespace) {
            // Add target namespace prefix if available
            const prefix = this.getPrefixForNamespace(this.targetNamespace);
            return prefix ? `${prefix}:${qname}` : qname;
        }

        return qname;
    }

    private expandQName(qname: string): string {
        const colonIndex: number = qname.indexOf(':');
        if (colonIndex !== -1) {
            // Has a prefix - resolve to namespace
            const prefix: string = qname.substring(0, colonIndex);
            const localName: string = qname.substring(colonIndex + 1);
            const namespaceURI: string | undefined = this.namespacePrefixes.get(prefix);
            if (namespaceURI) {
                return `{${namespaceURI}}${localName}`;
            }
            // If prefix not found, return as-is
            return qname;
        }

        // No prefix - check if it's a schema built-in or use target namespace
        if (this.isSchemaNamespace(qname)) {
            // XML Schema built-in types don't need namespace expansion
            return qname;
        } else if (this.targetNamespace) {
            // Use target namespace for unprefixed names
            return `{${this.targetNamespace}}${qname}`;
        }

        return qname;
    }

    private isSchemaNamespace(localName: string): boolean {
        // Check if this is a built-in XML Schema type
        const builtinTypes: string[] = [
            'string', 'boolean', 'decimal', 'float', 'double', 'duration', 'dateTime', 'time', 'date',
            'gYearMonth', 'gYear', 'gMonthDay', 'gDay', 'gMonth', 'hexBinary', 'base64Binary',
            'anyURI', 'QName', 'NOTATION', 'normalizedString', 'token', 'language', 'NMTOKEN',
            'NMTOKENS', 'Name', 'NCName', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES',
            'integer', 'nonPositiveInteger', 'negativeInteger', 'long', 'int', 'short', 'byte',
            'nonNegativeInteger', 'unsignedLong', 'unsignedInt', 'unsignedShort', 'unsignedByte',
            'positiveInteger'
        ];
        return builtinTypes.includes(localName);
    }

    private processNamespaceDeclarations(attributes: XMLAttribute[]): void {
        for (const attr of attributes) {
            const attrName: string = attr.getName();
            const attrValue: string = attr.getValue();

            if (attrName === 'xmlns') {
                // Default namespace declaration
                this.defaultNamespace = attrValue;
                this.grammar.addNamespaceDeclaration('', attrValue);
            } else if (attrName.startsWith('xmlns:')) {
                // Prefixed namespace declaration
                const prefix: string = attrName.substring(6); // Remove 'xmlns:'
                this.namespacePrefixes.set(prefix, attrValue);
                this.grammar.addNamespaceDeclaration(prefix, attrValue);
            }
        }
    }

    private processExtension(attributes: XMLAttribute[]): void {
        const base = this.getAttributeValue(attributes, 'base');
        if (base && this.currentType) {
            const baseTypeQName = this.parseQName(base);

            if (this.currentType.isComplexType()) {
                const complexType = this.currentType as ComplexType;
                // Store the base type QName for later resolution
                complexType.setBaseTypeQName(baseTypeQName);
                complexType.setDerivationMethod('extension');
            }
            // Note: Simple type extensions in complex content need different handling
        }
    }

    private processGroup(attributes: XMLAttribute[]): void {
        const name: string | undefined = this.getAttributeValue(attributes, 'name');
        const ref: string | undefined = this.getAttributeValue(attributes, 'ref');
        const minOccurs: number = parseInt(this.getAttributeValue(attributes, 'minOccurs') || '1');
        const maxOccurs: string | undefined = this.getAttributeValue(attributes, 'maxOccurs');
        const maxOccursValue: number = maxOccurs === 'unbounded' ? -1 : parseInt(maxOccurs || '1');

        if (name) {
            // Group definition - save current context and start new group
            const groupModel: GroupModel = new GroupModel(name, minOccurs, maxOccursValue);

            // Push current content model to stack for later restoration
            this.contentModelStack.push(this.currentContentModel!);
            this.currentGroupModel = groupModel;
            this.currentContentModel = undefined;

            // Store group with qualified naming for consistency
            let groupKey: string = name;
            if (this.targetNamespace) {
                const prefix: string | undefined = this.getPrefixForNamespace(this.targetNamespace);
                groupKey = prefix ? `${prefix}:${name}` : name;
            }
            this.groupDefinitions.set(groupKey, groupModel);

            // Also store in grammar for cross-schema access
            this.grammar.addGroupDefinition(groupKey, groupModel);

        } else if (ref) {
            // Group reference - resolve and include in current context
            const refQName: string = this.parseQName(ref);

            // Use qualified name for group lookup
            const groupKey: string = refQName;

            // Extract local name for GroupModel constructor
            const colonIndex: number = refQName.indexOf(':');
            const localName: string = colonIndex !== -1 ? refQName.substring(colonIndex + 1) : refQName;

            const originalGroupModel: ContentModel | undefined = this.groupDefinitions.get(groupKey) || this.grammar.getGroupDefinition(groupKey);
            if (originalGroupModel) {
                if (this.currentContentModel) {
                    // Create group reference with occurrence constraints
                    const refGroupModel: GroupModel = new GroupModel(localName, minOccurs, maxOccursValue);
                    if (originalGroupModel instanceof GroupModel) {
                        const originalContentModel: ContentModel | undefined = originalGroupModel.getContentModel();
                        if (originalContentModel) {
                            refGroupModel.setContentModel(originalContentModel);
                        }
                    }

                    // Add to current content model based on its type
                    if (this.currentContentModel instanceof SequenceModel) {
                        this.currentContentModel.addParticle(refGroupModel);
                    } else if (this.currentContentModel instanceof ChoiceModel) {
                        this.currentContentModel.addParticle(refGroupModel);
                    } else if (this.currentContentModel instanceof AllModel) {
                        // xs:group references are prohibited in xs:all
                        console.warn('xs:group references are not allowed within xs:all groups');
                    }
                } else {
                    // Direct group reference in complex type becomes content model
                    if (this.currentType && this.currentType.isComplexType()) {
                        const complexType: ComplexType = this.currentType as ComplexType;

                        // Create group reference as root content model
                        const refGroupModel: GroupModel = new GroupModel(localName, minOccurs, maxOccursValue);
                        if (originalGroupModel instanceof GroupModel) {
                            const originalContentModel: ContentModel | undefined = originalGroupModel.getContentModel();
                            if (originalContentModel) {
                                refGroupModel.setContentModel(originalContentModel);
                            }
                        }

                        // Set as the content model for the complex type
                        complexType.setContentModel(refGroupModel);
                    }
                }
            } else {
                // Try cross-schema resolution for imported groups
                let resolvedGroup: ContentModel | undefined;
                if (this.crossSchemaResolver && !ref.startsWith('xs:')) {
                    resolvedGroup = this.crossSchemaResolver(groupKey);
                }

                if (resolvedGroup) {
                    // Found via cross-schema resolver
                    if (this.currentContentModel) {
                        // Create group reference with occurrence constraints
                        const refGroupModel: GroupModel = new GroupModel(localName, minOccurs, maxOccursValue);
                        if (resolvedGroup instanceof GroupModel) {
                            const originalContentModel: ContentModel | undefined = resolvedGroup.getContentModel();
                            if (originalContentModel) {
                                refGroupModel.setContentModel(originalContentModel);
                            }
                        } else {
                            // Non-GroupModel resolved content - use directly
                            refGroupModel.setContentModel(resolvedGroup);
                        }

                        if (this.currentContentModel instanceof SequenceModel || this.currentContentModel instanceof ChoiceModel) {
                            this.currentContentModel.addParticle(refGroupModel);
                        } else if (this.currentContentModel instanceof AllModel) {
                            console.warn('xs:group references are not allowed within xs:all groups');
                        }
                    } else if (this.currentType && this.currentType.isComplexType()) {
                        // Direct group reference becomes content model
                        const complexType: ComplexType = this.currentType as ComplexType;
                        if (!complexType.getContentModel()) {
                            // Create group reference as root content model
                            const refGroupModel: GroupModel = new GroupModel(localName, minOccurs, maxOccursValue);
                            if (resolvedGroup instanceof GroupModel) {
                                const originalContentModel: ContentModel | undefined = resolvedGroup.getContentModel();
                                if (originalContentModel) {
                                    refGroupModel.setContentModel(originalContentModel);
                                }
                            } else {
                                refGroupModel.setContentModel(resolvedGroup);
                            }

                            // Set as the content model for the complex type
                            complexType.setContentModel(refGroupModel);
                        }
                    }
                } else {
                    // Unresolved group reference - defer resolution for forward references
                    if (!ref.startsWith('xs:')) {
                        this.deferredGroupReferences.push({
                            ref: ref,
                            refQName: refQName,
                            localName: localName,
                            minOccurs: minOccurs,
                            maxOccursValue: maxOccursValue,
                            parentContext: this.currentContentModel || this.currentType,
                            contextType: this.currentContentModel instanceof SequenceModel ? 'sequence' :
                                this.currentContentModel instanceof ChoiceModel ? 'choice' :
                                    this.currentContentModel instanceof AllModel ? 'all' : 'complexType'
                        });
                    }
                }
            }
        }
    }

    private resolveDeferredGroupReferences(): void {
        for (const deferred of this.deferredGroupReferences) {
            const originalGroupModel: ContentModel | undefined = this.groupDefinitions.get(deferred.refQName) || this.grammar.getGroupDefinition(deferred.refQName);

            if (originalGroupModel) {
                // Create group reference with occurrence constraints
                const refGroupModel: GroupModel = new GroupModel(deferred.localName, deferred.minOccurs, deferred.maxOccursValue);
                if (originalGroupModel instanceof GroupModel) {
                    const originalContentModel: ContentModel | undefined = originalGroupModel.getContentModel();
                    if (originalContentModel) {
                        refGroupModel.setContentModel(originalContentModel);
                    }
                } else {
                    refGroupModel.setContentModel(originalGroupModel);
                }

                // Add to the appropriate parent context
                if (deferred.contextType === 'sequence' && deferred.parentContext instanceof SequenceModel) {
                    deferred.parentContext.addParticle(refGroupModel);
                } else if (deferred.contextType === 'choice' && deferred.parentContext instanceof ChoiceModel) {
                    deferred.parentContext.addParticle(refGroupModel);
                } else if (deferred.contextType === 'all' && deferred.parentContext instanceof AllModel) {
                    // AllModel doesn't support group references - this should have been caught earlier
                    console.warn('xs:group references are not allowed within xs:all groups');
                } else if (deferred.contextType === 'complexType' && deferred.parentContext instanceof ComplexType) {
                    deferred.parentContext.setContentModel(refGroupModel);
                }
            } else {
                console.warn(`Group reference ${deferred.ref} could not be resolved even after deferred processing`);
            }
        }

        // Clear the deferred list
        this.deferredGroupReferences = [];
    }

    private resolveDeferredAttributeGroupReferences(): void {
        // Debug: Show what attribute groups are available in the grammar
        const availableAttributeGroups = this.grammar.getAttributeGroupDefinitions();

        for (const reference of this.attributeGroupReferences) {

            // First look for the attribute group definition locally in handler
            let attributeGroup: AttributeGroup | undefined = this.attributeGroupDefinitions.get(reference.refQName);

            // If not found locally, check the main grammar (which includes merged schemas)
            if (!attributeGroup) {
                attributeGroup = this.grammar.getAttributeGroupDefinition(reference.refQName);
            }

            // If still not found, try cross-schema resolver as fallback
            if (!attributeGroup && this.crossSchemaAttributeGroupResolver) {
                attributeGroup = this.crossSchemaAttributeGroupResolver(reference.refQName);
            }

            if (attributeGroup) {
                const groupAttributes: Map<string, SchemaAttributeDecl> = attributeGroup.getAttributes();

                // Copy all attributes from the resolved group to the target complex type
                for (const [attrName, attrDecl] of Array.from(groupAttributes.entries())) {
                    reference.targetComplexType.addAttribute(attrName, attrDecl);
                }
            } else {
                console.warn(`Attribute group reference ${reference.ref} could not be resolved - definition not found`);
            }
        }

        // Clear the references list
        this.attributeGroupReferences = [];
    }

    private processAttributeGroup(attributes: XMLAttribute[]): void {
        const name: string | undefined = this.getAttributeValue(attributes, 'name');
        const ref: string | undefined = this.getAttributeValue(attributes, 'ref');

        if (name) {
            // Attribute group definition - create proper AttributeGroup
            const attributeGroup: AttributeGroup = new AttributeGroup(name, this.targetNamespace);

            // Use qualified naming for consistency
            let qname: string = name;
            if (this.targetNamespace) {
                let prefix: string | undefined = this.getPrefixForNamespace(this.targetNamespace);
                qname = prefix ? `${prefix}:${name}` : name;
            }
            attributeGroup.setName(qname);

            // Store in dedicated attribute group storage
            this.attributeGroupDefinitions.set(qname, attributeGroup);
            // Also store in grammar
            this.grammar.addAttributeGroupDefinition(qname, attributeGroup);

            // Set current context for processing nested attributes
            this.currentAttributeGroup = attributeGroup;

        } else if (ref) {
            // Attribute group reference - find the target complex type
            const refQName: string = this.parseQName(ref);

            // Find the target complex type based on current context
            const targetComplexType = this.findTargetComplexType();

            if (targetComplexType) {
                const elementPath = this.elementStack.join('/');

                // Store reference for post-processing
                this.attributeGroupReferences.push({
                    ref: ref,
                    refQName: refQName,
                    targetComplexType: targetComplexType,
                    elementPath: elementPath
                });
            } else {
                console.warn(`Could not determine target complex type for attribute group reference: ${ref}`);
            }
        }
    }

    private findTargetComplexType(): ComplexType | undefined {
        // Look for the closest complex type in the element hierarchy
        // This handles both named types and anonymous inline types

        // Check if we're inside an element with an anonymous complex type
        if (this.currentElementDecl) {
            const elementType = this.currentElementDecl.getType();
            if (elementType && elementType.isComplexType()) {
                return elementType as ComplexType;
            }
        }

        // Check current type context
        if (this.currentType && this.currentType.isComplexType()) {
            return this.currentType as ComplexType;
        }

        // If element stack shows: ..., xsd:element, xsd:complexType, xsd:attributeGroup
        // Then we need to find the complex type that was just created for the element
        const stackLength = this.elementStack.length;
        if (stackLength >= 3 &&
            this.elementStack[stackLength - 1] === 'xsd:attributeGroup' &&
            this.elementStack[stackLength - 2] === 'xsd:complexType' &&
            this.elementStack[stackLength - 3] === 'xsd:element') {

            // We're in an inline complex type within an element
            // Use the most recently created anonymous complex type
            if (this.lastAnonymousComplexType) {
                return this.lastAnonymousComplexType;
            }
        }

        return undefined;
    }

    private processUnion(attributes: XMLAttribute[]): void {
        // xs:union allows multiple simple types as alternatives
        if (this.currentType && this.currentType.isSimpleType()) {
            const memberTypes: string | undefined = this.getAttributeValue(attributes, 'memberTypes');
            if (memberTypes) {
                const types: string[] = memberTypes.split(/\s+/).map(type => this.parseQName(type));
                (this.currentType as SimpleType).setUnionMemberTypes(types);
            }
        }
    }

    private processList(attributes: XMLAttribute[]): void {
        // xs:list creates a simple type from space-separated values
        if (this.currentType && this.currentType.isSimpleType()) {
            const itemType: string | undefined = this.getAttributeValue(attributes, 'itemType');
            if (itemType) {
                const itemTypeQName: string = this.parseQName(itemType);
                (this.currentType as SimpleType).setListItemType(itemTypeQName);
            }
        }
    }

    private finishComplexType(): void {
        this.currentType = undefined;
    }

    private finishSimpleType(): void {
        this.currentType = undefined;
    }

    private finishElementDeclaration(): void {
        this.currentElementDecl = undefined;
    }

    private finishAttributeDeclaration(): void {
        this.currentAttributeDecl = undefined;
    }

    // Content model processing methods
    private processSequence(attributes: XMLAttribute[]): void {
        const minOccurs: number = this.parseOccurrence(this.getAttributeValue(attributes, 'minOccurs'), 1);
        const maxOccurs: number = this.parseOccurrence(this.getAttributeValue(attributes, 'maxOccurs'), 1);

        const sequence: SequenceModel = new SequenceModel(minOccurs, maxOccurs);

        // Push current content model to stack
        if (this.currentContentModel) {
            this.contentModelStack.push(this.currentContentModel);
        }
        this.currentContentModel = sequence;
    }

    private processChoice(attributes: XMLAttribute[]): void {
        const minOccurs: number = this.parseOccurrence(this.getAttributeValue(attributes, 'minOccurs'), 1);
        const maxOccurs: number = this.parseOccurrence(this.getAttributeValue(attributes, 'maxOccurs'), 1);

        const choice: ChoiceModel = new ChoiceModel(minOccurs, maxOccurs);

        // Push current content model to stack
        if (this.currentContentModel) {
            this.contentModelStack.push(this.currentContentModel);
        }
        this.currentContentModel = choice;
    }

    private processAll(attributes: XMLAttribute[]): void {
        // All groups always have cardinality 1 in XML Schema
        const all: AllModel = new AllModel();

        // Push current content model to stack
        if (this.currentContentModel) {
            this.contentModelStack.push(this.currentContentModel);
        }
        this.currentContentModel = all;
    }

    private processAny(attributes: XMLAttribute[]): void {
        const minOccurs: number = this.parseOccurrence(this.getAttributeValue(attributes, 'minOccurs'), 0);
        const maxOccurs: number = this.parseOccurrence(this.getAttributeValue(attributes, 'maxOccurs'), -1);
        const namespace: string = this.getAttributeValue(attributes, 'namespace') || '##any';
        const processContents: string = this.getAttributeValue(attributes, 'processContents') || 'lax';

        const anyModel: AnyModel = new AnyModel(namespace, processContents, minOccurs, maxOccurs);

        // Add this xs:any to the current content model
        if (this.currentContentModel) {
            if (this.currentContentModel instanceof SequenceModel) {
                this.currentContentModel.addParticle(anyModel);
            } else if (this.currentContentModel instanceof ChoiceModel) {
                this.currentContentModel.addParticle(anyModel);
            } else if (this.currentContentModel instanceof AllModel) {
                // xs:any is not allowed in xs:all, but handle gracefully
                console.warn('xs:any is not allowed within xs:all groups');
            }
        }
    }

    private finishSequence(): void {
        const sequence: SequenceModel = this.currentContentModel as SequenceModel;
        this.finishContentModel(sequence);
    }

    private finishChoice(): void {
        const choice: ChoiceModel = this.currentContentModel as ChoiceModel;
        this.finishContentModel(choice);
    }

    private finishAll(): void {
        const all: AllModel = this.currentContentModel as AllModel;
        this.finishContentModel(all);
    }

    private finishGroup(): void {
        // For group definitions, we need to set the content model in the group
        if (this.currentGroupModel) {
            // Set the current content model as the group's content model
            if (this.currentContentModel) {
                this.currentGroupModel.setContentModel(this.currentContentModel);
            }

            // Restore the previous content model
            this.currentContentModel = this.contentModelStack.pop();
            this.currentGroupModel = undefined;
        }
    }

    private finishContentModel(model: ContentModel): void {
        // Pop parent content model from stack
        const parentModel: ContentModel | undefined = this.contentModelStack.pop();

        if (parentModel) {
            // Add as particle to parent content model
            if (parentModel instanceof SequenceModel) {
                parentModel.addParticle(model);
            } else if (parentModel instanceof ChoiceModel) {
                parentModel.addParticle(model);
            }
            this.currentContentModel = parentModel;
        } else {
            // No parent content model - check if we're inside a group definition
            if (this.currentGroupModel) {
                // Inside a group definition - keep the content model for the group to capture
                this.currentContentModel = model;
            } else {
                // Root content model - assign to current complex type
                if (this.currentType && this.currentType.isComplexType()) {
                    const complexType: ComplexType = this.currentType as ComplexType;
                    complexType.setContentModel(model);
                }
                this.currentContentModel = undefined;
            }
        }
    }

    // Helper method to ensure element names have prefixes for CompositeGrammar storage
    private ensureElementPrefix(elementName: string): string {
        // If element already has prefix, return as-is
        if (elementName.includes(':')) {
            return elementName;
        }

        // For CompositeGrammar storage, ALL elements must have prefixes
        // This ensures consistent lookups regardless of elementFormDefault
        if (this.targetNamespace) {
            const prefix = this.getPrefixForNamespace(this.targetNamespace);
            if (prefix) {
                return `${prefix}:${elementName}`;
            }
        }

        return elementName;
    }

    private parseOccurrence(value: string | undefined, defaultValue: number): number {
        if (!value) {
            return defaultValue;
        }

        if (value === 'unbounded') {
            return -1; // -1 represents unbounded
        }

        const parsed: number = parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    private processNotation(attributes: XMLAttribute[]): void {
        const name = this.getAttributeValue(attributes, 'name');
        const publicId = this.getAttributeValue(attributes, 'public');
        const systemId = this.getAttributeValue(attributes, 'system');

        // Schema spec requires 'name' attribute for notation declarations
        if (!name) {
            throw new Error("Schema validation error: notation declaration must have a 'name' attribute");
        }

        // Names must be valid NCName tokens per XML Schema specification
        if (!XMLUtils.isValidNCName(name)) {
            throw new Error(`Schema validation error: notation name '${name}' is not a valid NCName`);
        }

        // Schema spec requires either 'public' or 'system' identifier (or both)
        if (!publicId && !systemId) {
            throw new Error("Schema validation error: notation declaration must have either 'public' or 'system' attribute");
        }

        // Store notation declaration if needed by grammar
    }

    // Schema validation helper methods

    private validateTypeReference(typeName: string): void {
        // Built-in XML Schema types are always valid
        if (this.isBuiltInType(typeName)) {
            return;
        }

        // Defer validation to post-processing phase since types
        // can be defined later or in imported schemas
    }

    private isBuiltInType(typeName: string): boolean {
        const builtInTypes = [
            'string', 'boolean', 'decimal', 'float', 'double', 'duration', 'dateTime', 'time', 'date',
            'gYearMonth', 'gYear', 'gMonthDay', 'gDay', 'gMonth', 'hexBinary', 'base64Binary', 'anyURI',
            'QName', 'NOTATION', 'normalizedString', 'token', 'language', 'NMTOKEN', 'NMTOKENS', 'Name',
            'NCName', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'integer', 'nonPositiveInteger',
            'negativeInteger', 'long', 'int', 'short', 'byte', 'nonNegativeInteger', 'unsignedLong',
            'unsignedInt', 'unsignedShort', 'unsignedByte', 'positiveInteger'
        ];

        // Check local name portion for built-in types
        const localName = typeName.includes(':') ? typeName.split(':')[1] : typeName;
        return builtInTypes.includes(localName);
    }
}