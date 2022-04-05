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

import { Comment } from "../Comment";
import { ProcessingInstruction } from "../ProcessingInstruction";
import { TextNode } from "../TextNode";
import { XMLNode } from "../XMLNode";
import { XMLUtils } from "../XMLUtils";
import { AttlistDecl } from "./AttlistDecl";
import { ElementDecl } from "./ElementDecl";
import { EntityDecl } from "./EntityDecl";
import { NotationDecl } from "./NotationDecl";

export class InternalSubset implements XMLNode {

    static readonly INTERNAL_SUBSET: number = 12;

    content: Array<XMLNode>;

    constructor(declaration: string) {
        this.content = new Array();
        let length = declaration.length;
        this.parseDeclaration(declaration.substring(1, length - 1));
    }

    parseDeclaration(declaration: string) {
        let pointer: number = 0;
        let inSubset = true;
        while (inSubset) {
            if (XMLUtils.lookingAt('<!ELEMENT', declaration, pointer)) {
                let index = declaration.indexOf('>', pointer);
                if (index === -1) {
                    throw new Error('Malformed element declaration');
                }
                let elementText = declaration.substring(pointer, index + '>'.length);
                this.content.push(new ElementDecl(elementText));
                pointer += elementText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<!ATTLIST', declaration, pointer)) {
                let index = declaration.indexOf('>', pointer);
                if (index === -1) {
                    throw new Error('Malformed attribute declaration');
                }
                let attListText = declaration.substring(pointer, index + '>'.length);
                this.content.push(new AttlistDecl(attListText));
                pointer += attListText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<!ENTITY', declaration, pointer)) {
                let index = declaration.indexOf('>', pointer);
                if (index === -1) {
                    throw new Error('Malformed entity declaration');
                }
                let entityDeclText = declaration.substring(pointer, index + '>'.length);
                this.content.push(new EntityDecl(entityDeclText));
                pointer += entityDeclText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<!NOTATION', declaration, pointer)) {
                let index = declaration.indexOf('>', pointer);
                if (index === -1) {
                    throw new Error('Malformed notation declaration');
                }
                let notationDeclText = declaration.substring(pointer, index + '>'.length);
                this.content.push(new NotationDecl(notationDeclText));
                pointer += notationDeclText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<?', declaration, pointer)) {
                let index = declaration.indexOf('?>', pointer);
                if (index === -1) {
                    throw new Error('Malformed processing instruction in internal subset');
                }
                let piText = declaration.substring(pointer, index + '?>'.length);
                this.content.push(new ProcessingInstruction(piText));
                pointer += piText.length;
                continue;
            }
            if (XMLUtils.lookingAt('<!--', declaration, pointer)) {
                let index = declaration.indexOf('-->', pointer);
                if (index === -1) {
                    throw new Error('Malformed comment in internal subset');
                }
                let commentText = declaration.substring(pointer, index + '-->'.length);
                this.content.push(new Comment(commentText));
                pointer += commentText.length;
                continue;
            }
            if (XMLUtils.lookingAt('%', declaration, pointer)) {
                // Parameter-entity references 
                // TODO
            }
            let char: string = declaration.charAt(pointer);
            if (XMLUtils.isXmlSpace(char)) {
                if (this.content.length > 0 && this.content[this.content.length - 1].getNodeType() === TextNode.TEXT_NODE) {
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
        return InternalSubset.INTERNAL_SUBSET;
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