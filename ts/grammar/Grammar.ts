/*******************************************************************************
 * Copyright (c) 2023 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { XMLUtils } from "../XMLUtils";
import { AttlistDecl } from "../dtd/AttlistDecl";
import { ElementDecl } from "../dtd/ElementDecl";
import { EntityDecl } from "../dtd/EntityDecl";
import { NotationDecl } from "../dtd/NotationDecl";
import { ContentModel } from "./ContentModel";

export class Grammar {

    private models: Map<string, ContentModel>;

    private entitiesMap: Map<string, EntityDecl>;
    private attributeListMap: Map<string, AttlistDecl>;
    private elementDeclMap: Map<string, ElementDecl>;
    private notationsMap: Map<string, NotationDecl>;

    constructor() {
        this.models = new Map();
        this.elementDeclMap = new Map();
        this.attributeListMap = new Map();
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

    getContentModel(elementName: string): ContentModel {
        return this.models.get(elementName);
    }

    toString(): string {
        let result: string;
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

    resolveParameterEntities(text: string): string {
        while (XMLUtils.hasParameterEntity(text)) {
            let start = text.indexOf('%');
            let end = text.indexOf(';');
            let entityName = text.substring(start + '%'.length, end);
            let entity: EntityDecl = this.getEntity(entityName);
            if (entity === undefined) {
                throw new Error('Unknown entity: ' + entityName);
            }
            text = text.replace('%' + entityName + ';', entity.getValue());
        }
        return text;
    }

    addAttributesList(attList: AttlistDecl) {
        if (!this.attributeListMap.has(attList.getName())) {
            this.attributeListMap.set(attList.getName(), attList);
        }
    }

    addEntity(entityDecl: EntityDecl) {
        if (!this.entitiesMap.has(entityDecl.getName())) {
            this.entitiesMap.set(entityDecl.getName(), entityDecl);
        }
    }

    getEntity(entityName: string): EntityDecl {
        return this.entitiesMap.get(entityName);
    }

    addNotation(notation: NotationDecl) {
        if (!this.notationsMap.has(notation.getName())) {
            this.notationsMap.set(notation.getName(), notation);
        }
    }

    merge(grammar: Grammar): void {
        this.entitiesMap = new Map([...this.entitiesMap, ...grammar.getEntitiesMap()]);
        this.attributeListMap = new Map([...this.attributeListMap, ...grammar.getAttributeListMap()]);
        this.elementDeclMap = new Map([...this.elementDeclMap, ...grammar.getElementDeclMap()]);
        this.notationsMap = new Map([...this.notationsMap, ...grammar.getNotationsMap()]);
    }

    getNotationsMap(): Map<string, NotationDecl> {
        return this.notationsMap;
    }

    getElementDeclMap(): Map<string, ElementDecl> {
        return this.elementDeclMap;
    }

    getAttributeListMap(): Map<string, AttlistDecl> {
        return this.attributeListMap;
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
            let model: ContentModel = new ContentModel(name, contentSpec);
            this.models.set(name, model);
        });
        this.attributeListMap.forEach((attList: AttlistDecl) => {
            let name: string = attList.getName();
            if (XMLUtils.hasParameterEntity(name)) {
                name = this.resolveParameterEntities(name);
            }
            let model: ContentModel = this.models.get(name);
            if (model) {
                model.addAttributes(attList.getAttributes());
            }
            this.models.set(name, model);
        });
    }

}