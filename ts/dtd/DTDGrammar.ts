/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *******************************************************************************/

import { XMLUtils } from "../XMLUtils";
import { ContentModel } from './ContentModel';
import { AttributeInfo, AttributeUse, Grammar, GrammarType, QualifiedName, ValidationContext, ValidationResult } from '../grammar/Grammar';
import { AttDecl } from './AttDecl';
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

    validateElement(element: QualifiedName, content: ValidationContext): ValidationResult {
        const elementName = element.localName;
        const elementDecl = this.elementDeclMap.get(elementName);

        if (!elementDecl) {
            return ValidationResult.warning(`No declaration found for element '${elementName}'`);
        }

        return ValidationResult.success();
    }

    getElementAttributes(element: QualifiedName): Map<QualifiedName, AttributeInfo> {
        const elementName = element.localName;
        const result = new Map<QualifiedName, AttributeInfo>();

        const dtdAttributes = this.getElementAttributesMap(elementName);
        if (dtdAttributes) {
            dtdAttributes.forEach((attDecl: AttDecl, attName: string) => {
                const qname = QualifiedName.fromString(attName);
                const use = this.mapDTDAttributeUse(attDecl);
                const datatype = attDecl.getType();
                const defaultValue = attDecl.getDefaultValue();

                const attributeInfo = new AttributeInfo(qname, datatype, use, defaultValue);
                result.set(qname, attributeInfo);
            });
        }

        return result;
    }

    getDefaultAttributes(element: QualifiedName): Map<QualifiedName, string> {
        const elementName = element.localName;
        const result = new Map<QualifiedName, string>();

        const dtdAttributes = this.getElementAttributesMap(elementName);
        if (dtdAttributes) {
            dtdAttributes.forEach((attDecl: AttDecl, attName: string) => {
                const defaultValue = attDecl.getDefaultValue();
                if (defaultValue && attDecl.getDefaultDecl() !== '#IMPLIED' && attDecl.getDefaultDecl() !== '#REQUIRED') {
                    const qname = QualifiedName.fromString(attName);
                    result.set(qname, defaultValue);
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
}