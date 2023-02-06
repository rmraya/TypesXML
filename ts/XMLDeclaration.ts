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
import { XMLNode } from "./XMLNode";
import { XMLUtils } from "./XMLUtils";

export class XMLDeclaration implements XMLNode {

    private version: string;
    private encoding: string;
    private standalone: string;

    constructor(version: string, encoding: string, standalone?: string) {
        if (!('1.0' === version || '1.1' === version)) {
            throw new Error('Incorrect XML version');
        }
        this.version = version;
        this.encoding = encoding;
        if ( standalone !== undefined) {
            if (!('yes' === standalone || 'no' === standalone)) {
                throw new Error('Incorrect "standalone" value');
            }
            this.standalone = standalone;
        }
    }

    static parse(declarationText: string): XMLDeclaration {
        let declaration: XMLDeclaration = new XMLDeclaration('1.0', 'UTF-8');
        let attributesPortion = declarationText.substring('<?xml'.length, declarationText.length - '?>'.length);
        declaration.parseAttributes(attributesPortion.trim());
        return declaration;
    }

    parseAttributes(text: string): void {
        let pairs: string[] = [];
        let separator: string = '';
        while (text.indexOf('=') != -1) {
            let i: number = 0;
            for (; i < text.length; i++) {
                let char = text[i];
                if (XMLUtils.isXmlSpace(char) || '=' === char) {
                    break;
                }
            }
            for (; i < text.length; i++) {
                let char = text[i];
                if (separator === '' && ('\'' === char || '"' === char)) {
                    separator = char;
                    continue;
                }
                if (char === separator) {
                    break;
                }
            }
            // end of value
            let pair = text.substring(0, i + 1).trim();
            pairs.push(pair);
            text = text.substring(pair.length).trim();
            separator = '';
        }
        pairs.forEach((pair: string) => {
            this.setValues(pair);
        });
    }

    setValues(pair: string): void {
        let index = pair.indexOf('=');
        if (index === -1) {
            throw new Error('Malformed XML declaration');
        }
        let name = pair.substring(0, index).trim();
        let value = pair.substring(index + 1).trim();
        value = value.substring(1, value.length - 1);
        if (name === 'version') {
            this.version = value;
        }
        if (name === 'encoding') {
            this.encoding = value;
        }
        if (name === 'standalone') {
            this.standalone = value;
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

    getStandalone(): string {
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