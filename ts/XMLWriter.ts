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

import { writeFileSync } from "fs";
import { XMLDeclaration } from "./XMLDeclaration";
import { XMLDocument } from "./XMLDocument";

export class XMLWriter {

    static writeDocument(doc: XMLDocument, file: string): void {
        let options: any = {
            encoding: 'utf8'
        };
        let decl: XMLDeclaration = doc.getXmlDeclaration();
        if (decl) {
            options.encoding = decl.getEncoding();
        }
        writeFileSync(file, doc.toString(), options);
    }
}