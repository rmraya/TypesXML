/*******************************************************************************
 * Copyright (c) 2022 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { XMLNode } from "./XMLNode";
import { Element } from "./Element";

export class Document implements XMLNode {

    static readonly DOCUMENT_NODE: number = 0;

    private systemId: string;
    private publicId: string;
    private root: Element;
    private internalSubSet: string;
    private entities: Map<string, string>;
    private encoding: string;
    private content: Array<XMLNode>;

    constructor(name: string, systemId: string, publicId: string) {
        this.systemId = systemId;
        this.publicId = publicId;
        this.root = new Element(name);
        this.content = new Array();
        this.content.push(this.root);
        this.internalSubSet = '';
        this.entities = new Map();
        this.encoding = 'UTF-8';
    }

    setRoot(root: Element): void {
        this.root = root;
        for (let i = 0; i < this.content.length; i++) {
            if (this.content[i].getNodeType() === Element.ELEMENT_NODE) {
                this.content.splice(i, 1, root);
                break;
            }
        }
    }

    getRoot(): Element {
        return this.root;
    }

    setSystemId(systemId: string): void {
        this.systemId = systemId;
    }

    getSystemId(): string {
        return this.systemId;
    }

    setPublicId(publicId: string): void {
        this.publicId = publicId;
    }

    getPublicId(): string {
        return this.publicId;
    }

    setEncoding(encoding: string): void {
        this.encoding = encoding;
    }

    getEncoding(): string {
        return this.encoding;
    }

    setEntities(entities: Map<string, string>): void {
        this.entities = entities;
    }

    getEntities(): Map<string, string> {
        return this.entities;
    }

    setInternalSubSet(internalSubSet: string): void {
        this.internalSubSet = internalSubSet;
    }

    getInternalSubSet(): string {
        return this.internalSubSet;
    }

    getNodeType(): number {
        return Document.DOCUMENT_NODE;
    }

    toString(): string {
        let result: string = '<?xml version="1.0" encoding="' + this.encoding + '"?>\n';
        if (this.systemId !== '' || this.publicId !== '') {
            result += '<!DOCTYPE ' + this.root.getName();
            if (this.publicId !== '' && this.systemId !== '') {
                result += ' PUBLIC "' + this.publicId + '" "' + this.systemId + '"'
            }
            if (this.systemId !== '' && this.publicId === '') {
                result += ' SYSTEM "' + this.systemId + '"';
            }
            result += '>\n';
        }
        // TODO handle internal subset and entities
        this.content.forEach((value: XMLNode) => {
            result += value.toString();
        });
        return result;
    }

    equals(obj: XMLNode): boolean {
        if (obj instanceof Document) {
            let node = obj as Document;
            if (this.systemId !== node.systemId || this.publicId !== node.publicId || this.internalSubSet !== node.internalSubSet
                || this.encoding !== node.encoding || this.content.length !== node.content.length || this.entities.size !== node.entities.size) {
                return false;
            }
            let sameEntities: boolean = true;
            this.entities.forEach((value: string, key: string) => {
                if (value !== node.entities.get(key)) {
                    sameEntities = false;
                }
            });
            if (!sameEntities) {
                return false;
            }
            for (let i = 0; i < this.content.length; i++) {
                if (!this.content[i].equals(node.content[i])) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }
}