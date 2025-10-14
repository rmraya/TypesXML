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
    documentType: XMLDocumentType | undefined;

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
        this.documentType = documentType;
        this.content.push(documentType);
    }

    getDocumentType(): XMLDocumentType | undefined {
        return this.documentType;
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
            for (let i: number = 0; i < this.content.length; i++) {
                if (!this.content[i].equals(node.content[i])) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }
}