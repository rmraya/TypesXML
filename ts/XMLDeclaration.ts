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
import { XMLNode } from "./XMLNode";

export class XMLDeclaration implements XMLNode {

    private version: string;
    private encoding: string;
    private standalone: string | undefined;

    constructor(version: string, encoding: string, standalone?: string) {
        if (version !== '' && !('1.0' === version || '1.1' === version)) {
            throw new Error('Incorrect XML version');
        }
        this.version = version;
        this.encoding = encoding;
        if (standalone !== undefined) {
            if (!('yes' === standalone || 'no' === standalone)) {
                throw new Error('Incorrect "standalone" value');
            }
            this.standalone = standalone;
        }
    }

    getVersion(): string {
        return this.version;
    }

    setVersion(version: string): void {
        this.version = version;
    }

    getEncoding(): string {
        return this.encoding;
    }

    setEncoding(encoding: string): void {
        this.encoding = encoding;
    }

    getStandalone(): string | undefined {
        return this.standalone;
    }

    setStandalone(standalone: string): void {
        this.standalone = standalone;
    }

    getNodeType(): number {
        return Constants.XML_DECLARATION_NODE;
    }

    toString(): string {
        return '<?xml'
            + (this.version !== '' ? ' version="' + this.version + '"' : '')
            + (this.encoding !== '' ? ' encoding="' + this.encoding + '"' : '')
            + (this.standalone ? ' standalone="' + this.standalone + '"' : '')
            + '?>';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof XMLDeclaration) {
            return this.version === node.version
                && this.encoding === node.encoding
                && this.standalone === node.standalone;
        }
        return false;
    }

}