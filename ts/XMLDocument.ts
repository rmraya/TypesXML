/*******************************************************************************
 * Copyright (c) 2023 - 2024 Maxprograms.
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
import { ProcessingInstruction } from "./ProcessingInstruction";
import { TextNode } from "./TextNode";
import { XMLComment } from "./XMLComment";
import { XMLDeclaration } from "./XMLDeclaration";
import { XMLDocumentType } from "./XMLDocumentType";
import { XMLElement } from "./XMLElement";
import { XMLNode } from "./XMLNode";
import { XMLUtils } from "./XMLUtils";

export class XMLDocument implements XMLNode {

    private content: Array<XMLNode>;

    constructor() {
        this.content = new Array();
    }

    contentIterator(): IterableIterator<XMLNode> {
        return this.content.values();
    }

    setRoot(root: XMLElement): void {
        this.content.push(root);
    }

    getRoot(): XMLElement | undefined {
        for (let node of this.content) {
            if (node instanceof XMLElement) {
                return node;
            }
        }
        return undefined;
    }

    setDocumentType(documentType: XMLDocumentType): void {
        this.content.push(documentType);
    }

    getDocumentType(): XMLDocumentType | undefined {
        for (let node of this.content) {
            if (node instanceof XMLDocumentType) {
                return node;
            }
        }
        return undefined;
    }

    setXmlDeclaration(declaration: XMLDeclaration): void {
        this.content.unshift(declaration);
    }

    getXmlDeclaration(): XMLDeclaration | undefined {
        if (this.content[0] instanceof XMLDeclaration) {
            return this.content[0];
        }
        return undefined;
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
        let xmlDeclaration: XMLDeclaration | undefined = this.getXmlDeclaration();
        if (xmlDeclaration) {
            isXml10 = xmlDeclaration.getVersion() === '1.0';
        }
        this.content.forEach((node: XMLNode) => {
            result += isXml10 ? XMLUtils.validXml10Chars(node.toString()) : XMLUtils.validXml11Chars(node.toString());
        });
        return result;
    }

    equals(node: XMLNode): boolean {
        if (node instanceof XMLDocument) {
            if (this.content.length !== node.content.length) {
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