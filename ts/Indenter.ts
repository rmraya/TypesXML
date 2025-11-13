/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
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
import { TextNode } from "./TextNode";
import { XMLAttribute } from "./XMLAttribute";
import { XMLElement } from "./XMLElement";
import { XMLNode } from "./XMLNode";
import { XMLUtils } from "./XMLUtils";

export class Indenter {

    private numSpaces: number;
    private indentLevel: number;

    constructor(spaces: number, level?: number) {
        this.numSpaces = spaces;
        if (level !== undefined) {
            this.indentLevel = level;
        } else {
            this.indentLevel = 1;
        }
    }

    setSpaces(spaces: number): void {
        this.numSpaces = spaces;
    }

    setLevel(level: number): void {
        this.indentLevel = level;
    }

    indent(e: XMLElement): void {
        let space: XMLAttribute | undefined = e.getAttribute('xml:space');
        if (space && 'preserve' === space.getValue()) {
            return;
        }
        if (!this.hasText(e)) {
            this.indentElement(e);
        }
        this.indentLevel++;
        let children: Array<XMLElement> = e.getChildren();
        children.forEach((child: XMLElement) => {
            this.indent(child);
        });
        this.indentLevel--;
    }

    private indentElement(e: XMLElement) {
        let start: string = '\n';
        let end: string = '\n';
        for (let i: number = 0; i < (this.indentLevel * this.numSpaces); i++) {
            start += ' ';
        }
        for (let i: number = 0; i < ((this.indentLevel - 1) * this.numSpaces); i++) {
            end += ' ';
        }
        let content: Array<XMLNode> = new Array<XMLNode>();
        let nodes: Array<XMLNode> = e.getContent();
        nodes.forEach((node: XMLNode) => {
            if (!(node instanceof TextNode)) {
                content.push(new TextNode(start));
                content.push(node);
            }
        });
        if (content.length !== 0) {
            content.push(new TextNode(end));
        }
        e.setContent(content);
    }

    private hasText(e: XMLElement): boolean {
        let result: boolean = false;
        let content: Array<XMLNode> = e.getContent();
        content.forEach((node) => {
            if (node.getNodeType() === Constants.TEXT_NODE) {
                let text: string = (node as TextNode).getValue();
                let length: number = text.length;
                for (let i: number = 0; i < length; i++) {
                    if (!XMLUtils.isXmlSpace(text.charAt(i))) {
                        result = true;
                        break;
                    }
                }
            }
        });
        return result;
    }
}