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

import { AttributeInfo, AttributeUse, Grammar, GrammarType, ValidationContext, ValidationResult } from '../grammar/Grammar';
import { XMLUtils } from "../XMLUtils";
import { AttDecl } from './AttDecl';
import { ContentModel, ContentModelType } from './ContentModel';
import { ElementDecl } from './ElementDecl';
import { EntityDecl } from './EntityDecl';
import { NotationDecl } from './NotationDecl';

export class DTDGrammar implements Grammar {

    private models: Map<string, ContentModel>;
    private entitiesMap: Map<string, EntityDecl>;
    private attributesMap: Map<string, Map<string, AttDecl>>;
    private elementDeclMap: Map<string, ElementDecl>;
    private notationsMap: Map<string, NotationDecl>;

    constructor() {
        this.models = new Map();
        this.elementDeclMap = new Map();
        this.attributesMap = new Map();
        this.entitiesMap = new Map();
        this.notationsMap = new Map();
        this.addPredefinedEntities();
    }

    addPredefinedEntities() {
        this.addEntity(new EntityDecl('lt', false, '<', '', '', ''));
        this.addEntity(new EntityDecl('gt', false, '>', '', '', ''));
        this.addEntity(new EntityDecl('amp', false, '&', '', '', ''));
        this.addEntity(new EntityDecl('apos', false, "'", '', '', ''));
        this.addEntity(new EntityDecl('quot', false, '"', '', '', ''));
    }

    getContentModel(elementName: string): ContentModel | undefined {
        return this.models.get(elementName);
    }

    toString(): string {
        let result: string = '';
        this.models.forEach((value: ContentModel) => {
            result = result + value.toString() + '\n';
        });
        return result;
    }

    addElement(elementDecl: ElementDecl, override: boolean = false) {
        const name: string = elementDecl.getName();
        if (override || !this.elementDeclMap.has(name)) {
            this.elementDeclMap.set(name, elementDecl);
        }
    }

    addAttributes(element: string, attributes: Map<string, AttDecl>, override: boolean = false, preexistingKeys?: Set<string>) {
        let existingAttributes: Map<string, AttDecl> | undefined = this.attributesMap.get(element);
        if (!existingAttributes) {
            existingAttributes = new Map<string, AttDecl>();
            this.attributesMap.set(element, existingAttributes);
        }

        if (override) {
            attributes.forEach((value, key) => {
                const existedBeforeParse: boolean = preexistingKeys ? preexistingKeys.has(key) : false;
                if (existedBeforeParse) {
                    existingAttributes!.set(key, value);
                    return;
                }
                if (!existingAttributes!.has(key)) {
                    existingAttributes!.set(key, value);
                }
            });
        } else {
            attributes.forEach((value, key) => {
                if (!existingAttributes!.has(key)) {
                    existingAttributes!.set(key, value);
                }
            });
        }
    }

    resolveParameterEntities(text: string): string {
        while (XMLUtils.hasParameterEntity(text)) {
            let start: number = text.indexOf('%');
            let end: number = text.indexOf(';');
            let entityName: string = text.substring(start + '%'.length, end);
            let entity: EntityDecl | undefined = this.getParameterEntity(entityName);
            if (entity === undefined) {
                throw new Error('Unknown entity: ' + entityName);
            }
            text = text.replace('%' + entityName + ';', entity.getValue());
        }
        return text;
    }

    addEntity(entityDecl: EntityDecl, override: boolean = false) {
        // Parameter entities use %name key to avoid conflicts with general entities
        const key: string = entityDecl.isParameterEntity() ? `%${entityDecl.getName()}` : entityDecl.getName();
        if (override || !this.entitiesMap.has(key)) {
            this.entitiesMap.set(key, entityDecl);
        }
    }

    getEntity(entityName: string): EntityDecl | undefined {
        return this.entitiesMap.get(entityName);
    }

    getParameterEntity(entityName: string): EntityDecl | undefined {
        return this.entitiesMap.get(`%${entityName}`);
    }

    addNotation(notation: NotationDecl, override: boolean = false) {
        const name: string = notation.getName();
        if (override || !this.notationsMap.has(name)) {
            this.notationsMap.set(name, notation);
        }
    }

    merge(grammar: DTDGrammar): void {
        grammar.getEntitiesMap().forEach((value: EntityDecl, key: string) => {
            if (!this.entitiesMap.has(key)) {
                this.entitiesMap.set(key, value);
            }
        });
        grammar.getAttributesMap().forEach((value: Map<string, AttDecl>, key: string) => {
            if (!this.attributesMap.has(key)) {
                this.attributesMap.set(key, value);
            }
        });
        grammar.getElementDeclMap().forEach((value: ElementDecl, key: string) => {
            if (!this.elementDeclMap.has(key)) {
                this.elementDeclMap.set(key, value);
            }
        });
        grammar.getNotationsMap().forEach((value: NotationDecl, key: string) => {
            if (!this.notationsMap.has(key)) {
                this.notationsMap.set(key, value);
            }
        });
    }

    getNotationsMap(): Map<string, NotationDecl> {
        return this.notationsMap;
    }

