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

import { writeFileSync } from "fs";
import { XMLDocument } from "./XMLDocument";

export class XMLWriter {

    static writeDocument(doc: XMLDocument, file: string): void {
        writeFileSync(file, doc.toString());
    }
}