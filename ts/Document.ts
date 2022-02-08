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

import { Comment } from "./Comment";
import { Element } from "./Element";
import { ProcessingInstruction } from "./ProcessingInstruction";
import { TextNode } from "./TextNode";
import { XMLDeclaration } from "./XMLDeclaration";
import { XMLNode } from "./XMLNode";

export class Document implements XMLNode {

    static readonly DOCUMENT_NODE: number = 0;

    xmlDeclaration: XMLDeclaration;
    private root: Element;
    private content: Array<XMLNode>;

    constructor(name: string, xmlDeclaration: XMLDeclaration, prologContent: Array<XMLNode>) {
        this.xmlDeclaration = xmlDeclaration;
        this.content = new Array();
        for (let i = 0; i < prologContent.length; i++) {
            this.content.push(prologContent[i]);
        }
        this.root = new Element(name);
        this.content.push(this.root);
    }

    getRoot(): Element {
        return this.root;
    }

    addComment(comment: Comment): void {
        this.content.push(comment);
    }

    addProcessingInstruction(pi: ProcessingInstruction): void {
        this.content.push(pi);
    }

    addTextNode(node: TextNode): void {
        this.content.push(node);
    }

    getNodeType(): number {
        return Document.DOCUMENT_NODE;
    }

    toString(): string {
        let result: string = this.xmlDeclaration ? this.xmlDeclaration.toString() : '';
        this.content.forEach((value: XMLNode) => {
            result += value.toString();
        });
        return result;
    }

    equals(obj: XMLNode): boolean {
        if (obj instanceof Document) {
            let node = obj as Document;
            if (this.xmlDeclaration !== node.xmlDeclaration || this.content.length !== node.content.length) {
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