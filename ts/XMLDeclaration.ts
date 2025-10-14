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