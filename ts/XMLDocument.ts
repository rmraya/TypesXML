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

import { Constants } from "./Constants";
import { DocumentType } from "./DocumentType";
import { ProcessingInstruction } from "./ProcessingInstruction";
import { TextNode } from "./TextNode";
import { XMLComment } from "./XMLComment";
import { XMLDeclaration } from "./XMLDeclaration";
import { XMLElement } from "./XMLElement";
import { XMLNode } from "./XMLNode";
import { XMLUtils } from "./XMLUtils";

export class XMLDocument implements XMLNode {

    xmlDeclaration: XMLDeclaration | undefined;
    documentType: DocumentType;
    private root: XMLElement;
    private content: Array<XMLNode>;

    constructor(name: string, xmlDeclaration?: XMLDeclaration, prologContent?: Array<XMLNode>) {
        if (xmlDeclaration !== undefined) {
            this.xmlDeclaration = xmlDeclaration;
        }
        this.content = new Array();
        if (prologContent !== undefined) {
            prologContent.forEach((node: XMLNode) => {
                if (node instanceof DocumentType) {
                    this.documentType = node;
                }
                this.content.push(node);
            });
        }
        this.root = new XMLElement(name);
        this.content.push(this.root);
    }

    getRoot(): XMLElement {
        return this.root;
    }

    setXmlDeclaration(declaration: XMLDeclaration): void {
        this.xmlDeclaration = declaration;
    }

    getXmlDeclaration(): XMLDeclaration | undefined {
        return this.xmlDeclaration;
    }

    addComment(comment: XMLComment): void {
        this.content.push(comment);
    }

    addProcessingInstruction(pi: ProcessingInstruction): void {
        this.content.push(pi);
    }

    addTextNode(node: TextNode): void {
        this.content.push(node);
    }

    getNodeType(): number {
        return Constants.DOCUMENT_NODE;
    }

    toString(): string {
        let result: string = '';
        let isXml10: boolean = true;
        if (this.xmlDeclaration) {
            result += this.xmlDeclaration.toString() + '\n';
            isXml10 = this.xmlDeclaration.getVersion() === '1.0';
        }
        this.content.forEach((node: XMLNode) => {
            result += isXml10 ? XMLUtils.validXml10Chars(node.toString()) : XMLUtils.validXml11Chars(node.toString());
        });
        return result;
    }

    equals(node: XMLNode): boolean {
        if (node instanceof XMLDocument) {
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