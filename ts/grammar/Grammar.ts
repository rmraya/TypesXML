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

import { AttlistDecl } from "../dtd/AttlistDecl";
import { ElementDecl } from "../dtd/ElementDecl";
import { EntityDecl } from "../dtd/EntityDecl";
import { NotationDecl } from "../dtd/NotationDecl";
import { ContentModel } from "./ContentModel";

export class Grammar {

    private models: Map<string, ContentModel>;
    entitiesMap: Map<string, EntityDecl>;
    attributeListMap: Map<string, AttlistDecl>;
    elementDeclMap: Map<string, ElementDecl>;
    notationsMap: Map<string, NotationDecl>;

    constructor() {
        this.models = new Map();
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

    setNotationsMap(notationsMap: Map<string, NotationDecl>) {
        this.notationsMap = notationsMap;
    }

    setEntitiesMap(entitiesMap: Map<string, EntityDecl>) {
        this.entitiesMap = entitiesMap;
    }

    setAttributesMap(attributeListMap: Map<string, AttlistDecl>) {
        this.attributeListMap = attributeListMap;
    }

    setElementsMap(elementDeclMap: Map<string, ElementDecl>) {
        this.elementDeclMap = elementDeclMap;
    }
}