    getElementDeclMap(): Map<string, ElementDecl> {
        return this.elementDeclMap;
    }

    getEntitiesMap(): Map<string, EntityDecl> {
        return this.entitiesMap
    }

    processModels() {
        this.elementDeclMap.forEach((elementDecl: ElementDecl) => {
            let name: string = elementDecl.getName();
            if (XMLUtils.hasParameterEntity(name)) {
                name = this.resolveParameterEntities(name);
            }
            let contentSpec: string = elementDecl.getContentSpec();
            if (XMLUtils.hasParameterEntity(contentSpec)) {
                contentSpec = this.resolveParameterEntities(contentSpec);
            }
            let model: ContentModel = ContentModel.parse(contentSpec);
            this.models.set(name, model);
        });
    }

    getAttributesMap(): Map<string, Map<string, AttDecl>> {
        return this.attributesMap;
    }

    getElementAttributesMap(element: string): Map<string, AttDecl> | undefined {
        return this.attributesMap.get(element);
    }

    validateElement(element: string, children: string[]): ValidationResult {
        const colonIndex = element.indexOf(':');
        if (colonIndex !== -1) {
            // element with colon means it has a namespace prefix and is not coming from a DTD
            return ValidationResult.success();
        }
        const elementDecl = this.elementDeclMap.get(element);

        if (!elementDecl) {
            return ValidationResult.error('Element "' + element + '" is not declared in the DTD');
        }

        const model: ContentModel | undefined= this.getContentModel(element);
        if (!model) {
            return ValidationResult.error('No content model found for element "' + element + '" in the DTD');
        }
        if(model.getType() === 'EMPTY') {
            if (children.length > 0) {
                return ValidationResult.error('Element "' + element + '" is declared as EMPTY but has child elements');
            } 
        }
        if (model.getType() === ContentModelType.ANY) {
            return ValidationResult.success();
        }
        if (model.getType() === ContentModelType.PCDATA) {
            // PCDATA content model allows any text content but no child elements
            if (children.length > 0) {
                return ValidationResult.error('Element "' + element + '" is declared as #PCDATA but has child elements');
            }
            return ValidationResult.success();
        }
        if (model.getType() === ContentModelType.MIXED || model.getType() === ContentModelType.CHILDREN) {
            // MIXED and CHILDREN content model allows PCDATA and specified child elements
            const isValid = model.validateChildren(children);
            if (!isValid) {
                return ValidationResult.error('Element "' + element + '" has invalid child elements as per CHILDREN content model:' + model.toString());
            }
            return ValidationResult.success();
        }
        return ValidationResult.success();
    }

    validateAttributes(element: string, attributes: Map<string, string>): ValidationResult {
        const declaredAttributes: Map<string, AttributeInfo> = this.getElementAttributes(element);

        if (declaredAttributes.size === 0) {
            // No attributes declared - check if the attributes come from XML namespace
            for (const [attrName, attrValue] of attributes) {
                const xmlNamespace: string[] = ['xml:lang', 'xml:space', 'xml:base', 'xml:id'];
                if (xmlNamespace.includes(attrName)) {
                    continue;
                } else {
                    return ValidationResult.error('Undeclared attribute "' + attrName + '" found in element "' + element + '"');
                }
            }
            return ValidationResult.success();
        }

        // Check each provided attribute against declarations
        const attributeDeclarations: Map<string, AttDecl> | undefined = this.attributesMap.get(element);
        for (const [attrName, attrValue] of attributes) {
            if (!declaredAttributes.has(attrName)) {
                return ValidationResult.error('Undeclared attribute "' + attrName + '" found in element "' + element + '"');
            }

            if (attributeDeclarations) {
                // Perform DTD datatype validation using AttDecl
                const attDecl = attributeDeclarations.get(attrName);
                if (attDecl) {
                    const validationResult = this.validateAttributeValue(attrName, attrValue, attDecl, element);
                    if (!validationResult.isValid) {
                        return validationResult;
                    }
                }
            }
        }

        // Check for required attributes that are missing
        for (const [attrName, attrInfo] of declaredAttributes) {
            if (attrInfo.use === 'required' && !attributes.has(attrName)) {
                return ValidationResult.error('Required attribute "' + attrName + '" is missing from element "' + element + '"');
            }
        }

        return ValidationResult.success();
    }

