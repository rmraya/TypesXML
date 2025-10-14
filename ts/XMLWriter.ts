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

import { appendFileSync, writeFileSync } from "fs";
import { XMLDeclaration } from "./XMLDeclaration";
import { XMLDocument } from "./XMLDocument";
import { XMLNode } from "./XMLNode";

export class XMLWriter {

    file: string;
    options: any = {
        encoding: 'utf8'
    }
    started: boolean;

    constructor(file: string) {
        this.file = file;
        this.started = false;
    }

    writeNode(node: XMLNode): void {
        if (node instanceof XMLDeclaration) {
            let enc: string = node.getEncoding();
            if (enc === 'UTF-16LE') {
                this.options.encoding = 'utf16le';
                if (!this.started) {
                    // write BOM for UTF-16LE
                    writeFileSync(this.file, '\ufeff', this.options);
                    this.started = true;
                }
            }
        }
        if (!this.started) {
            this.started = true;
            writeFileSync(this.file, node.toString(), this.options);
            return;
        }
        appendFileSync(this.file, node.toString(), this.options);
    }

    writeString(str: string): void {
        if (!this.started) {
            this.started = true;
            writeFileSync(this.file, str, this.options);
            return;
        }
        appendFileSync(this.file, str, this.options);
    }

    static writeDocument(doc: XMLDocument, file: string): void {
        let options: any = {
            encoding: 'utf8'
        };
        let decl: XMLDeclaration | undefined = doc.getXmlDeclaration();
        if (decl && decl.getEncoding() === 'UTF-16LE') {
            options.encoding = 'utf16le';
        }
        if (options.encoding === 'utf16le') {
            // write BOM for UTF-16LE
            writeFileSync(file, '\ufeff' + doc.toString(), options);
            return;
        }
        writeFileSync(file, doc.toString(), options);
    }
}