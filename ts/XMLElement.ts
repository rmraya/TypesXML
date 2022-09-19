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

import { XMLAttribute } from "./XMLAttribute";
import { CData } from "./CData";
import { XMLComment } from "./XMLComment";
import { ProcessingInstruction } from "./ProcessingInstruction";
import { TextNode } from "./TextNode";
import { XMLNode } from "./XMLNode";
import { Constants } from "./Constants";

export class XMLElement implements XMLNode {

    private name: string;
    private attributes: Map<string, XMLAttribute>;
    private content: Array<XMLNode>;

    constructor(name: string) {
        this.name = name;
        this.attributes = new Map<string, XMLAttribute>();
        this.content = new Array<XMLNode>();
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

    getAttribute(name: string): XMLAttribute | undefined {
        return this.attributes.get(name);
    }

    setAttribute(attribute: XMLAttribute) {
        this.attributes.set(attribute.getName(), attribute);
    }

    getAttributes(): Array<XMLAttribute> {
        let result: Array<XMLAttribute> = new Array();
        this.attributes.forEach((value) => {
            result.push(value);
        });
        return result;
    }

    addString(text: string): void {
        this.addTextNode(new TextNode(text));
    }

    addTextNode(node: TextNode): void {
        if (this.content.length > 0 && this.content[this.content.length - 1].getNodeType() === Constants.TEXT_NODE) {
            let lastNode: TextNode = this.content[this.content.length - 1] as TextNode;
            lastNode.setValue(lastNode.getValue() + node.getValue());
            return;
        }
        this.content.push(node);
    }

    addElement(node: XMLElement): void {
        this.content.push(node);
    }

    addComment(node: XMLComment): void {
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
        return Constants.ELEMENT_NODE;
    }

    toString(): string {
        let result: string = '<' + this.name;
        this.attributes.forEach((value: XMLAttribute) => {
            result += ' ' + value.toString();
        });
        if (this.content.length > 0) {
            result += '>';
            this.content.forEach((node: XMLNode) => {
                result += node.toString();
            });
            return result + '</' + this.name + '>';
        }
        return result + '/>';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof XMLElement) {
            if (this.name !== node.name || this.attributes.size !== node.attributes.size || this.content.length !== node.content.length) {
                return false;
            }
            let sameAttributes: boolean = true;
            this.attributes.forEach((att: XMLAttribute, key: string) => {
                let other: XMLAttribute = node.getAttribute(key);
                if (other === undefined || att.getValue() !== other.getValue()) {
                    sameAttributes = false;
                }
            });
            if (!sameAttributes) {
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

    getChildren(): Array<XMLElement> {
        let result: Array<XMLElement> = new Array<XMLElement>();
        this.content.forEach((node: XMLNode) => {
            if (node instanceof XMLElement) {
                result.push(node);
            }
        });
        return result;
    }

    getChild(childName: string): XMLElement | undefined {
        let result: XMLElement = undefined;
        let length: number = this.content.length;
        for (let i: number = 0; i < length; i++) {
            let node: XMLNode = this.content[i];
            if (node instanceof XMLElement) {
                let child: XMLElement = node as XMLElement;
                if (child.getName() === childName) {
                    result = child;
                    break;
                }
            }
        }
        return result;
    }

    getText(): string {
        let result: string = '';
        this.content.forEach((node: XMLNode) => {
            if (node instanceof TextNode) {
                result += (node as TextNode).getValue();
            }
            if (node instanceof XMLElement) {
                result += (node as XMLElement).getText();
            }
        });
        return result;
    }

    getPI(target: string): ProcessingInstruction | undefined {
        let result: ProcessingInstruction = undefined;
        let length: number = this.content.length;
        for (let i: number = 0; i < length; i++) {
            let node: XMLNode = this.content[i];
            if (node instanceof ProcessingInstruction) {
                let pi: ProcessingInstruction = node as ProcessingInstruction;
                if (pi.getTarget() === target) {
                    result = pi;
                    break;
                }
            }
        }
        return result;
    }
}