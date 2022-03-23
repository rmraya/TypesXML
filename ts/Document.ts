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
import { DocumentType } from "./DocumentType";
import { Element } from "./Element";
import { ProcessingInstruction } from "./ProcessingInstruction";
import { TextNode } from "./TextNode";
import { XMLDeclaration } from "./XMLDeclaration";
import { XMLNode } from "./XMLNode";
import { XMLUtils } from "./XMLUtils";

export class Document implements XMLNode {

    static readonly DOCUMENT_NODE: number = 0;

    xmlDeclaration: XMLDeclaration;
    documentType: DocumentType;
    private root: Element;
    private content: Array<XMLNode>;

    constructor(name: string, xmlDeclaration: XMLDeclaration, prologContent: Array<XMLNode>) {
        this.xmlDeclaration = xmlDeclaration;
        this.content = new Array();
        prologContent.forEach((node: XMLNode) => {
            if (node instanceof DocumentType) {
                this.documentType = node;
            }
            this.content.push(node);
        });
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
        let isXml10: boolean = this.xmlDeclaration.getVersion() === '1.0';
        this.content.forEach((node: XMLNode) => {
            result += isXml10 ? XMLUtils.validXml10Chars(node.toString()) : XMLUtils.validXml11Chars(node.toString());
        });
        return result;
    }

    equals(node: XMLNode): boolean {
        if (node instanceof Document) {
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