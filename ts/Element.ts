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

import { Attribute } from "./Attribute";
import { CData } from "./CData";
import { Comment } from "./Comment";
import { ProcessingInstruction } from "./ProcessingInstruction";
import { TextNode } from "./TextNode";
import { XMLNode } from "./XMLNode";

export class Element implements XMLNode {

    static readonly ELEMENT_NODE: number = 1;

    private name: string;
    private attributes: Map<string, Attribute>;
    private content: Array<XMLNode>;

    constructor(name: string) {
        this.name = name;
        this.attributes = new Map();
        this.content = new Array();
    }

    getName(): string {
        return this.name;
    }

    getNamespace(): string {
        if (this.name.indexOf(':') === -1) {
            return '';
        }
        return this.name.substring(0, this.name.indexOf(':'));
    }

    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }

    getAttribute(name: string): Attribute | null {
        if (this.attributes.has(name)) {
            return this.attributes.get(name);
        }
        return null;
    }

    setAttribute(attribute: Attribute) {
        this.attributes.set(attribute.getName(), attribute);
    }

    getAttributes(): Array<Attribute> {
        let result: Array<Attribute> = new Array();
        this.attributes.forEach((value) => {
            result.push(value);
        });
        return result;
    }

    addString(text: string): void {
        this.addTextNode(new TextNode(text));
    }

    addTextNode(node: TextNode): void {
        if (this.content.length > 0 && this.content[this.content.length - 1].getNodeType() === TextNode.TEXT_NODE) {
            let lastNode: TextNode = this.content[this.content.length - 1] as TextNode;
            lastNode.setValue(lastNode.getValue() + node.getValue());
            return;
        }
        this.content.push(node);
    }

    addElement(node: Element): void {
        this.content.push(node);
    }

    addComment(node: Comment): void {
        this.content.push(node);
    }

    addProcessingInstruction(node: ProcessingInstruction): void {
        this.content.push(node);
    }

    addCData(node: CData): void {
        this.content.push(node);
    }

    setContent(content: Array<XMLNode>): void {
        this.content = content;
    }

    getContent(): Array<XMLNode> {
        return this.content;
    }

    getNodeType(): number {
        return Element.ELEMENT_NODE;
    }

    toString(): string {
        let result: string = '<' + this.name;
        this.attributes.forEach((value: Attribute) => {
            result += ' ' + value.toString();
        });
        result += '>';
        if (this.content.length > 0) {
            this.content.forEach((value: XMLNode) => {
                result += value.toString();
            });
            return result + '</' + this.name + '>';
        }
        return result + '/>';
    }

    equals(obj: XMLNode): boolean {
        if (obj instanceof Element) {
            let node: Element = obj as Element;
            if (this.name !== node.name || this.attributes.size !== node.attributes.size || this.content.length !== node.content.length) {
                return false;
            }
            this.attributes.forEach((att) => {
                let other: Attribute | null = node.getAttribute(att.getName());
                if (other === null) {
                    return false;
                }
                if (att.getValue() !== other.getValue()) {
                    return false;
                }
            });
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