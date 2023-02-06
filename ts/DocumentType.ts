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
import { DTDParser } from "./dtd/DTDParser";
import { InternalSubset } from "./dtd/InternalSubset";
import { Grammar } from "./grammar/Grammar";
import { XMLNode } from "./XMLNode";
import { XMLUtils } from "./XMLUtils";

export class DocumentType implements XMLNode {

    private name: string;
    private systemId: string;
    private publicId: string;
    private internalSubset: InternalSubset;
    private internalGrammar: Grammar;

    constructor(declaration: string) {
        this.name = '';
        let i: number = '<!DOCTYPE'.length;
        // skip spaces before root name
        for (; i < declaration.length; i++) {
            let char: string = declaration.charAt(i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        for (; i < declaration.length; i++) {
            let char: string = declaration.charAt(i);
            if (XMLUtils.isXmlSpace(char)) {
                break
            }
            this.name += char;
        }
        // skip spaces after root name
        for (; i < declaration.length; i++) {
            let char: string = declaration.charAt(i);
            if (!XMLUtils.isXmlSpace(char)) {
                break;
            }
        }
        if (XMLUtils.lookingAt('[', declaration, i)) {
            let index = declaration.indexOf(']', i);
            if (i === -1) {
                throw new Error('Malformed Internal Subset declaration');
            }
            let subset: string = declaration.substring(i, index + 1);
            this.internalSubset = new InternalSubset(subset);
            this.internalGrammar = new DTDParser().parse(subset);
        }
        if (XMLUtils.lookingAt('PUBLIC', declaration, i)) {
            // TODO
        }
        if (XMLUtils.lookingAt('SYSTEM', declaration, i)) {
            // TODO
        }
    }

    setSystemId(systemId: string): void {
        this.systemId = systemId;
    }

    getSystemId(): string {
        return this.systemId;
    }

    setPublicId(publicId: string): void {
        this.publicId = publicId;
    }

    getPublicId(): string {
        return this.publicId;
    }

    setInternalSubset(subset: InternalSubset): void {
        this.internalSubset = subset;
    }

    getInternalSubset(): InternalSubset {
        return this.internalSubset;
    }

    getNodeType(): number {
        return Constants.DOCUMENT_TYPE_NODE;
    }

    toString(): string {
        let doctype: string = '<!DOCTYPE ' + this.name;
        if (this.publicId && this.systemId) {
            doctype += ' PUBLIC "' + this.publicId + '" "' + this.systemId + '"';
        } else if (this.systemId) {
            doctype += ' SYSTEM "' + this.systemId + '"';
        }
        if (this.internalSubset) {
            doctype += ' ' + this.internalSubset.toString();
        }
        return doctype + '>';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof DocumentType) {
            return this.publicId === node.publicId && this.systemId === node.systemId;
        }
        return false;
    }
}