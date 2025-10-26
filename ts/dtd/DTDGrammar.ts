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
import { ContentModel } from './ContentModel';
import { ElementDecl } from './ElementDecl';
import { EntityDecl } from './EntityDecl';
import { NotationDecl } from './NotationDecl';

export class DTDGrammar implements Grammar {
    private models: Map<string, ContentModel>;
    private entitiesMap: Map<string, EntityDecl>;
    private attributesMap: Map<string, Map<string, AttDecl>>;
    private elementDeclMap: Map<string, ElementDecl>;
    private notationsMap: Map<string, NotationDecl>;
    private usedEntityReferences: Map<string, string>;

    constructor() {
        this.models = new Map();
        this.elementDeclMap = new Map();
        this.attributesMap = new Map();
        this.entitiesMap = new Map();
        this.notationsMap = new Map();
        this.usedEntityReferences = new Map();
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

    addElement(elementDecl: ElementDecl) {
        if (!this.elementDeclMap.has(elementDecl.getName())) {
            this.elementDeclMap.set(elementDecl.getName(), elementDecl);
        }
    }

    addAttributes(element: string, attributes: Map<string, AttDecl>) {
        // Merge attributes, giving precedence to first declaration (XML spec requirement)
        let existingAttributes = this.attributesMap.get(element);
        if (existingAttributes) {
            attributes.forEach((value, key) => {
                if (!existingAttributes!.has(key)) {
                    existingAttributes!.set(key, value);
                }
            });
        } else {
            this.attributesMap.set(element, attributes);
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

    addEntity(entityDecl: EntityDecl) {
        // Parameter entities use %name key to avoid conflicts with general entities
        const key = entityDecl.isParameterEntity() ? `%${entityDecl.getName()}` : entityDecl.getName();
        if (!this.entitiesMap.has(key)) {
            this.entitiesMap.set(key, entityDecl);
        }
    }

    getEntity(entityName: string): EntityDecl | undefined {
        return this.entitiesMap.get(entityName);
    }

    getParameterEntity(entityName: string): EntityDecl | undefined {
        return this.entitiesMap.get(`%${entityName}`);
    }

    addNotation(notation: NotationDecl) {
        if (!this.notationsMap.has(notation.getName())) {
            this.notationsMap.set(notation.getName(), notation);
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

    addEntityReferenceUsage(originalReference: string, expandedText: string) {
        this.usedEntityReferences.set(expandedText, originalReference);
    }

    getOriginalEntityReference(expandedText: string): string | undefined {
        return this.usedEntityReferences.get(expandedText);
    }

    getUsedEntityReferences(): Map<string, string> {
        return this.usedEntityReferences;
    }

    clearEntityReferenceTracking() {
        this.usedEntityReferences.clear();
    }

    validateElement(element: string, content: ValidationContext): ValidationResult {
        const colonIndex = element.indexOf(':');
        const elementName = colonIndex !== -1 ? element.substring(colonIndex + 1) : element;
        const elementDecl = this.elementDeclMap.get(elementName);

        if (!elementDecl) {
            // Return success with no errors/warnings to indicate this DTD doesn't handle this element
            // DTDComposite will try other DTDs
            return ValidationResult.success();
        }

        // Element is declared in this DTD - perform validation
        return ValidationResult.success();
    }

    validateAttributes(element: string, attributes: Map<string, string>, context: ValidationContext): ValidationResult {
        // DTD attribute validation - simplified for now
        return ValidationResult.success();
    }

    getElementAttributes(element: string): Map<string, AttributeInfo> {
        const colonIndex = element.indexOf(':');
        const elementName = colonIndex !== -1 ? element.substring(colonIndex + 1) : element;
        const result = new Map<string, AttributeInfo>();

        const dtdAttributes = this.getElementAttributesMap(elementName);
        if (dtdAttributes) {
            dtdAttributes.forEach((attDecl: AttDecl, attName: string) => {
                const use = this.mapDTDAttributeUse(attDecl);
                const datatype = attDecl.getType();
                const defaultValue = attDecl.getDefaultValue();

                const attributeInfo = new AttributeInfo(attName, datatype, use, defaultValue);
                result.set(attName, attributeInfo);
            });
        }

        return result;
    }

    getDefaultAttributes(element: string): Map<string, string> {
        const colonIndex = element.indexOf(':');
        const elementName = colonIndex !== -1 ? element.substring(colonIndex + 1) : element;
        const result = new Map<string, string>();

        const dtdAttributes = this.getElementAttributesMap(elementName);
        if (dtdAttributes) {
            dtdAttributes.forEach((attDecl: AttDecl, attName: string) => {
                const defaultValue = attDecl.getDefaultValue();
                if (defaultValue && attDecl.getDefaultDecl() !== '#IMPLIED' && attDecl.getDefaultDecl() !== '#REQUIRED') {
                    result.set(attName, defaultValue);
                }
            });
        }

        return result;
    }

    resolveEntity(name: string): string | undefined {
        const entity = this.getEntity(name);
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

    // Serialization for pre-compiled grammars
    toJSON(): any {
        const entitiesData: any = {};
        this.entitiesMap.forEach((entity, name) => {
            entitiesData[name] = {
                isParameterEntity: entity.isParameterEntity(),
                value: entity.getValue(),
                publicId: entity.getPublicId(),
                systemId: entity.getSystemId(),
                ndata: (entity as any).ndata || '' // Access private field
            };
        });

        const elementsData: any = {};
        this.elementDeclMap.forEach((element, name) => {
            elementsData[name] = {
                contentSpec: element.getContentSpec()
            };
        });

        const attributesData: any = {};
        this.attributesMap.forEach((attrs, elementName) => {
            const elementAttrs: any = {};
            attrs.forEach((attr, attrName) => {
                elementAttrs[attrName] = {
                    type: attr.getType(),
                    defaultValue: attr.getDefaultValue()
                };
            });
            attributesData[elementName] = elementAttrs;
        });

        const notationsData: any = {};
        this.notationsMap.forEach((notation, name) => {
            notationsData[name] = {
                publicId: notation.getPublicId(),
                systemId: notation.getSystemId()
            };
        });

        return {
            entities: entitiesData,
            elements: elementsData,
            attributes: attributesData,
            notations: notationsData,
            entityNames: Array.from(this.entitiesMap.keys()),
            elementNames: Array.from(this.elementDeclMap.keys()),
            attributeElementNames: Array.from(this.attributesMap.keys()),
            notationNames: Array.from(this.notationsMap.keys()),
            grammarType: 'dtd',
            version: '1.0'
        };
    }

    // Deserialization for pre-compiled grammars
    static fromJSON(data: any): DTDGrammar {
        const grammar = new DTDGrammar();

        // Load entities (skip predefined ones as they're already added in constructor)
        if (data.entities) {
            Object.entries(data.entities).forEach(([name, entityData]: [string, any]) => {
                if (!['lt', 'gt', 'amp', 'apos', 'quot'].includes(name)) {
                    const entity = new EntityDecl(
                        name,
                        entityData.isParameterEntity,
                        entityData.value,
                        entityData.systemId,
                        entityData.publicId,
                        entityData.ndata
                    );
                    grammar.addEntity(entity);
                }
            });
        }

        // Load element declarations
        if (data.elements) {
            Object.entries(data.elements).forEach(([name, elementData]: [string, any]) => {
                const element = new ElementDecl(name, elementData.contentSpec);
                grammar.addElement(element);
            });
        }

        // Load attribute declarations
        if (data.attributes) {
            Object.entries(data.attributes).forEach(([elementName, attrs]: [string, any]) => {
                const attributeMap = new Map<string, AttDecl>();
                Object.entries(attrs).forEach(([attrName, attrData]: [string, any]) => {
                    const attr = new AttDecl(
                        elementName,
                        attrName,
                        attrData.type,
                        attrData.defaultValue
                    );
                    attributeMap.set(attrName, attr);
                });
                grammar.addAttributes(elementName, attributeMap);
            });
        }

        // Load notation declarations
        if (data.notations) {
            Object.entries(data.notations).forEach(([name, notationData]: [string, any]) => {
                const notation = new NotationDecl(
                    name,
                    notationData.publicId,
                    notationData.systemId
                );
                grammar.addNotation(notation);
            });
        }

        return grammar;
    }
}