    private validateAttributeValue(attrName: string, attrValue: string, attDecl: AttDecl, element: string): ValidationResult {
        const attrType = attDecl.getType();

        // Skip ID and IDREF validation - these require document-level tracking
        if (attrType === 'ID' || attrType === 'IDREF' || attrType === 'IDREFS') {
            // ID/IDREF validation is handled by DOMBuilder  or a custom content handler with document-level state tracking
            return ValidationResult.success();
        }

        // Use AttDecl's built-in validation for basic datatypes
        if (!attDecl.isValid(attrValue)) {
            return ValidationResult.error('Invalid value ' + attrValue + ' for attribute ' + attrName + ' of type ' + attrType + ' in element ' + element);
        }

        // Additional validation for ENTITY/ENTITIES types - check if entities exist
        if (attrType === 'ENTITY') {
            if (!this.entityExists(attrValue)) {
                return ValidationResult.error('Entity "' + attrValue + '" referenced in attribute "' + attrName + '" is not declared in element "' + element + '"');
            }
        } else if (attrType === 'ENTITIES') {
            const entityNames = attrValue.split(/\s+/);
            for (const entityName of entityNames) {
                if (!this.entityExists(entityName)) {
                    return ValidationResult.error('Entity "' + entityName + '" referenced in attribute "' + attrName + '" is not declared in element "' + element + '"');
                }
            }
        }

        // Additional validation for NOTATION types - check if notations exist
        if (attrType.startsWith('NOTATION')) {
            if (!this.notationExists(attrValue)) {
                return ValidationResult.error('Notation "' + attrValue + '" referenced in attribute "' + attrName + '" is not declared in element "' + element + '"');
            }
        }
        if (attrType.startsWith('(') && attrType.endsWith(')')) {
            const enumeration = attDecl.getEnumeration();
            if (!enumeration.includes(attrValue)) {
                return ValidationResult.error('Value "' + attrValue + '" for attribute "' + attrName + '" is not in the enumeration ' + attDecl.getType() + ' in element "' + element + '"');
            }
        }
        // check for entities inside attribute value
        const entityReferences = this.extractEntityReferences(attrValue);
        for (const entityName of entityReferences) {
            if (!this.entityExists(entityName)) {
                return ValidationResult.error('Entity "' + entityName + '" referenced in attribute "' + attrName + '" is not declared in element "' + element + '"');
            }
        }
        return ValidationResult.success();
    }

    private entityExists(entityName: string): boolean {
        return this.getEntity(entityName) !== undefined;
    }


    private notationExists(notationName: string): boolean {
        return this.notationsMap.has(notationName);
    }

    private extractEntityReferences(value: string): string[] {
        const references: string[] = [];
        let index: number = 0;
        while (index < value.length) {
            const ampIndex: number = value.indexOf('&', index);
            if (ampIndex === -1) {
                break;
            }
            const semicolonIndex: number = value.indexOf(';', ampIndex + 1);
            if (semicolonIndex === -1) {
                break;
            }
            const candidate: string = value.substring(ampIndex + 1, semicolonIndex);
            if (candidate.length > 0 && XMLUtils.isValidXMLName(candidate)) {
                references.push(candidate);
            }
            index = semicolonIndex + 1;
        }
        return references;
    }

    getElementAttributes(element: string): Map<string, AttributeInfo> {
        const colonIndex = element.indexOf(':');
        // element with colon means it has a namespace prefix and is not coming from a DTD
        if (colonIndex !== -1) {
            return new Map<string, AttributeInfo>();
        }
        const result: Map<string, AttributeInfo> = new Map<string, AttributeInfo>();

        const dtdAttributes: Map<string, AttDecl> | undefined = this.getElementAttributesMap(element);
        if (dtdAttributes) {
            dtdAttributes.forEach((attDecl: AttDecl, attName: string) => {
                const use: AttributeUse = this.mapDTDAttributeUse(attDecl);
                const datatype: string = attDecl.getType();
                const defaultValue: string = attDecl.getDefaultValue();
                result.set(attName, new AttributeInfo(attName, datatype, use, defaultValue));
            });
        }
        return result;
    }

    getDefaultAttributes(element: string): Map<string, string> {
        const colonIndex = element.indexOf(':');
        // element with colon means it has a namespace prefix and is not coming from a DTD
        if (colonIndex !== -1) {
            return new Map<string, string>();
        }
        const result: Map<string, string> = new Map<string, string>();

        const dtdAttributes: Map<string, AttDecl> | undefined = this.getElementAttributesMap(element);
        if (dtdAttributes) {
            dtdAttributes.forEach((attDecl: AttDecl, attName: string) => {
                const defaultValue: string = attDecl.getDefaultValue();
                if (defaultValue && attDecl.getDefaultDecl() !== '#IMPLIED' && attDecl.getDefaultDecl() !== '#REQUIRED') {
                    result.set(attName, defaultValue);
                }
            });
        }
        return result;
    }

    resolveEntity(name: string): string | undefined {
        const entity: EntityDecl | undefined = this.getEntity(name);
        return entity ? entity.getValue() : undefined;
    }

    getGrammarType(): GrammarType {
        return GrammarType.DTD;
    }

    getTargetNamespace(): string | undefined {
        return undefined;
    }

    getNamespaceDeclarations(): Map<string, string> {
        return new Map();
    }

    private mapDTDAttributeUse(attDecl: AttDecl): AttributeUse {
        const defaultDecl = attDecl.getDefaultDecl();
        switch (defaultDecl) {
            case '#REQUIRED':
                return AttributeUse.REQUIRED;
            case '#IMPLIED':
                return AttributeUse.IMPLIED;
            case '#FIXED':
                return AttributeUse.FIXED;
            default:
                return AttributeUse.OPTIONAL;
        }
    }
}