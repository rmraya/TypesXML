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

import { appendFileSync, writeFileSync } from "fs";
import { XMLDeclaration } from "./XMLDeclaration";
import { XMLDocument } from "./XMLDocument";
import { XMLNode } from "./XMLNode";

export class XMLWriter {

    static UTF16: Buffer = Buffer.from([-2, -1]);

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
                // write BOM for UTF-16LE
                this.options.encoding = 'utf16le';
                writeFileSync(this.file, XMLWriter.UTF16, this.options);
                this.started = true;
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
        let decl: XMLDeclaration = doc.getXmlDeclaration();
        if (decl && decl.getEncoding() === 'UTF-16LE') {
            options.encoding = 'utf16le';
        }
        if (options.encoding === 'utf16le') {
            // write BOM for UTF-16LE
            writeFileSync(file, XMLWriter.UTF16, options);
            appendFileSync(file, doc.toString(), options);
            return;
        }
        writeFileSync(file, doc.toString(), options);
    }
}