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

export class XMLWriter {

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
            const UTF16: Buffer = Buffer.from([-2, -1]);
            writeFileSync(file, UTF16, options);
            appendFileSync(file, doc.toString(), options);
            return;
        }
        writeFileSync(file, doc.toString(), options);
    }
}