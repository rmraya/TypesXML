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

import { XMLComment } from "../XMLComment";
import { ProcessingInstruction } from "../ProcessingInstruction";
import { TextNode } from "../TextNode";
import { XMLNode } from "../XMLNode";
import { XMLUtils } from "../XMLUtils";
import { AttlistDecl } from "./AttlistDecl";
import { ElementDecl } from "./ElementDecl";
import { EntityDecl } from "./EntityDecl";
import { NotationDecl } from "./NotationDecl";
import { Constants } from "../Constants";

export class InternalSubset implements XMLNode {

    content: Array<XMLNode>;

    constructor(declaration: string) {
        this.content = new Array();
        this.parseDeclaration(declaration.substring(1, declaration.length - 1));
    }

    parseDeclaration(declaration: string) {
        let pointer: number = 0;
        let inSubset: boolean = true;
        while (inSubset) {
            if (XMLUtils.lookingAt('<!ELEMENT', declaration, pointer)) {
                let index: number = declaration.indexOf('>', pointer);
                if (index === -1) {
                    throw new Error('Malformed element declaration');
                }
                let elementText: string = declaration.substring(pointer, index + '>'.length);
                this.content.push(new ElementDecl(elementText));
                pointer += elementText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<!ATTLIST', declaration, pointer)) {
                let index: number = declaration.indexOf('>', pointer);
                if (index === -1) {
                    throw new Error('Malformed attribute declaration');
                }
                let attListText: string = declaration.substring(pointer, index + '>'.length);
                this.content.push(new AttlistDecl(attListText));
                pointer += attListText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<!ENTITY', declaration, pointer)) {
                let index: number = declaration.indexOf('>', pointer);
                if (index === -1) {
                    throw new Error('Malformed entity declaration');
                }
                let entityDeclText: string = declaration.substring(pointer, index + '>'.length);
                this.content.push(new EntityDecl(entityDeclText));
                pointer += entityDeclText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<!NOTATION', declaration, pointer)) {
                let index: number = declaration.indexOf('>', pointer);
                if (index === -1) {
                    throw new Error('Malformed notation declaration');
                }
                let notationDeclText: string = declaration.substring(pointer, index + '>'.length);
                this.content.push(new NotationDecl(notationDeclText));
                pointer += notationDeclText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<?', declaration, pointer)) {
                let index: number = declaration.indexOf('?>', pointer);
                if (index === -1) {
                    throw new Error('Malformed processing instruction in internal subset');
                }
                let piText: string = declaration.substring(pointer, index + '?>'.length);
                this.content.push(ProcessingInstruction.parse(piText));
                pointer += piText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<!--', declaration, pointer)) {
                let index: number = declaration.indexOf('-->', pointer);
                if (index === -1) {
                    throw new Error('Malformed comment in internal subset');
                }
                let commentText: string = declaration.substring(pointer, index + '-->'.length);
                this.content.push(new XMLComment(commentText));
                pointer += commentText.length;
                continue;
            }
            if (XMLUtils.lookingAt('%', declaration, pointer)) {
                // Parameter-entity references 
                // TODO
            }
            let char: string = declaration.charAt(pointer);
            if (XMLUtils.isXmlSpace(char)) {
                if (this.content.length > 0 && this.content[this.content.length - 1].getNodeType() === Constants.TEXT_NODE) {
                    let lastNode: TextNode = this.content[this.content.length - 1] as TextNode;
                    lastNode.setValue(lastNode.getValue() + char);
                } else {
                    this.content.push(new TextNode(char));
                }
                pointer++;
                continue;
            }
            inSubset = false;
        }
    }

    getNodeType(): number {
        return Constants.INTERNAL_SUBSET_NODE;
    }

    toString(): string {
        let result: string = '[';
        this.content.forEach((value: XMLNode) => {
            result += value.toString();
        });
        return result + ']';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof InternalSubset) {
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