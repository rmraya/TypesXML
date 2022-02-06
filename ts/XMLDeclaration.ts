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

import { XMLNode } from "./XMLNode";

export class XMLDeclaration implements XMLNode {

    static readonly XML_DECLARATION: number = 8;

    private version: string;
    private encoding: string;
    private standalone: string;

    constructor() {
        this.version = '';
        this.encoding = '';
        this.standalone = '';
    }

    getVersion(): string {
        return this.version;
    }

    setVersion(version: string): void {
        this.version = version;
    }

    getEncoding(): string {
        return this.version;
    }

    setEncoding(encoding: string): void {
        this.encoding = encoding;
    }

    getStandalone(): string {
        return this.standalone;
    }

    setStandalone(standalone: string): void {
        this.standalone = standalone;
    }

    getNodeType(): number {
        return XMLDeclaration.XML_DECLARATION;
    }

    toString(): string {
        return '<?xml'
            + (this.version !== '' ? ' version="' + this.version + '"' : '')
            + (this.encoding !== '' ? ' encoding="' + this.encoding + '"' : '')
            + (this.standalone !== '' ? ' standalone="' + this.standalone + '"' : '')
            + '?>';
    }

    equals(obj: XMLNode): boolean {
        if (obj instanceof XMLDeclaration) {
            let node: XMLDeclaration = obj as XMLDeclaration;
            return this.version === node.version
                && this.encoding === node.encoding
                && this.standalone === node.standalone;
        }
        return false;
    }

}